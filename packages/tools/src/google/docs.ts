// Google Docs — create documents, append sections

const DOCS_API = 'https://docs.googleapis.com/v1'

/** Created document info */
export interface CreatedDoc {
  documentId: string
  title: string
  revisionId: string
}

/**
 * Create a new Google Doc with a title.
 */
export async function createDocument(
  accessToken: string,
  title: string
): Promise<CreatedDoc> {
  const response = await fetch(`${DOCS_API}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  if (!response.ok) {
    throw new Error(`Docs create failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    documentId: string
    title: string
    revisionId: string
  }

  return { documentId: data.documentId, title: data.title, revisionId: data.revisionId }
}

/**
 * Append a section (heading + body) to an existing Google Doc.
 */
export async function appendSection(
  accessToken: string,
  documentId: string,
  heading: string,
  body: string,
  headingLevel: 1 | 2 | 3 = 2
): Promise<void> {
  const requests = [
    // Insert heading
    {
      insertText: {
        location: { index: 1 },
        text: `${heading}\n`,
      },
    },
    {
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: 1 + heading.length + 1 },
        paragraphStyle: {
          namedStyleType: `HEADING_${headingLevel}`,
        },
        fields: 'namedStyleType',
      },
    },
    // Insert body text after heading
    {
      insertText: {
        location: { index: 1 + heading.length + 1 },
        text: `${body}\n\n`,
      },
    },
  ]

  const response = await fetch(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })

  if (!response.ok) {
    throw new Error(`Docs append failed: ${response.status} ${await response.text()}`)
  }
}

/**
 * Find-and-replace text in an existing Google Doc via the official Docs API.
 * Atomic and idempotent: returns `replacementsMade: 0` when `findText` is
 * absent, so callers can detect the no-op cleanly.
 *
 * Use this in preference to driving the Kix editor through the browser
 * extension — Kix filters synthetic events and the official API is faster,
 * more reliable, and produces no Chrome debugger banner.
 *
 * Requires the `https://www.googleapis.com/auth/documents` OAuth scope
 * (already requested by `auth.ts`).
 */
export async function replaceAllText(
  accessToken: string,
  documentId: string,
  findText: string,
  replaceText: string,
  matchCase = true,
): Promise<{ replacementsMade: number; documentId: string; revisionId?: string }> {
  if (!findText) {
    throw new Error('replaceAllText: findText must be a non-empty string.')
  }

  const response = await fetch(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        replaceAllText: {
          containsText: { text: findText, matchCase },
          replaceText,
        },
      }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Docs replaceAllText failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    documentId: string
    writeControl?: { requiredRevisionId?: string }
    replies?: Array<{ replaceAllText?: { occurrencesChanged?: number } }>
  }

  return {
    documentId: data.documentId,
    replacementsMade: data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0,
    ...(data.writeControl?.requiredRevisionId !== undefined && { revisionId: data.writeControl.requiredRevisionId }),
  }
}

/**
 * Insert text at the end of a document.
 */
export async function appendText(
  accessToken: string,
  documentId: string,
  text: string
): Promise<void> {
  // Get document to find end index
  const docResponse = await fetch(`${DOCS_API}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!docResponse.ok) {
    throw new Error(`Docs get failed: ${docResponse.status} ${await docResponse.text()}`)
  }

  const doc = await docResponse.json() as { body: { content: Array<{ endIndex: number }> } }
  const lastElement = doc.body.content[doc.body.content.length - 1]
  const endIndex = lastElement?.endIndex ?? 1

  const response = await fetch(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        insertText: {
          location: { index: Math.max(1, endIndex - 1) },
          text: `${text}\n`,
        },
      }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Docs append text failed: ${response.status} ${await response.text()}`)
  }
}
