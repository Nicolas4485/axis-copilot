// CIM Analysis route — SSE streaming pipeline for PE deal analysis
// POST /api/deals/:id/cim-analysis — accepts { documentId } or multipart file
// GET  /api/deals/:id/cim-analysis/latest — returns cached result if found

import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { fileTypeFromBuffer } from 'file-type'
import { prisma } from '../lib/prisma.js'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { IngestionPipeline } from '@axis/ingestion'
import { extractFinancials, formatFinancialsForPrompt } from '../../../../packages/ingestion/src/parsers/financial-extractor.js'
import type { FinancialExtraction } from '../../../../packages/ingestion/src/parsers/financial-extractor.js'
import { CimAnalyst } from '@axis/agents'
import type { CIMAnalysisResult } from '@axis/agents'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB for CIMs

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('CIM analysis only supports PDF files'))
    }
  },
})

const BodySchema = z.object({
  documentId: z.string().cuid().optional(),
})

export const cimAnalysisRouter = Router()

/**
 * POST /api/deals/:id/cim-analysis
 * Accepts: multipart/form-data { file } OR application/json { documentId }
 * Response: text/event-stream — progress events then { type: 'done', result }
 */
cimAnalysisRouter.post('/:id/cim-analysis', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  // Verify deal ownership
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
    select: { id: true, clientId: true },
  }).catch(() => null)

  if (!deal) {
    res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
    return
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data: Record<string, unknown>): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  let engine: InferenceEngine | null = null

  try {
    engine = new InferenceEngine()
    const rag = new RAGEngine({ engine, prisma })
    const clientId = deal.clientId

    let documentId: string | null = null
    let financialExtraction: FinancialExtraction | null = null

    // ─── File upload path ──────────────────────────────────────
    if (req.file) {
      const magicResult = await fileTypeFromBuffer(req.file.buffer)
      if (magicResult && magicResult.mime !== 'application/pdf') {
        sendEvent({ type: 'error', message: 'File must be a PDF' })
        res.end()
        engine.shutdown()
        return
      }

      sendEvent({ type: 'step', step: 'ingesting', progress: 3, message: 'Ingesting document...' })

      const pipeline = new IngestionPipeline({ prisma, engine })
      const ingestionResult = await pipeline.ingestDocument(
        req.file.buffer,
        req.file.originalname,
        'application/pdf',
        userId,
        {
          ...(clientId ? { clientId } : {}),
          dealId,
          sourceType: 'UPLOAD',
          enableChartExtraction: true,
        }
      )

      if (ingestionResult.status === 'FAILED') {
        sendEvent({ type: 'error', message: 'Document ingestion failed' })
        res.end()
        engine.shutdown()
        return
      }

      documentId = ingestionResult.documentId
      sendEvent({ type: 'step', step: 'ingesting', progress: 10, message: `Document ingested: ${ingestionResult.chunkCount} chunks` })

      // ─── Financial extraction (parallel benefit from having buffer) ──
      sendEvent({ type: 'step', step: 'ingesting', progress: 11, message: 'Extracting structured financials from PDF...' })
      try {
        financialExtraction = await extractFinancials(req.file.buffer)
        if (financialExtraction) {
          sendEvent({ type: 'step', step: 'ingesting', progress: 13, message: `Financial tables found: ${financialExtraction.years.length} years (${financialExtraction.confidence} confidence)` })
        } else {
          sendEvent({ type: 'step', step: 'ingesting', progress: 13, message: 'No structured financial tables detected in PDF' })
        }
      } catch (extractErr) {
        console.warn('[CimAnalysis] Financial extraction failed (non-fatal):', extractErr instanceof Error ? extractErr.message : extractErr)
      }

    } else {
      // ─── documentId path ──────────────────────────────────────
      const body = BodySchema.safeParse(req.body)
      if (!body.success || !body.data.documentId) {
        sendEvent({ type: 'error', message: 'Provide a file or documentId' })
        res.end()
        engine.shutdown()
        return
      }

      const reqDocId = body.data.documentId

      // Verify document belongs to this user
      const doc = await prisma.knowledgeDocument.findFirst({
        where: { id: reqDocId, userId },
        select: { id: true, sourcePath: true },
      })
      if (!doc) {
        sendEvent({ type: 'error', message: 'Document not found' })
        res.end()
        engine.shutdown()
        return
      }

      documentId = reqDocId

      // Try financial extraction from stored file if sourcePath is a local UPLOAD path
      if (doc.sourcePath) {
        try {
          const fs = await import('fs/promises')
          const fileBuffer = await fs.readFile(doc.sourcePath)
          financialExtraction = await extractFinancials(fileBuffer)
        } catch {
          // File not accessible — skip financial extraction
        }
      }
    }

    if (!documentId) {
      sendEvent({ type: 'error', message: 'No document to analyze' })
      res.end()
      engine.shutdown()
      return
    }

    // ─── Run CIM analysis ─────────────────────────────────────
    const analyst = new CimAnalyst(engine, prisma, rag)

    const financialOptions = financialExtraction
      ? {
          formattedBlock: formatFinancialsForPrompt(financialExtraction),
          rawData: financialExtraction as unknown as Record<string, unknown>,
        }
      : undefined

    const result: CIMAnalysisResult = await analyst.analyze(
      documentId,
      dealId,
      userId,
      clientId,
      (event) => sendEvent(event as unknown as Record<string, unknown>),
      financialOptions
    )

    sendEvent({ type: 'done', result })
    engine.shutdown()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    console.error('[CimAnalysis] Pipeline error:', message)
    sendEvent({ type: 'error', message })
    engine?.shutdown()
  } finally {
    res.end()
  }
})

/**
 * GET /api/deals/:id/cim-analysis/latest
 * Returns the most recent cached CIM analysis result for this deal, or 404.
 */
cimAnalysisRouter.get('/:id/cim-analysis/latest', async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  try {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId },
      select: { id: true },
    })

    if (!deal) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
      return
    }

    // Query memories where content contains the dealId — exclude ic_memo type
    // (both CIM analysis and IC memo are SEMANTIC; filter to CIM-only by excluding ic_memo tag)
    const memory = await prisma.agentMemory.findFirst({
      where: {
        userId,
        memoryType: 'SEMANTIC',
        content: { contains: dealId },
        NOT: { content: { contains: '"type":"ic_memo"' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!memory) {
      res.status(404).json({ error: 'No analysis found', code: 'NOT_FOUND' })
      return
    }

    try {
      const parsed = JSON.parse(memory.content) as Record<string, unknown>
      // Verify this memory is actually for this deal (content check)
      if (parsed['dealId'] !== dealId) {
        res.status(404).json({ error: 'No analysis found', code: 'NOT_FOUND' })
        return
      }
      const result = parsed as unknown as CIMAnalysisResult & { summary?: string }
      res.json({ result, createdAt: memory.createdAt })
    } catch {
      res.status(500).json({ error: 'Failed to parse cached analysis', code: 'PARSE_ERROR' })
    }
  } catch (err) {
    console.error('[CimAnalysis] GET latest error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to fetch analysis', code: 'INTERNAL_ERROR' })
  }
})
