// Google Drive — list files, get metadata, download content, webhook management
import { getSlidesText } from './slides.js';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
/**
 * List files in a folder or the user's root.
 */
export async function listFiles(accessToken, options) {
    const params = new URLSearchParams({
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink)',
        pageSize: String(options?.pageSize ?? 20),
        orderBy: 'modifiedTime desc',
    });
    if (options?.folderId) {
        params.set('q', `'${options.folderId}' in parents and trashed = false`);
    }
    else if (options?.query) {
        params.set('q', `${options.query} and trashed = false`);
    }
    else {
        params.set('q', 'trashed = false');
    }
    if (options?.pageToken) {
        params.set('pageToken', options.pageToken);
    }
    const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        throw new Error(`Drive list failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return {
        files: data.files ?? [],
        nextPageToken: data.nextPageToken ?? null,
    };
}
/**
 * Get file metadata.
 */
export async function getFileMetadata(accessToken, fileId) {
    const response = await fetch(`${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,parents,webViewLink`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
        throw new Error(`Drive metadata failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
}
/**
 * Download file content. For Google Workspace files, exports to the specified MIME type.
 */
export async function downloadFile(accessToken, fileId, mimeType) {
    const isGoogleType = mimeType.startsWith('application/vnd.google-apps.');
    let url;
    if (isGoogleType) {
        // Export Google Workspace files
        const exportMime = getExportMimeType(mimeType);
        url = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
    }
    else {
        // Download binary files
        url = `${DRIVE_API}/files/${fileId}?alt=media`;
    }
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        throw new Error(`Drive download failed: ${response.status} ${await response.text()}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
/**
 * Download a file, automatically choosing the best method and returning the
 * actual content type of the result.
 *
 * For Google Slides: tries PPTX export first. If Google's API rejects it
 * (e.g. 403 for large files), falls back to the Slides API which returns
 * plain text without any size limit.
 *
 * Always returns the contentType that matches the bytes in `content` so
 * callers can select the right parser.
 */
export async function downloadFileAuto(accessToken, fileId, mimeType) {
    if (mimeType === 'application/vnd.google-apps.presentation') {
        const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        // Try PPTX export first — gives us the richest structure for our parser.
        let pptxContent = null;
        try {
            pptxContent = await downloadFile(accessToken, fileId, mimeType);
            console.log(`[downloadFileAuto] PPTX export succeeded: ${pptxContent.length} bytes`);
        }
        catch (err) {
            console.log(`[downloadFileAuto] PPTX export failed (${err instanceof Error ? err.message : err}), falling back to Slides API`);
        }
        // Always fetch Slides API text — it catches speaker notes + tables that PPTX may miss
        let slidesText = '';
        try {
            slidesText = await getSlidesText(accessToken, fileId);
            console.log(`[downloadFileAuto] Slides API returned ${slidesText.length} chars`);
        }
        catch (err) {
            console.log(`[downloadFileAuto] Slides API also failed: ${err instanceof Error ? err.message : err}`);
        }
        // Prefer PPTX if it has content; otherwise use Slides API text
        if (pptxContent && pptxContent.length > 0) {
            // If PPTX exported but Slides API has substantially more text, log the discrepancy
            if (slidesText.length > 200) {
                console.log(`[downloadFileAuto] Using PPTX (${pptxContent.length} bytes). Slides API text preview: "${slidesText.slice(0, 200)}"`);
            }
            return { content: pptxContent, contentType: pptxMime };
        }
        // PPTX failed — use Slides API text
        return { content: Buffer.from(slidesText, 'utf8'), contentType: 'application/vnd.google-apps.presentation' };
    }
    const content = await downloadFile(accessToken, fileId, mimeType);
    return { content, contentType: getEffectiveMimeType(mimeType) };
}
/**
 * Register a webhook channel for file change notifications.
 */
export async function watchFile(accessToken, fileId, webhookUrl, channelId, expirationMs) {
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
    });
    if (!response.ok) {
        throw new Error(`Drive watch failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return { channelId: data.id, resourceId: data.resourceId, expiration: data.expiration };
}
/**
 * Stop a webhook channel.
 */
export async function stopWatch(accessToken, channelId, resourceId) {
    const response = await fetch(`${DRIVE_API}/channels/stop`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: channelId, resourceId }),
    });
    if (!response.ok) {
        throw new Error(`Drive stop watch failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * Map a Google Workspace MIME type to the format we export/download it as.
 * Exported so callers can look up the effective content type for parser selection.
 */
export function getEffectiveMimeType(mimeType) {
    if (!mimeType.startsWith('application/vnd.google-apps.'))
        return mimeType;
    const map = {
        'application/vnd.google-apps.document': 'text/html',
        'application/vnd.google-apps.spreadsheet': 'text/csv',
        // Export as PPTX — text/plain is rejected by Google for large presentations
        'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.google-apps.drawing': 'image/png',
    };
    return map[mimeType] ?? 'text/plain';
}
/** @internal */
function getExportMimeType(googleMime) {
    return getEffectiveMimeType(googleMime);
}
