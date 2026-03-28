// Drive Sync — recursively syncs a Google Drive folder into the AXIS knowledge base
// Finds the target folder, lists all files, downloads content, runs through ingestion pipeline

import { prisma } from './prisma.js'
import { getValidToken } from '@axis/tools/src/google/auth.js'
import * as drive from '@axis/tools/src/google/drive.js'

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
  const result = await drive.listFiles(accessToken, {
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
): Promise<Array<{ file: drive.DriveFile; path: string }>> {
  const allFiles: Array<{ file: drive.DriveFile; path: string }> = []
  let pageToken: string | null = null

  do {
    const result = await drive.listFiles(accessToken, {
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

  // Create a single pipeline instance for all files (reuse engine + prisma)
  const { IngestionPipeline } = await import('@axis/ingestion')
  const pipeline = new IngestionPipeline({ prisma })

  // Process each file
  for (let i = 0; i < ingestableFiles.length; i++) {
    const { file, path } = ingestableFiles[i]!
    onProgress?.({ phase: 'ingesting', totalFiles: ingestableFiles.length, processedFiles: i, currentFile: path, errors })

    try {
      // Check if already indexed with same modification time
      const existing = await prisma.knowledgeDocument.findFirst({
        where: { sourceId: file.id, userId },
      })

      if (existing && existing.lastSynced && existing.lastSynced >= new Date(file.modifiedTime)) {
        console.log(`[DriveSync] Skip (unchanged): ${path}`)
        skipped++
        continue
      }

      // Download content
      console.log(`[DriveSync] Downloading: ${path} (${file.mimeType})`)
      const content = await drive.downloadFile(accessToken, file.id, file.mimeType)

      // Run through the real ingestion pipeline
      try {
        const result = await pipeline.ingestDocument(content, file.name, file.mimeType, userId, {
          ...(clientId ? { clientId } : {}),
          sourceType: 'GDRIVE',
          sourceId: file.id,
          sourcePath: path,
        })

        if (result.status === 'FAILED') {
          errors.push(`${path}: Pipeline returned FAILED`)
          failed++
        } else {
          ingested++
          console.log(`[DriveSync] Ingested via pipeline: ${path} (${result.chunkCount} chunks, ${result.entityCount} entities)`)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Pipeline failed'
        errors.push(`${path}: ${errMsg}`)
        failed++
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Download failed'
      errors.push(`${path}: ${errMsg}`)
      failed++
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
