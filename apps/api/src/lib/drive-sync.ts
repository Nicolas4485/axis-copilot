// Drive Sync — recursively syncs a Google Drive folder into the AXIS knowledge base
// Finds the target folder, lists all files, downloads content, runs through ingestion pipeline

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { prisma } from './prisma.js'
import { google } from '@axis/tools'
const { getValidToken, listFiles: driveListFiles, downloadFileAuto: driveDownloadFile } = google
type DriveFile = Awaited<ReturnType<typeof driveListFiles>>['files'][number]
import type { IngestionResult } from '@axis/ingestion'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Run the ingestion pipeline in a separate Node process with its own memory */
function runPipelineWorker(input: {
  fileContent: string
  filename: string
  mimeType: string
  userId: string
  options?: Record<string, unknown>
}): Promise<IngestionResult> {
  return new Promise((resolve, reject) => {
    // Use compiled JS worker to avoid tsx's 4GB+ memory overhead
    const workerPath = join(__dirname, '..', '..', 'dist', 'lib', 'pipeline-worker.js')
    const child = spawn('node', [
      '--max-old-space-size=4096',
      workerPath,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) {
        stderr += line + '\n'
        // Log pipeline progress from worker
        try {
          const progress = JSON.parse(line) as { step?: string; message?: string }
          if (progress.step) {
            console.log(`[PipelineWorker] ${progress.message ?? progress.step}`)
          }
        } catch {
          if (!line.includes('ExperimentalWarning')) {
            console.log(`[PipelineWorker] ${line}`)
          }
        }
      }
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Pipeline worker exited with code ${code}: ${stderr.slice(-500)}`))
        return
      }
      try {
        const result = JSON.parse(stdout) as IngestionResult
        resolve(result)
      } catch {
        reject(new Error(`Pipeline worker returned invalid JSON: ${stdout.slice(0, 200)}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn pipeline worker: ${err.message}`))
    })

    // Send input via stdin
    child.stdin.write(JSON.stringify(input))
    child.stdin.end()
  })
}

/** Progress callback for UI updates */
export interface SyncProgress {
  phase: 'scanning' | 'downloading' | 'ingesting' | 'done' | 'error'
  totalFiles: number
  processedFiles: number
  currentFile: string | null
  errors: string[]
}

/** Result of a full folder sync */
export interface SyncResult {
  folderId: string
  folderName: string
  totalFiles: number
  ingested: number
  skipped: number
  failed: number
  errors: string[]
  durationMs: number
}

/**
 * Get a valid Google access token for a user.
 * Refreshes if expired.
 */
async function getAccessToken(userId: string): Promise<string> {
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      provider: { in: ['GOOGLE_DRIVE', 'GOOGLE_DOCS', 'GOOGLE_SHEETS', 'GMAIL'] },
    },
  })

  if (!integration) {
    throw new Error('Google not connected. Go to Settings → Connect Google first.')
  }

  return getValidToken(
    {
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken ?? '',
      expiresAt: integration.expiresAt ?? new Date(0),
    },
    async (updated) => {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: updated.accessToken,
          refreshToken: updated.refreshToken,
          expiresAt: updated.expiresAt,
        },
      })
    }
  )
}

/**
 * Find a folder by name in the user's Drive.
 * Returns the folder ID or null if not found.
 */
export async function findFolder(
  accessToken: string,
  folderName: string
): Promise<{ id: string; name: string } | null> {
  // Use contains for flexible matching, then exact-match client-side
  const result = await driveListFiles(accessToken, {
    query: `name contains '${folderName.split('-')[0] ?? folderName}' and mimeType = 'application/vnd.google-apps.folder'`,
    pageSize: 20,
  })
  console.log(`[DriveSync] Folder search for "${folderName}" found:`, result.files.map((f) => f.name))

  // Try exact match first, then case-insensitive
  const exact = result.files.find((f) => f.name === folderName)
  if (exact) return { id: exact.id, name: exact.name }

  const caseInsensitive = result.files.find((f) => f.name.toLowerCase() === folderName.toLowerCase())
  if (caseInsensitive) return { id: caseInsensitive.id, name: caseInsensitive.name }

  // Return first match if any
  const first = result.files[0]
  if (!first) return null

  return { id: first.id, name: first.name }
}

/**
 * Recursively list all files in a folder (including subfolders).
 */
async function listAllFiles(
  accessToken: string,
  folderId: string,
  path: string = ''
): Promise<Array<{ file: DriveFile; path: string }>> {
  const allFiles: Array<{ file: DriveFile; path: string }> = []
  let pageToken: string | null = null

  do {
    const result = await driveListFiles(accessToken, {
      folderId,
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    })

    for (const file of result.files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Recurse into subfolder
        const subFiles = await listAllFiles(accessToken, file.id, `${path}${file.name}/`)
        allFiles.push(...subFiles)
      } else {
        allFiles.push({ file, path: `${path}${file.name}` })
      }
    }

    pageToken = result.nextPageToken
  } while (pageToken)

  return allFiles
}

/** MIME types we can ingest */
const INGESTABLE_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/**
 * Sync a Google Drive folder into the AXIS knowledge base.
 *
 * 1. Find the folder by name (or use provided folderId)
 * 2. Recursively list all files
 * 3. Download each file
 * 4. Check if already ingested (by sourceId + checksum)
 * 5. Run through ingestion pipeline if new or modified
 */
export async function syncDriveFolder(
  userId: string,
  folderNameOrId: string,
  onProgress?: (progress: SyncProgress) => void,
  clientId?: string
): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let ingested = 0
  let skipped = 0
  let failed = 0

  // Get access token
  const accessToken = await getAccessToken(userId)

  // Find folder
  onProgress?.({ phase: 'scanning', totalFiles: 0, processedFiles: 0, currentFile: null, errors })

  let folderId = folderNameOrId
  let folderName = folderNameOrId

  // Check if it's a folder name (not an ID)
  if (!folderNameOrId.match(/^[a-zA-Z0-9_-]{20,}$/)) {
    const folder = await findFolder(accessToken, folderNameOrId)
    if (!folder) {
      throw new Error(`Folder "${folderNameOrId}" not found in your Google Drive. Make sure the folder exists and is named exactly "${folderNameOrId}".`)
    }
    folderId = folder.id
    folderName = folder.name
  }

  // List all files recursively
  console.log(`[DriveSync] Scanning folder: ${folderName} (${folderId})`)
  const allFiles = await listAllFiles(accessToken, folderId)
  const ingestableFiles = allFiles.filter((f) => INGESTABLE_TYPES.has(f.file.mimeType))

  console.log(`[DriveSync] Found ${allFiles.length} files, ${ingestableFiles.length} ingestable`)
  onProgress?.({ phase: 'downloading', totalFiles: ingestableFiles.length, processedFiles: 0, currentFile: null, errors })

  // Process files with concurrency = 5 to avoid OOM while keeping throughput high
  const CONCURRENCY = 5
  let processedCount = 0

  async function processFile(file: DriveFile, path: string): Promise<void> {
    onProgress?.({ phase: 'ingesting', totalFiles: ingestableFiles.length, processedFiles: processedCount, currentFile: path, errors })

    // Check if already indexed with same modification time
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { sourceId: file.id, userId },
    })

    if (existing && existing.lastSynced && existing.lastSynced >= new Date(file.modifiedTime)) {
      console.log(`[DriveSync] Skip (unchanged): ${path}`)
      skipped++
      processedCount++
      return
    }

    // Download content — downloadFileAuto returns the actual content type after
    // any Google Workspace export so the pipeline picks the right parser.
    console.log(`[DriveSync] Downloading: ${path} (${file.mimeType})`)
    const { content, contentType } = await driveDownloadFile(accessToken, file.id, file.mimeType)

    const result = await runPipelineWorker({
      fileContent: content.toString('base64'),
      filename: file.name,
      mimeType: contentType,
      userId,
      options: {
        ...(clientId ? { clientId } : {}),
        sourceType: 'GDRIVE',
        sourceId: file.id,
        sourcePath: path,
      },
    })

    if (result.status === 'FAILED') {
      errors.push(`${path}: Pipeline returned FAILED`)
      failed++
    } else {
      ingested++
      console.log(`[DriveSync] Ingested via pipeline: ${path} (${result.chunkCount} chunks, ${result.entityCount} entities)`)
    }

    processedCount++
  }

  // Process in batches of CONCURRENCY using Promise.allSettled so one failure doesn't stop others
  for (let i = 0; i < ingestableFiles.length; i += CONCURRENCY) {
    const batch = ingestableFiles.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(({ file, path }) => processFile(file, path))
    )

    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result?.status === 'rejected') {
        const path = batch[j]?.path ?? 'unknown'
        const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        errors.push(`${path}: ${errMsg}`)
        failed++
      }
    }
  }

  onProgress?.({ phase: 'done', totalFiles: ingestableFiles.length, processedFiles: ingestableFiles.length, currentFile: null, errors })

  const result: SyncResult = {
    folderId,
    folderName,
    totalFiles: ingestableFiles.length,
    ingested,
    skipped,
    failed,
    errors,
    durationMs: Date.now() - startTime,
  }

  console.log(`[DriveSync] Complete: ${ingested} ingested, ${skipped} skipped, ${failed} failed in ${result.durationMs}ms`)
  return result
}
