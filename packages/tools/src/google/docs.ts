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
