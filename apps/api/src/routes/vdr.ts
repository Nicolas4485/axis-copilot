// VDR upload route — POST /api/deals/:id/vdr-upload
// Accepts a ZIP file, categorises contents via SDK VdrAgent, ingests in priority order.
// Streams progress as SSE events.

import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import { prisma } from '../lib/prisma.js'
import { IngestionPipeline } from '@axis/ingestion'
import { VdrAgent } from '@axis/sdk-agents'
import type { VdrFileEntry } from '@axis/sdk-agents'

const MAX_ZIP_SIZE  = 200 * 1024 * 1024 // 200 MB
const MAX_FILES     = 50

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_SIZE },
  fileFilter: (_req, file, cb) => {
    const isZip =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.originalname.toLowerCase().endsWith('.zip')
    isZip ? cb(null, true) : cb(new Error('Only ZIP files are accepted'))
  },
})

export const vdrRouter = Router()

const vdrAgent = new VdrAgent()

const MIME_MAP: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  csv:  'text/csv',
  txt:  'text/plain',
  md:   'text/markdown',
  json: 'application/json',
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/**
 * POST /api/deals/:id/vdr-upload
 */
vdrRouter.post('/:id/vdr-upload', upload.single('file'), async (req: Request, res: Response) => {
  const dealId = req.params['id']!
  const userId = req.userId!
  const file   = req.file

  if (!file) {
    res.status(400).json({ error: 'No file provided', code: 'NO_FILE', requestId: req.requestId })
    return
  }

  const deal = await prisma.deal.findFirst({
    where:  { id: dealId, userId },
    select: { id: true, clientId: true },
  }).catch(() => null)

  if (!deal) {
    res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId })
    return
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Request-Id':  req.requestId,
  })

  let closed = false
  req.on('close', () => { closed = true })

  const send = (data: Record<string, unknown>): void => {
    if (closed) return
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // 1. Extract ZIP
    const zip     = new AdmZip(file.buffer)
    const entries = zip.getEntries()
      .filter((e) =>
        !e.isDirectory &&
        !e.entryName.startsWith('__MACOSX') &&
        !e.entryName.startsWith('.')
      )
      .slice(0, MAX_FILES)

    if (entries.length === 0) {
      send({ type: 'complete', processedCount: 0, failedCount: 0, message: 'ZIP contains no supported files' })
      return
    }

    send({ type: 'extracting', fileCount: entries.length })

    // 2. Build entry list for SDK categorisation
    const fileList: VdrFileEntry[] = entries.map((e) => ({
      filename: e.entryName.split('/').pop() ?? e.entryName,
      sizeKb:   Math.round(e.header.size / 1024),
    }))

    // 3. SDK categorisation (1 LLM turn)
    send({ type: 'categorizing' })
    const categories = await vdrAgent.categorize(fileList)
    const catMap     = new Map(categories.map((c) => [c.filename, c]))

    // 4. Sort HIGH → MEDIUM → LOW
    const sorted = [...entries].sort((a, b) => {
      const fa = a.entryName.split('/').pop() ?? a.entryName
      const fb = b.entryName.split('/').pop() ?? b.entryName
      const pa = catMap.get(fa)?.priority ?? 'MEDIUM'
      const pb = catMap.get(fb)?.priority ?? 'MEDIUM'
      return (PRIORITY_ORDER[pa] ?? 1) - (PRIORITY_ORDER[pb] ?? 1)
    })

    send({ type: 'categorized', fileCount: sorted.length })

    // 5. Ingest in priority order
    const pipeline      = new IngestionPipeline({ prisma })
    let processedCount  = 0
    let failedCount     = 0

    for (let i = 0; i < sorted.length; i++) {
      const entry    = sorted[i]!
      const filename = entry.entryName.split('/').pop() ?? entry.entryName
      const cat      = catMap.get(filename)

      send({
        type:     'ingesting',
        filename,
        docType:  cat?.docType  ?? 'GENERAL',
        priority: cat?.priority ?? 'MEDIUM',
        index:    i + 1,
        total:    sorted.length,
      })

      try {
        const buf = zip.readFile(entry)
        if (!buf) {
          failedCount++
          send({ type: 'skipped', filename, reason: 'Could not read file from ZIP' })
          continue
        }

        const result = await pipeline.ingestDocument(
          buf,
          filename,
          guessMimeType(filename),
          userId,
          {
            ...(deal.clientId ? { clientId: deal.clientId } : {}),
            dealId,
            sourceType: 'UPLOAD',
          }
        )

        processedCount++
        send({
          type:       'ingested',
          filename,
          documentId: result.documentId,
          docType:    cat?.docType ?? result.docType,
          index:      i + 1,
          total:      sorted.length,
        })
      } catch (err) {
        failedCount++
        const msg = err instanceof Error ? err.message : 'Ingestion error'
        send({ type: 'error', filename, error: msg.slice(0, 150) })
      }
    }

    send({ type: 'complete', processedCount, failedCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'VDR processing failed'
    send({ type: 'error', error: msg.slice(0, 150) })
  } finally {
    if (!res.writableEnded) res.end()
  }
})
