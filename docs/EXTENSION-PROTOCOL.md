# AXIS Extension ↔ Copilot Protocol

This document is the authoritative spec for how the AXIS Chrome extension (`axis-ext`) and the AXIS Copilot platform (this repo) talk to each other.

**Source of truth for message names and shapes:** [`packages/types/src/extension-protocol.ts`](../packages/types/src/extension-protocol.ts).

A snapshot of the constants is auto-derivable to JSON at `packages/types/src/extension-protocol.json` and is mirrored into the extension at `axis-ext/utils/protocol-shared.json`. Both sides should import names from those files rather than hardcoding strings.

## Architecture overview

There are two transports, each used in one direction:

```
┌──────────────────┐    HTTP (REST)       ┌─────────────────────┐
│  axis-ext        │ ───────────────────► │  apps/api           │
│  (chrome ext)    │                      │  (Express + Prisma) │
│                  │                      │                     │
│                  │ ◄─────────────────── │                     │
└──────────────────┘   chrome.runtime     └─────────────────────┘
                       .sendMessage             ▲
                       (from web origin)        │
                                                │ HTTP
                                                │
                                       ┌────────┴──────┐
                                       │  apps/web     │
                                       │  (Next.js)    │
                                       └───────────────┘
```

Direction 1 — **Extension → API**: HTTP REST. The extension's service worker hits `/api/extension/*` endpoints over `fetch`. Used for memory writes, insight saves, status pings, and (eventually) chat streaming.

Direction 2 — **Web → Extension**: `chrome.runtime.sendMessage` from a page whose origin matches the extension's `externally_connectable.matches` rule. Used for the web app to drive the extension — request the active tab's content, inject prompts into the side panel, trigger summaries, etc.

The directions are intentionally asymmetric. The extension can't initiate calls into a specific web page (no good way), so it goes through the API. The web app can talk to the extension because Chrome exposes the right primitive for it.

## Direction 1: Extension → API

The extension uses `utils/axis-api.js` (`AxisAPI` class) to make HTTP calls. All calls send a `Authorization: Bearer ${apiKey}` header where `apiKey` is the value the user pasted into the extension's settings (`STORAGE.AXIS_API_KEY`).

The API authenticates these requests via the `extensionAuth` middleware in `apps/api/src/middleware/extension-auth.ts`, which validates the bearer token against `EXTENSION_API_KEY` in the API's environment. This is a separate auth path from the cookie-based JWT used by the web app — the extension doesn't have access to httpOnly cookies on `localhost:3000` from a service worker context.

### Endpoints

All endpoints are mounted under `/api/extension`.

| Method | Path                    | Body / Query                        | Returns                                      |
| ------ | ----------------------- | ----------------------------------- | -------------------------------------------- |
| GET    | `/api/extension/status` | —                                   | `{ ok: true, version, ready, services }`     |
| POST   | `/api/extension/memory` | `MemoryEntry`                       | `{ ok: true, id }`                           |
| POST   | `/api/extension/insight`| `{ content, tags?: string[] }`      | `{ ok: true, id }`                           |
| POST   | `/api/extension/chat`   | `{ messages, pageContext? }`        | SSE stream of `{ chunk }` lines (planned)    |

#### `MemoryEntry` shape

```ts
interface MemoryEntry {
  source: 'axis-chrome-extension'
  agentTriggered?: boolean
  timestamp: string                   // ISO-8601
  page?: { url: string; title: string; domain?: string }
  content: { summary?: string; rawText?: string }
  tags?: string[]
}
```

#### Error responses

Errors return `{ ok: false, error: string, code?: string }` with an appropriate HTTP status. The extension treats network failures as `{ ok: false, offline: true }` (see `AxisAPI` — it catches and returns this shape rather than throwing).

### Extension config keys (chrome.storage.local)

| Key                       | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `axis_anthropic_key`      | Anthropic API key — extension calls Anthropic directly today |
| `axis_backend_url`        | Base URL for the API (default `http://localhost:3000`) |
| `axis_api_key`            | Token for `Authorization: Bearer …` to the API       |
| `axis_memory_enabled`     | If true, chat replies auto-save to memory            |
| `axis_agent_access`       | If true, accept external messages from web app       |
| `axis_system_override`    | Optional system-prompt override                      |

