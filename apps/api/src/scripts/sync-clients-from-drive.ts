// sync-clients-from-drive.ts
// Discovers client folders from Google Drive's Work-Projects directory and
// upserts them as Client records in the database.
//
// Convention: each subfolder under the Work-Projects folder = one client.
// Called non-blocking on API startup and exposed as POST /api/clients/sync-from-drive.

import { prisma } from '../lib/prisma.js'
import { google as goog } from '@axis/tools'

// Known Drive folder ID for the Aura Commodities client folder.
// The parent (Work-Projects) is resolved dynamically via the Drive API so new
// subfolders are picked up automatically.
const AURA_COMMODITIES_FOLDER_ID = '17CdYLSlAUsecdH86fp0GfRwZeTljbnk-'

/**
 * Resolve the Work-Projects parent folder ID by reading Aura Commodities' parents.
 */
async function resolveWorkProjectsFolderId(accessToken: string): Promise<string | null> {
  try {
    const meta = await goog.getFileMetadata(accessToken, AURA_COMMODITIES_FOLDER_ID)
    return meta.parents?.[0] ?? null
  } catch (err) {
    console.warn('[DriveSync] Could not resolve Work-Projects folder:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Sync client folders from Drive for a single user.
 *
 * 1. Removes legacy seed clients (Acme Corp / PropTech) that don't belong.
 * 2. Discovers subfolders of Work-Projects.
 * 3. Upserts a Client record for each subfolder (idempotent — safe to call repeatedly).
 */
export async function syncClientsFromDrive(userId: string): Promise<void> {
  console.log(`[DriveSync] Starting client sync for user ${userId}`)

  // Step 1: Remove dummy seed clients
  try {
    const deleted = await prisma.client.deleteMany({
      where: {
        userId,
        name: { in: ['Acme Corp', 'PropTech Co', 'Demo Client'] },
      },
    })
    if (deleted.count > 0) {
      console.log(`[DriveSync] Removed ${deleted.count} legacy seed client(s)`)
    }
  } catch (err) {
    console.warn('[DriveSync] Could not remove seed clients:', err instanceof Error ? err.message : err)
  }

  // Step 2: Get Google access token
  let accessToken: string
  try {
    const integration = await prisma.integration.findFirst({
      where: { userId, provider: 'GOOGLE_DRIVE' },
      select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
    })
    if (!integration) {
      console.log('[DriveSync] No Google Drive integration found — skipping Drive sync')
      return
    }
    accessToken = await goog.getValidToken(
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
  } catch (err) {
    console.warn('[DriveSync] Could not get Google token:', err instanceof Error ? err.message : err)
    return
  }

  // Step 3: Resolve Work-Projects folder
  const workProjectsFolderId = await resolveWorkProjectsFolderId(accessToken)
  if (!workProjectsFolderId) {
    console.warn('[DriveSync] Work-Projects folder not found — falling back to Aura Commodities only')
    // Ensure Aura Commodities exists even without the parent folder
    await upsertClientFromFolder(userId, 'Aura Commodities', AURA_COMMODITIES_FOLDER_ID)
    return
  }

  // Step 4: List all subfolders of Work-Projects
  let clientFolders: Array<{ id: string; name: string }> = []
  try {
    const result = await goog.listFiles(accessToken, {
      folderId: workProjectsFolderId,
      query: `mimeType = 'application/vnd.google-apps.folder'`,
      pageSize: 50,
    })
    clientFolders = result.files.map((f) => ({ id: f.id, name: f.name }))
    console.log(`[DriveSync] Found ${clientFolders.length} client folder(s) in Work-Projects`)
  } catch (err) {
    console.warn('[DriveSync] Could not list Work-Projects subfolders:', err instanceof Error ? err.message : err)
    // Still ensure Aura Commodities exists
    await upsertClientFromFolder(userId, 'Aura Commodities', AURA_COMMODITIES_FOLDER_ID)
    return
  }

  // Step 5: Upsert each client folder
  for (const folder of clientFolders) {
    await upsertClientFromFolder(userId, folder.name, folder.id)
  }

  console.log(`[DriveSync] Client sync complete for user ${userId}`)
}

async function upsertClientFromFolder(userId: string, name: string, folderId: string): Promise<void> {
  try {
    const existing = await prisma.client.findFirst({ where: { userId, name } })
    if (existing) {
      // Update notes to keep folder ID current
      await prisma.client.update({
        where: { id: existing.id },
        data: { notes: `Drive folder: ${folderId}` },
      })
      console.log(`[DriveSync] Updated existing client: ${name}`)
    } else {
      await prisma.client.create({
        data: {
          userId,
          name,
          notes: `Drive folder: ${folderId}`,
        },
      })
      console.log(`[DriveSync] Created client: ${name}`)
    }
  } catch (err) {
    console.warn(`[DriveSync] Could not upsert client "${name}":`, err instanceof Error ? err.message : err)
  }
}
