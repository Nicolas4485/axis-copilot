# Extension chat streaming through the API — spec

Today the extension calls Anthropic directly from `utils/anthropic.js → streamCompletion`. That works but bypasses the API: no logging, no RAG injection, no per-user rate limiting, no audit trail, and the user's Anthropic key has to live on every device with the extension installed. This spec describes moving chat through `apps/api` instead.

This is a follow-up to `EXTENSION-PROTOCOL.md`. Implement after the Phase 2 browser-agent work if priorities require, or in parallel — they don't depend on each other.

## Goal

The extension's side panel sends a chat request to `POST /api/extension/chat`. The API streams the model's response back as Server-Sent Events (SSE). The extension renders chunks into the UI as they arrive, exactly the way `streamCompletion` does today.

## Why SSE not WebSocket

SSE is one-way (server → client) and gives us exactly what we need: a streamed token feed. WebSocket adds bidirectional plumbing we wouldn't use, and reconnect logic for a transient request is more code than it's worth. The existing `aria-live-ws` route can stay WebSocket; that's a different use case (long-lived presence). For request/response chat, SSE is right.

## API endpoint

```
POST /api/extension/chat
Authorization: Bearer ${EXTENSION_API_KEY}
Content-Type: application/json
Accept: text/event-stream
```

Body:

```ts
interface ChatRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  pageContext?: PageContext     // from extension-protocol.ts
  agentContext?: { name: string; reason?: string }
  systemOverride?: string        // optional, replaces SYSTEM_PROMPT
}
```

Response: `Content-Type: text/event-stream`. Each SSE event has one of these `event:` types:

```
event: chunk
data: {"text": "Hello"}

event: chunk
data: {"text": " world"}

event: done
data: {"fullText": "Hello world", "usage": {"input_tokens": 12, "output_tokens": 32}, "memoryId": "cm…"}

event: error
data: {"error": "rate_limited", "message": "..."}
```

The connection closes after `done` or `error`. The extension treats either as terminal.

## Server skeleton (apps/api/src/routes/extension.ts addition)

```ts
import Anthropic from '@anthropic-ai/sdk'   // already a dep via packages/inference

router.post('/chat', async (req: Request, res: Response) => {
  const body = req.body as ChatRequest
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    res.status(400).json({ ok: false, error: 'messages required' })
    return
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Build system prompt — agentContext signals "this came from another agent",
  // letting AXIS reply more tersely.
  let system = body.systemOverride || DEFAULT_AXIS_SYSTEM_PROMPT
  if (body.pageContext) {
    system += `\n\n<current_page>\nURL: ${body.pageContext.url}\nTitle: ${body.pageContext.title}\n\n${body.pageContext.text}\n</current_page>`
  }

  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  let fullText = ''
  let usage: { input_tokens: number; output_tokens: number } | undefined

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system,
      messages: body.messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
        send('chunk', { text: event.delta.text })
      }
    }

    const final = await stream.finalMessage()
    usage = final.usage

    // Optional auto-save to memory — match the existing extension behaviour.
    let memoryId: string | undefined
    if (body.pageContext && fullText.length > 100 && req.userId) {
      const row = await prisma.agentMemory.create({
        data: {
          userId: req.userId,
          memoryType: 'EPISODIC',
          content: `[chat]\n${body.pageContext.title}\n${fullText.slice(0, 1000)}`,
          tags: [new URL(body.pageContext.url).hostname, 'chat'],
        },
        select: { id: true },
      })
      memoryId = row.id
    }

    send('done', { fullText, usage, memoryId })
  } catch (err) {
    send('error', {
      error: 'inference_failed',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    res.end()
  }
})
```

Notes:
- The Anthropic key moves to the server's `ANTHROPIC_API_KEY` env var. Extension users no longer paste their own.
- `req.userId` comes from `extensionAuth` middleware (set to `EXTENSION_USER_ID`).
- For RAG: insert a step before the model call that hits `@axis/rag` to pull relevant memories and prepends them to `system`.

## Extension client (axis-ext/utils/anthropic.js → replacement)

Replace `streamCompletion` (which calls Anthropic directly) with a call to the API:

```js
import { AXIS_ENDPOINTS } from './constants.js'
import { STORAGE } from './constants.js'

export async function streamChatViaAxis({ messages, pageContext, onChunk, onDone, onError }) {
  const cfg = await chrome.storage.local.get([STORAGE.AXIS_BACKEND_URL, STORAGE.AXIS_API_KEY])
  const url = (cfg[STORAGE.AXIS_BACKEND_URL] || 'http://localhost:3000') + AXIS_ENDPOINTS.CHAT
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${cfg[STORAGE.AXIS_API_KEY] || ''}`,
    },
    body: JSON.stringify({ messages, pageContext }),
  })

  if (!res.ok || !res.body) {
    onError(new Error(`HTTP ${res.status}`))
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by blank lines.
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const eventLine = frame.split('\n').find(l => l.startsWith('event: '))
      const dataLine  = frame.split('\n').find(l => l.startsWith('data: '))
      if (!eventLine || !dataLine) continue
      const event = eventLine.slice(7).trim()
      const data  = JSON.parse(dataLine.slice(6))
      if (event === 'chunk')      { fullText += data.text; onChunk(data.text) }
      else if (event === 'done')  { onDone(data) }
      else if (event === 'error') { onError(new Error(data.message || data.error)) }
    }
  }
}
```

Then update `background/service-worker.js → handleChat` to call `streamChatViaAxis` instead of the direct Anthropic version.

## Migration plan

1. Land the API endpoint behind a feature flag (`EXTENSION_CHAT_THROUGH_API=true`). Existing extension keeps calling Anthropic directly — no behaviour change.
2. Deploy. Verify via curl that the SSE stream works.
3. Add `streamChatViaAxis` to the extension behind a setting (`STORAGE.CHAT_THROUGH_API` boolean, default false).
4. Toggle it on for yourself. Verify side panel still streams correctly.
5. After a week of dogfooding, flip the default to true and remove the Anthropic-direct path from the extension.

## Acceptance criteria

- Extension side panel streams tokens with no perceptible latency vs the current direct path.
- `Stop` button on the side panel cancels the stream (use `AbortController` in the fetch call).
- Memory auto-save still works, with the same trigger conditions.
- API logs every chat request through the existing `auditMiddleware` once the route is moved behind it (currently the extension router sits before audit — we'd need to add audit explicitly or move the mount).
- If `ANTHROPIC_API_KEY` is missing on the server, the API returns a clean error rather than a stack trace.

## Out of scope

- Multi-turn tool use (Anthropic tools API). The current chat is single-turn-style; tool routing belongs in the agents layer, not the extension chat path.
- File attachments. The extension only sends text + page context.
- WebSocket upgrade. SSE is sufficient.