## Direction 2: Web → Extension

The web app calls into the extension using `chrome.runtime.sendMessage(extensionId, message)`. This is gated by:

1. **Extension manifest** — `externally_connectable.matches` allows only `http://localhost:*/*` and `https://*.nic.ai/*`. Other origins fail at the browser level before ever reaching the extension.
2. **Origin double-check** — `axis-bridge.js` re-validates `sender.origin` via `isAllowedOrigin()` because `externally_connectable` is loose with subdomains.
3. **Agent access toggle** — if the user disables `STORAGE.AGENT_ACCESS` in extension settings, every external command returns `{ success: false, error: 'Agent access disabled in settings' }`.

### Commands

Every external message has shape `{ command: string, payload?: object }`. The bridge dispatches on `command`. All replies have shape `{ success: boolean, data?: T, error?: string }`.

| Command                | Payload                              | Returns                                                                 |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `GET_PAGE_CONTEXT`     | —                                    | `PageContext` (URL, title, extracted text, word count)                  |
| `GET_CHAT_HISTORY`     | —                                    | `ChatMessage[]` from `chrome.storage.session`                           |
| `INJECT_PROMPT`        | `{ prompt: string, autoSend?: bool }`| `{ injected: true }` — relays to the side panel via internal message    |
| `TRIGGER_SUMMARY`      | `{ style?: 'brief' \| 'detailed' \| 'bullets' }` | `{ summary: string, savedToMemory: bool }`              |
| `SET_SYSTEM_CONTEXT`   | `{ context: string \| null }`        | `{ applied: true }` — overrides the system prompt for chat              |
| `GET_EXTENSION_STATUS` | —                                    | `ExtensionStatus` (active tab, capabilities, backend reachability)      |
| `SAVE_TO_MEMORY`       | `{ content: string, tags?: string[] }` | `{ ok: true }` — proxies to `POST /api/extension/insight`              |

### `PageContext` shape

```ts
interface PageContext {
  url: string
  title: string
  text: string             // up to 12 000 chars, scripts/nav/footer stripped
  wordCount: number
  truncated?: boolean
}
```

### `ExtensionStatus` shape

```ts
interface ExtensionStatus {
  active: boolean
  tabUrl: string
  tabTitle: string
  hasContext: boolean
  memoryEnabled: boolean
  agentAccessEnabled: boolean
  axisBackendReachable: boolean
}
```

## Internal extension messages

The side panel and popup talk to the service worker over `chrome.runtime.sendMessage` (no `extensionId`, internal only). These are not part of the external contract but are documented here for completeness:

- `CHAT` — start a streamed completion. Service worker pushes back `STREAM_CHUNK`, `STREAM_DONE`, `STREAM_ERROR` events.
- `PING_AXIS` — ping the API health endpoint.
- `OPEN_POPUP` — open the popup (or fall back to a tab).

## Using the protocol from the web app

```ts
import { ExtensionMSG } from '@axis/types'

const EXTENSION_ID = process.env.NEXT_PUBLIC_AXIS_EXTENSION_ID

async function summariseActiveTab() {
  const reply = await chrome.runtime.sendMessage(EXTENSION_ID, {
    command: ExtensionMSG.TRIGGER_SUMMARY,
    payload: { style: 'bullets' },
  })
  if (reply.success) return reply.data.summary
  throw new Error(reply.error)
}
```

The user has to know the extension ID. In dev it's the unpacked extension ID shown on `chrome://extensions`. In a packaged build, it's stable and tied to the public key.

## Versioning

Breaking changes to message shapes need a corresponding bump in `EXTENSION_PROTOCOL_VERSION` in `extension-protocol.ts`. The extension currently does not enforce version compatibility, but if drift becomes a problem, add a `protocolVersion` field to handshake messages and reject mismatched calls.

## Open work

These items are tracked separately:

- **Streaming chat through API** — see `EXTENSION-CHAT-STREAMING-SPEC.md`. Today the extension calls Anthropic directly, which means logging, RAG injection, and rate limiting bypass the API.
- **Extension ID provisioning** — the web app needs a stable way to know the extension ID. For dev, an env var; for prod, ship the extension with a fixed public key.
- **Token rotation** — `EXTENSION_API_KEY` is currently a long-lived static secret. Move to short-lived tokens minted by the API.
