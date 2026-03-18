// Gmail — send emails, create drafts

const GMAIL_API = 'https://gmail.googleapis.com/v1/users/me'

/** Sent/draft email info */
export interface EmailResult {
  id: string
  threadId: string
  labelIds: string[]
}

/**
 * Send an email via Gmail.
 */
export async function sendEmail(
  accessToken: string,
  options: {
    to: string
    subject: string
    body: string
    cc?: string
    bcc?: string
    replyToMessageId?: string
  }
): Promise<EmailResult> {
  const rawEmail = buildRawEmail(options)

  const response = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: rawEmail,
      ...(options.replyToMessageId ? { threadId: options.replyToMessageId } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`)
  }

  return await response.json() as EmailResult
}

/**
 * Create a draft email (does not send).
 */
export async function createDraft(
  accessToken: string,
  options: {
    to: string
    subject: string
    body: string
    cc?: string
    bcc?: string
  }
): Promise<{ draftId: string; message: EmailResult }> {
  const rawEmail = buildRawEmail(options)

  const response = await fetch(`${GMAIL_API}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { raw: rawEmail },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gmail draft failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    id: string
    message: EmailResult
  }

  return { draftId: data.id, message: data.message }
}

/**
 * Build a base64url-encoded RFC 2822 email.
 */
function buildRawEmail(options: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
}): string {
  const headers = [
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
  ]

  if (options.cc) headers.push(`Cc: ${options.cc}`)
  if (options.bcc) headers.push(`Bcc: ${options.bcc}`)

  const email = `${headers.join('\r\n')}\r\n\r\n${options.body}`

  // Base64url encode
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
