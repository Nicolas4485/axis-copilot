// Google Drive — list files, get metadata, download content, webhook management

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

/** Drive file metadata */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size: string
  parents: string[]
  webViewLink: string
}

/** List response */
export interface DriveListResult {
  files: DriveFile[]
  nextPageToken: string | null
}

/**
 * List files in a folder or the user's root.
 */
export async function listFiles(
  accessToken: string,
  options?: {
    folderId?: string
    query?: string
    pageSize?: number
    pageToken?: string
  }
): Promise<DriveListResult> {
  const params = new URLSearchParams({
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink)',
    pageSize: String(options?.pageSize ?? 20),
    orderBy: 'modifiedTime desc',
  })

  if (options?.folderId) {
    params.set('q', `'${options.folderId}' in parents and trashed = false`)
  } else if (options?.query) {
    params.set('q', `${options.query} and trashed = false`)
  } else {
    params.set('q', 'trashed = false')
  }

  if (options?.pageToken) {
    params.set('pageToken', options.pageToken)
  }

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Drive list failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    files: DriveFile[]
    nextPageToken?: string
  }

  return {
    files: data.files ?? [],
    nextPageToken: data.nextPageToken ?? null,
  }
}

/**
 * Get file metadata.
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const response = await fetch(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,parents,webViewLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    throw new Error(`Drive metadata failed: ${response.status} ${await response.text()}`)
  }

  return await response.json() as DriveFile
}

/**
 * Download file content. For Google Workspace files, exports to the specified MIME type.
 */
export async function downloadFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<Buffer> {
  const isGoogleType = mimeType.startsWith('application/vnd.google-apps.')

  let url: string
  if (isGoogleType) {
    // Export Google Workspace files
    const exportMime = getExportMimeType(mimeType)
    url = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`
  } else {
    // Download binary files
    url = `${DRIVE_API}/files/${fileId}?alt=media`
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Drive download failed: ${response.status} ${await response.text()}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Register a webhook channel for file change notifications.
 */
export async function watchFile(
  accessToken: string,
  fileId: string,
  webhookUrl: string,
  channelId: string,
  expirationMs: number
): Promise<{ channelId: string; resourceId: string; expiration: string }> {
  const response = await fetch(`${DRIVE_API}/files/${fileId}/watch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      expiration: (Date.now() + expirationMs).toString(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Drive watch failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    id: string
    resourceId: string
    expiration: string
  }

  return { channelId: data.id, resourceId: data.resourceId, expiration: data.expiration }
}

/**
 * Stop a webhook channel.
 */
export async function stopWatch(
  accessToken: string,
  channelId: string,
  resourceId: string
): Promise<void> {
  const response = await fetch(`${DRIVE_API}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  })

  if (!response.ok) {
    throw new Error(`Drive stop watch failed: ${response.status} ${await response.text()}`)
  }
}

/** Map Google Workspace MIME types to export formats */
function getExportMimeType(googleMime: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/html',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
    'application/vnd.google-apps.drawing': 'image/png',
  }
  return map[googleMime] ?? 'text/plain'
}
