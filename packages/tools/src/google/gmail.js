// Gmail — send emails, create drafts
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/**
 * Send an email via Gmail.
 */
export async function sendEmail(accessToken, options) {
    const rawEmail = buildRawEmail(options);
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
    });
    if (!response.ok) {
        throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
}
/**
 * Create a draft email (does not send).
 */
export async function createDraft(accessToken, options) {
    const rawEmail = buildRawEmail(options);
    const response = await fetch(`${GMAIL_API}/drafts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: { raw: rawEmail },
        }),
    });
    if (!response.ok) {
        throw new Error(`Gmail draft failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return { draftId: data.id, message: data.message };
}
/**
 * Search Gmail messages.
 */
export async function searchMessages(accessToken, query, maxResults = 20) {
    const params = new URLSearchParams({
        q: query,
        maxResults: String(maxResults),
    });
    const response = await fetch(`${GMAIL_API}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        throw new Error(`Gmail search failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.messages ?? [];
}
/**
 * Read a full Gmail message by ID.
 */
export async function readMessage(accessToken, messageId) {
    const response = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        throw new Error(`Gmail read failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const getHeader = (name) => {
        return data.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    };
    // Extract body from parts or direct body
    let body = '';
    if (data.payload.body?.data) {
        body = Buffer.from(data.payload.body.data, 'base64url').toString('utf-8');
    }
    else if (data.payload.parts) {
        const textPart = data.payload.parts.find((p) => p.mimeType === 'text/plain');
        const htmlPart = data.payload.parts.find((p) => p.mimeType === 'text/html');
        const part = textPart ?? htmlPart;
        if (part?.body?.data) {
            body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
    }
    // Strip HTML tags for plain text
    body = body.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return {
        id: data.id,
        threadId: data.threadId,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        snippet: data.snippet,
        body,
        labels: data.labelIds ?? [],
    };
}
/**
 * Build a base64url-encoded RFC 2822 email.
 */
function buildRawEmail(options) {
    const headers = [
        `To: ${options.to}`,
        `Subject: ${options.subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
    ];
    if (options.cc)
        headers.push(`Cc: ${options.cc}`);
    if (options.bcc)
        headers.push(`Bcc: ${options.bcc}`);
    const email = `${headers.join('\r\n')}\r\n\r\n${options.body}`;
    // Base64url encode
    return Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
