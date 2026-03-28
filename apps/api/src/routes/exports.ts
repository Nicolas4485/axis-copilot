import { Router } from 'express'
import type { Request, Response } from 'express'
import PDFDocument from 'pdfkit'
import { prisma } from '../lib/prisma.js'
import { createExportSchema } from '../lib/schemas.js'
import { google } from '@axis/tools'

const { getValidToken, createDocument, appendText, createSpreadsheet, writeRange, formatSheet, sendEmail } = google

export const exportsRouter = Router()

/**
 * Fetch a valid Google access token for the current user.
 * Looks for any Google integration (they share one OAuth grant).
 */
async function getGoogleAccessToken(userId: string): Promise<string> {
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      provider: { in: ['GOOGLE_DOCS', 'GOOGLE_SHEETS', 'GMAIL', 'GOOGLE_DRIVE'] },
    },
  })

  if (!integration) {
    throw new Error('Google integration not connected. Visit /settings to connect Google.')
  }

  const encrypted = {
    accessToken: integration.accessToken,
    refreshToken: integration.refreshToken ?? '',
    expiresAt: integration.expiresAt ?? new Date(0),
  }

  return getValidToken(encrypted, async (updated) => {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: updated.accessToken,
        refreshToken: updated.refreshToken,
        expiresAt: updated.expiresAt,
      },
    })
  })
}

/**
 * Build a Markdown string from session messages.
 */
function buildMarkdownContent(
  session: { title: string | null; createdAt: Date; mode: string | null },
  messages: Array<{ role: string; content: string; createdAt: Date }>
): string {
  const lines: string[] = [
    `# ${session.title ?? 'Session Export'}`,
    `> Mode: ${session.mode ?? 'general'} | Date: ${session.createdAt.toISOString()}`,
    '',
  ]

  for (const msg of messages) {
    lines.push(`## ${msg.role === 'USER' ? 'You' : 'AXIS'} — ${msg.createdAt.toISOString()}`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build row data from messages for Google Sheets export.
 */
function buildSheetRows(
  messages: Array<{ role: string; content: string; createdAt: Date; mode: string | null }>
): string[][] {
  const header = ['Timestamp', 'Role', 'Mode', 'Content']
  const rows = messages.map((m) => [
    m.createdAt.toISOString(),
    m.role,
    m.mode ?? '',
    // Truncate long content for sheet cells
    m.content.length > 5000 ? m.content.slice(0, 4997) + '...' : m.content,
  ])
  return [header, ...rows]
}

// ─── POST /api/exports/:sessionId — Export a session ──────────────────────────

exportsRouter.post('/:sessionId', async (req: Request, res: Response) => {
  try {
    const parsed = createExportSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
        requestId: req.requestId,
      })
      return
    }

    const sessionId = req.params['sessionId']!
    const { destination, title, recipientEmail } = parsed.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const exportTitle = title ?? session.title ?? 'AXIS Session Export'
    const markdownContent = buildMarkdownContent(session, session.messages)

    let externalId: string | null = null
    let externalUrl: string | null = null

    switch (destination) {
      case 'MARKDOWN':
      case 'JSON': {
        const data =
          destination === 'JSON'
            ? { session: { id: session.id, title: session.title, mode: session.mode, createdAt: session.createdAt }, messages: session.messages }
            : markdownContent

        const record = await prisma.exportRecord.create({
          data: { sessionId, destination },
        })

        res.json({ exportId: record.id, destination, content: data, requestId: req.requestId })
        return
      }

      case 'GDOC': {
        const accessToken = await getGoogleAccessToken(req.userId!)

        const doc = await createDocument(accessToken, exportTitle)
        await appendText(accessToken, doc.documentId, markdownContent)

        externalId = doc.documentId
        externalUrl = `https://docs.google.com/document/d/${doc.documentId}`
        break
      }

      case 'GSHEET': {
        const accessToken = await getGoogleAccessToken(req.userId!)

        const sheet = await createSpreadsheet(accessToken, exportTitle, ['Transcript'])
        const rows = buildSheetRows(session.messages)
        await writeRange(accessToken, sheet.spreadsheetId, 'Transcript!A1', rows)
        await formatSheet(accessToken, sheet.spreadsheetId, 0, {
          headerBold: true,
          freezeRows: 1,
          columnWidths: [
            { column: 0, width: 180 }, // Timestamp
            { column: 1, width: 100 }, // Role
            { column: 2, width: 100 }, // Mode
            { column: 3, width: 600 }, // Content
          ],
        })

        externalId = sheet.spreadsheetId
        externalUrl = sheet.spreadsheetUrl
        break
      }

      case 'EMAIL': {
        if (!recipientEmail) {
          res.status(400).json({
            error: 'recipientEmail required for email export',
            code: 'MISSING_EMAIL',
            requestId: req.requestId,
          })
          return
        }

        const accessToken = await getGoogleAccessToken(req.userId!)

        // Convert markdown to minimal HTML for the email body
        const htmlBody = `<pre style="font-family: monospace; white-space: pre-wrap;">${markdownContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`

        const result = await sendEmail(accessToken, {
          to: recipientEmail,
          subject: exportTitle,
          body: htmlBody,
        })

        externalId = result.id
        break
      }
    }

    const record = await prisma.exportRecord.create({
      data: {
        sessionId,
        destination,
        ...(externalId ? { externalId } : {}),
        ...(externalUrl ? { externalUrl } : {}),
      },
    })

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
    const isAuthError = errorMsg.includes('Google integration not connected')
    res.status(isAuthError ? 400 : 500).json({
      error: isAuthError ? errorMsg : 'Export failed',
      code: isAuthError ? 'GOOGLE_NOT_CONNECTED' : 'EXPORT_ERROR',
      details: isAuthError ? undefined : errorMsg,
      requestId: req.requestId,
    })
  }
})

