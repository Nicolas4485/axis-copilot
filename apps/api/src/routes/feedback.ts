// Output Feedback routes — correction learning loop
// POST /api/feedback          — submit rating + optional correction for any agent output
// POST /api/feedback/process  — process unlearned feedback into PROCEDURAL memory (cron)
// GET  /api/feedback/stats    — feedback quality metrics per agent

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const feedbackRouter = Router()

const SubmitFeedbackSchema = z.object({
  agentKey:      z.string().min(1),
  outputType:    z.string().min(1),                          // 'cim_analysis'|'memo_section'|'chat'|'email'
  outputRef:     z.string().optional(),                      // section name, message id, etc.
  sessionId:     z.string().optional(),
  dealId:        z.string().optional(),
  rating:        z.number().int().min(1).max(4),             // 1=wrong 2=ok 3=good 4=excellent
  originalText:  z.string().min(1),
  correctedText: z.string().optional(),
  comment:       z.string().max(1000).optional(),
})

/**
 * POST /api/feedback — submit feedback on any agent output
 */
feedbackRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = SubmitFeedbackSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
      return
    }

    const fb = await prisma.outputFeedback.create({
      data: {
        userId:        req.userId!,
        sessionId:     parsed.data.sessionId ?? null,
        dealId:        parsed.data.dealId ?? null,
        agentKey:      parsed.data.agentKey,
        outputType:    parsed.data.outputType,
        outputRef:     parsed.data.outputRef ?? null,
        rating:        parsed.data.rating,
        originalText:  parsed.data.originalText,
        correctedText: parsed.data.correctedText ?? null,
        comment:       parsed.data.comment ?? null,
        learned:       false,
      },
    })

    // If there's a correction (rating ≤ 2 with edit, or any correctedText),
    // immediately store it as PROCEDURAL memory so the next generation benefits
    if (parsed.data.correctedText && parsed.data.correctedText.trim().length > 0) {
      const memoryContent = buildProcedualMemory(
        parsed.data.agentKey,
        parsed.data.outputType,
        parsed.data.outputRef,
        parsed.data.originalText,
        parsed.data.correctedText,
        parsed.data.comment,
      )

      await prisma.agentMemory.create({
        data: {
          userId:     req.userId!,
          clientId:   null, // cross-client — applies to all deals
          memoryType: 'PROCEDURAL',
          content:    memoryContent,
          tags:       [parsed.data.agentKey, parsed.data.outputType, 'user_correction'],
        },
      })

      // Mark as learned
      await prisma.outputFeedback.update({
        where: { id: fb.id },
        data: { learned: true },
      })
    }

    res.status(201).json({ feedback: fb, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to save feedback', code: 'FEEDBACK_ERROR', details: msg })
  }
})

/**
 * POST /api/feedback/process — batch-process unlearned high-signal feedback into memory.
 * Call this on a cron (e.g. daily at 02:00 UTC). Also processes approved outputs (rating=4)
 * as positive examples the agents should replicate.
 */
feedbackRouter.post('/process', async (req: Request, res: Response) => {
  try {
    const unlearned = await prisma.outputFeedback.findMany({
      where: { userId: req.userId!, learned: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    let processed = 0
    for (const fb of unlearned) {
      let memoryContent: string | null = null

      if (fb.correctedText && fb.correctedText.trim().length > 0) {
        // Correction — already handled at submit time but catch any missed
        memoryContent = buildProcedualMemory(
          fb.agentKey, fb.outputType, fb.outputRef,
          fb.originalText, fb.correctedText, fb.comment
        )
      } else if (fb.rating === 4) {
        // Excellent output — store as positive example
        memoryContent = `POSITIVE EXAMPLE [${fb.agentKey}/${fb.outputType}${fb.outputRef ? `/${fb.outputRef}` : ''}]: ` +
          `The following output was rated excellent by Nicolas. Replicate this quality and style:\n\n${fb.originalText.slice(0, 2000)}`
      }

      if (memoryContent) {
        await prisma.agentMemory.create({
          data: {
            userId:     fb.userId,
            clientId:   null,
            memoryType: 'PROCEDURAL',
            content:    memoryContent,
            tags:       [fb.agentKey, fb.outputType, fb.rating === 4 ? 'positive_example' : 'user_correction'],
          },
        })
        await prisma.outputFeedback.update({ where: { id: fb.id }, data: { learned: true } })
        processed++
      }
    }

    res.json({ processed, total: unlearned.length, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to process feedback', code: 'FEEDBACK_PROCESS_ERROR', details: msg })
  }
})

/**
 * GET /api/feedback/stats — quality metrics per agent
 */
feedbackRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const byAgent = await prisma.outputFeedback.groupBy({
      by: ['agentKey'],
      where: { userId: req.userId! },
      _count: { _all: true },
      _avg:   { rating: true },
    })

    const correctionCount = await prisma.outputFeedback.count({
      where: { userId: req.userId!, correctedText: { not: null } },
    })

    const learnedCount = await prisma.outputFeedback.count({
      where: { userId: req.userId!, learned: true },
    })

    const totalCount = await prisma.outputFeedback.count({
      where: { userId: req.userId! },
    })

    res.json({
      totalFeedback: totalCount,
      correctionCount,
      learnedCount,
      overallRating: byAgent.length > 0
        ? (byAgent.reduce((s, a) => s + (a._avg.rating ?? 0), 0) / byAgent.length).toFixed(2)
        : null,
      byAgent: byAgent.map((a) => ({
        agentKey: a.agentKey,
        count:    a._count._all,
        avgRating: a._avg.rating?.toFixed(2) ?? null,
      })),
      requestId: req.requestId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch feedback stats', code: 'FEEDBACK_STATS_ERROR', details: msg })
  }
})

// ─── Helpers ──────────────────────────────────────────────────

function buildProcedualMemory(
  agentKey: string,
  outputType: string,
  outputRef: string | null | undefined,
  originalText: string,
  correctedText: string,
  comment: string | null | undefined,
): string {
  const ref = outputRef ? `/${outputRef}` : ''
  return `USER CORRECTION [${agentKey}/${outputType}${ref}]:
Nicolas reviewed an output and made the following correction. Apply this preference in all future outputs of this type.

ORIGINAL (do not replicate):
${originalText.slice(0, 800)}

CORRECTED (Nicolas's preferred version):
${correctedText.slice(0, 800)}
${comment ? `\nNicolas's note: "${comment}"` : ''}

When generating ${outputType} outputs${outputRef ? ` (section: ${outputRef})` : ''}, follow the corrected version's style, structure, and tone.`
}
