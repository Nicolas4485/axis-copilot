import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { createExportSchema } from '../lib/schemas.js'

export const exportsRouter = Router()

/**
 * POST /api/exports/:sessionId — Export a session
 *
 * Destinations: GDOC, GSHEET, EMAIL, MARKDOWN, JSON
 */
exportsRouter.post('/:sessionId', async (req: Request, res: Response) => {
  try {
    const parsed = createExportSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const sessionId = req.params['sessionId']!
    const { destination, title, recipientEmail } = parsed.data

    // Verify session ownership
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    // Build export content from session messages
    const exportContent = session.messages
      .map((m) => `**${m.role}** (${m.createdAt.toISOString()}):\n${m.content}`)
      .join('\n\n---\n\n')

    let externalId: string | null = null
    let externalUrl: string | null = null

    switch (destination) {
      case 'MARKDOWN':
      case 'JSON': {
        // Return content directly — no external service needed
        const data = destination === 'JSON'
          ? { session: { id: session.id, title: session.title }, messages: session.messages }
          : exportContent

        // Record the export
        const record = await prisma.exportRecord.create({
          data: { sessionId, destination },
        })

        res.json({
          exportId: record.id,
          destination,
          content: data,
          requestId: req.requestId,
        })
        return
      }

      case 'GDOC': {
        // TODO: Create Google Doc via @axis/tools/google
        // const doc = await createDocument(accessToken, title ?? session.title)
        // await appendText(accessToken, doc.documentId, exportContent)
        // externalId = doc.documentId
        // externalUrl = `https://docs.google.com/document/d/${doc.documentId}`
        externalId = `gdoc_${Date.now()}`
        externalUrl = `https://docs.google.com/document/d/${externalId}`
        break
      }

      case 'GSHEET': {
        // TODO: Create Google Sheet
        externalId = `gsheet_${Date.now()}`
        externalUrl = `https://docs.google.com/spreadsheets/d/${externalId}`
        break
      }

      case 'EMAIL': {
        if (!recipientEmail) {
          res.status(400).json({ error: 'recipientEmail required for email export', code: 'MISSING_EMAIL', requestId: req.requestId })
          return
        }
        // TODO: Send via Gmail
        // await sendEmail(accessToken, { to: recipientEmail, subject: title ?? session.title, body: exportContent })
        externalId = `email_${Date.now()}`
        break
      }
    }

    // Record the export
    const record = await prisma.exportRecord.create({
      data: {
        sessionId,
        destination,
        ...(externalId ? { externalId } : {}),
        ...(externalUrl ? { externalUrl } : {}),
      },
    })

    // Update session status
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXPORTED' },
    })

    res.json({
      exportId: record.id,
      destination,
      externalId,
      externalUrl,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Export failed', code: 'EXPORT_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
