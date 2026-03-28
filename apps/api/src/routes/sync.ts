// Sync routes — Google Drive folder sync + GitHub repo sync
// These are long-running operations, so they return immediately and stream progress via SSE

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { syncDriveFolder } from '../lib/drive-sync.js'
import { IngestionPipeline, codeFileMimeType, canParse } from '@axis/ingestion'

export const syncRouter = Router()

// ─── Validation ──────────────────────────────────────────────

const driveSyncSchema = z.object({
  folderName: z.string().min(1, 'Folder name is required'),
  clientId: z.string().optional(),
})

const githubSyncSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().optional(),
  clientId: z.string().optional(),
})

// ─── GitHub helpers ──────────────────────────────────────────

/** Build headers for GitHub API calls — includes token if configured */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'AXIS-Copilot',
    Accept: 'application/vnd.github.v3+json',
  }
  const token = env().GITHUB_TOKEN
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/** File extensions we want to ingest from repos */
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java',
  '.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml',
  '.prisma', '.sql', '.graphql', '.gql', '.css', '.scss',
])

/** Paths to skip during repo traversal */
const SKIP_PATHS = [
  'node_modules/', 'dist/', '.next/', '.git/', 'vendor/',
  '__pycache__/', '.turbo/', 'coverage/', '.cache/',
  'build/', 'out/', '.vercel/', '.nuxt/',
]

/** Max file size to ingest (500 KB) */
const MAX_FILE_SIZE = 500_000

/** Max content length per file sent to pipeline (50 KB — prevents oversized chunks) */
const MAX_CONTENT_LENGTH = 50_000

/** Concurrency limit for parallel file downloads */
const DOWNLOAD_CONCURRENCY = 10

/**
 * Determine the MIME type for a GitHub file based on extension.
 * Returns a code-specific MIME type for the CodeParser, or a standard
 * MIME type for files the existing parsers handle (markdown, JSON, etc.).
 */
function mimeTypeForFile(filePath: string): string {
  // Try code-specific MIME type first (routes to CodeParser)
  const codeMime = codeFileMimeType(filePath)
  if (codeMime) return codeMime

  // Fallback for files without a code MIME mapping
  return 'text/plain'
}

/**
 * Check if a file should be included in sync based on extension and path.
 */
function shouldIncludeFile(
  file: { path: string; type: string; size?: number }
): boolean {
  if (file.type !== 'blob') return false
  if (SKIP_PATHS.some((skip) => file.path.includes(skip))) return false
  if ((file.size ?? 0) > MAX_FILE_SIZE) return false

  const ext = '.' + (file.path.split('.').pop() ?? '')
  return CODE_EXTENSIONS.has(ext) ||
    file.path.endsWith('README.md') ||
    file.path.endsWith('CLAUDE.md') ||
    file.path.endsWith('.env.example')
}

// ─── SSE helper ──────────────────────────────────────────────

function setupSSE(req: Request, res: Response): {
  sendEvent: (type: string, data: unknown) => void
  isClosed: () => boolean
} {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': req.requestId,
  })

  let closed = false
  req.on('close', () => { closed = true })

  const sendEvent = (type: string, data: unknown): void => {
    if (closed) return
    res.write(`data: ${JSON.stringify({ ...(data as Record<string, unknown>), type })}\n\n`)
  }

  return { sendEvent, isClosed: () => closed }
}

// ─── POST /api/sync/drive — Sync a Drive folder (SSE progress) ──