// ─── GET /api/exports/:sessionId/pdf — Stream a PDF download ──────────────────

exportsRouter.get('/:sessionId/pdf', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['sessionId']!

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' } }, client: true },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const filename = `axis-session-${sessionId.slice(0, 8)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('x-request-id', req.requestId ?? '')
    doc.pipe(res)

    // Title page
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#C8A96E').text('AXIS', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(16).font('Helvetica').fillColor('#333333').text(session.title ?? 'Session Transcript', { align: 'center' })
    doc.moveDown(0.3)

    if (session.client) {
      doc.fontSize(12).fillColor('#666666').text(`Client: ${session.client.name}`, { align: 'center' })
    }

    doc.fontSize(10).fillColor('#999999').text(`Mode: ${session.mode ?? 'general'} | ${session.createdAt.toLocaleDateString()}`, { align: 'center' })
    doc.moveDown(2)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke()
    doc.moveDown(1.5)

    // Messages
    for (const msg of session.messages) {
      const isUser = msg.role === 'USER'

      doc.fontSize(9).fillColor('#999999').text(
        `${isUser ? 'YOU' : 'AXIS'} — ${new Date(msg.createdAt).toLocaleString()}`,
      )
      doc.moveDown(0.3)

      doc.fontSize(10)
        .fillColor(isUser ? '#1a1a2e' : '#0d0d1a')
        .font(isUser ? 'Helvetica-Bold' : 'Helvetica')
        .text(msg.content, { lineGap: 4 })

      doc.moveDown(0.8)
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#EEEEEE').stroke()
      doc.moveDown(0.8)
    }

    // Footer
    doc.fontSize(8).fillColor('#CCCCCC').text(
      `Exported by AXIS — ${new Date().toISOString()}`,
      50, 760,
      { align: 'center', width: 495 }
    )

    doc.end()

    // Record the export (fire-and-forget — don't delay the PDF stream)
    prisma.exportRecord.create({
      data: { sessionId, destination: 'MARKDOWN', externalId: `pdf:${Date.now()}` },
    }).catch(() => { /* non-critical */ })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'PDF generation failed', code: 'PDF_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── GET /api/exports/:sessionId — List exports for a session ─────────────────

exportsRouter.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['sessionId']!

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const exports = await prisma.exportRecord.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ exports, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list exports', code: 'LIST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