syncRouter.post('/drive', async (req: Request, res: Response) => {
  const parsed = driveSyncSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
    return
  }

  const { folderName, clientId } = parsed.data

  // Check Google is connected
  const integration = await prisma.integration.findFirst({
    where: {
      userId: req.userId!,
      provider: { in: ['GOOGLE_DRIVE', 'GOOGLE_DOCS', 'GOOGLE_SHEETS', 'GMAIL'] },
    },
  })

  if (!integration) {
    res.status(400).json({
      error: 'Google not connected. Visit /api/integrations/google/connect to authenticate.',
      code: 'GOOGLE_NOT_CONNECTED',
      requestId: req.requestId,
    })
    return
  }

  const { sendEvent, isClosed } = setupSSE(req, res)

  try {
    const result = await syncDriveFolder(
      req.userId!,
      folderName,
      (progress) => { sendEvent('progress', progress) },
      clientId
    )
    sendEvent('done', result)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Sync failed'
    sendEvent('error', { error: errorMsg })
  }

  if (!isClosed()) res.end()
})

// ─── GET /api/sync/status — Get sync status for user ────────

syncRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const documents = await prisma.knowledgeDocument.groupBy({
      by: ['syncStatus', 'sourceType'],
      where: { userId: req.userId! },
      _count: { id: true },
    })

    const totalDocs = await prisma.knowledgeDocument.count({
      where: { userId: req.userId! },
    })

    const totalChunks = await prisma.documentChunk.count({
      where: { document: { userId: req.userId! } },
    })

    const lastSync = await prisma.knowledgeDocument.findFirst({
      where: { userId: req.userId!, sourceType: 'GDRIVE' },
      orderBy: { lastSynced: 'desc' },
      select: { lastSynced: true },
    })

    const lastGithubSync = await prisma.knowledgeDocument.findFirst({
      where: { userId: req.userId!, sourceId: { startsWith: 'github:' } },
      orderBy: { lastSynced: 'desc' },
      select: { lastSynced: true },
    })

    res.json({
      totalDocuments: totalDocs,
      totalChunks,
      lastDriveSync: lastSync?.lastSynced ?? null,
      lastGithubSync: lastGithubSync?.lastSynced ?? null,
      byStatus: documents.map((d) => ({
        sourceType: d.sourceType,
        status: d.syncStatus,
        count: d._count.id,
      })),
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get sync status', code: 'SYNC_STATUS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/sync/github — Sync a GitHub repo via IngestionPipeline ──

syncRouter.post('/github', async (req: Request, res: Response) => {
  const parsed = githubSyncSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
    return
  }

  const { owner, repo, branch, clientId } = parsed.data
  const treeBranch = branch ?? 'main'
  const repoSlug = `${owner}/${repo}`
  const headers = githubHeaders()

  const { sendEvent, isClosed } = setupSSE(req, res)

  try {
    // ── Phase 1: Fetch repo tree ───────────────────────────────
    sendEvent('progress', { phase: 'scanning', repo: repoSlug, branch: treeBranch })

    const treeUrl = `https://api.github.com/repos/${repoSlug}/git/trees/${treeBranch}?recursive=1`
    const treeResponse = await fetch(treeUrl, { headers })

    if (!treeResponse.ok) {
      const status = treeResponse.status
      const hint = status === 404
        ? 'Repository not found — check owner/repo and branch name'
        : status === 401
          ? 'Authentication failed — check your GITHUB_TOKEN'
          : status === 403
            ? 'Rate limited or forbidden — check your GITHUB_TOKEN'
            : `GitHub API error: ${status}`

      sendEvent('error', { error: hint })
      if (!isClosed()) res.end()
      return
    }

    const tree = await treeResponse.json() as {
      tree: Array<{ path: string; type: string; size?: number; url?: string }>
    }

    const files = tree.tree.filter(shouldIncludeFile)

    sendEvent('progress', {
      phase: 'downloading',
      repo: repoSlug,
      totalFiles: files.length,
      processedFiles: 0,
    })

    if (files.length === 0) {
      sendEvent('done', { repo: repoSlug, branch: treeBranch, totalFiles: 0, ingested: 0, failed: 0, skipped: 0, errors: [] })
      if (!isClosed()) res.end()
      return
    }

    // ── Phase 2: Download + ingest through pipeline ────────────
    const pipeline = new IngestionPipeline({
      prisma,
      onProgress: (event) => {
        sendEvent('pipeline_progress', event)
      },
    })

    let ingested = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []

    // Process files in batches of DOWNLOAD_CONCURRENCY
    for (let batchStart = 0; batchStart < files.length; batchStart += DOWNLOAD_CONCURRENCY) {
      if (isClosed()) break

      const batch = files.slice(batchStart, batchStart + DOWNLOAD_CONCURRENCY)

      // Download all files in this batch concurrently
      const downloads = await Promise.allSettled(
        batch.map(async (file) => {
          const rawUrl = `https://raw.githubusercontent.com/${repoSlug}/${treeBranch}/${file.path}`
          const contentResponse = await fetch(rawUrl, { headers })

          if (!contentResponse.ok) {
            throw new Error(`HTTP ${contentResponse.status}`)
          }

          const text = await contentResponse.text()
          return { path: file.path, text }
        })
      )

      // Ingest each downloaded file through the pipeline
      for (let i = 0; i < downloads.length; i++) {
        if (isClosed()) break

        const download = downloads[i]!
        const file = batch[i]!

        if (download.status === 'rejected') {
          const reason = download.reason instanceof Error ? download.reason.message : 'Download failed'
          errors.push(`${file.path}: ${reason}`)
          failed++
          continue
        }

        const { path: filePath, text } = download.value
        const globalIdx = batchStart + i

        sendEvent('progress', {
          phase: 'ingesting',
          repo: repoSlug,
          totalFiles: files.length,
          processedFiles: globalIdx,
          currentFile: filePath,
        })

        // Skip empty files
        if (text.trim().length === 0) {
          skipped++
          continue
        }

        try {
          const mimeType = mimeTypeForFile(filePath)
          const contentBuffer = Buffer.from(text.slice(0, MAX_CONTENT_LENGTH), 'utf-8')

          // Check if we have a parser for this MIME type
          if (!canParse(mimeType)) {
            // Fall back to text/plain (TranscriptParser handles it)
            const fallbackBuffer = Buffer.from(text.slice(0, MAX_CONTENT_LENGTH), 'utf-8')
            const result = await pipeline.ingestDocument(
              fallbackBuffer,
              filePath,
              'text/plain',
              req.userId!,
              {
                ...(clientId ? { clientId } : {}),
                sourceType: 'WEB',
                sourceId: `github:${repoSlug}/${filePath}`,
                sourcePath: `${repoSlug}/${filePath}`,
              }
            )

            if (result.status === 'FAILED') {
              errors.push(`${filePath}: Pipeline returned FAILED`)
              failed++
            } else {
              ingested++
            }
            continue
          }

          const result = await pipeline.ingestDocument(
            contentBuffer,
            filePath,
            mimeType,
            req.userId!,
            {
              ...(clientId ? { clientId } : {}),
              sourceType: 'WEB',
              sourceId: `github:${repoSlug}/${filePath}`,
              sourcePath: `${repoSlug}/${filePath}`,
            }
          )

          if (result.status === 'FAILED') {
            errors.push(`${filePath}: Pipeline returned FAILED`)
            failed++
          } else {
            ingested++
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Pipeline error'
          errors.push(`${filePath}: ${errMsg}`)
          failed++
        }
      }

      // Progress update after each batch
      sendEvent('progress', {
        phase: 'ingesting',
        repo: repoSlug,
        totalFiles: files.length,
        processedFiles: Math.min(batchStart + DOWNLOAD_CONCURRENCY, files.length),
        ingested,
        failed,
        skipped,
      })
    }

    // ── Phase 3: Done ──────────────────────────────────────────
    sendEvent('done', {
      repo: repoSlug,
      branch: treeBranch,
      totalFiles: files.length,
      ingested,
      failed,
      skipped,
      errors: errors.slice(0, 20),
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'GitHub sync failed'
    sendEvent('error', { error: errorMsg })
  }

  if (!isClosed()) res.end()
})
