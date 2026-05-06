# Gemini Live API Reference
> Scraped April 2026 from google-gemini/gemini-skills. Use this as source of truth for `aria-live-ws.ts` fixes.

---

## ⚠️ Critical: Correct Model String

```
gemini-3.1-flash-live-preview
```

**Shutdown models — DO NOT USE:**
- `gemini-2.0-flash-live-001` — shutdown December 9, 2025
- `gemini-live-2.5-flash-preview` — shutdown December 9, 2025
- `gemini-2.5-flash-native-audio-preview-12-2025` — deprecated, migrate away
- `gemini-3.1-flash-live-preview` (original incorrect string in Axis) was `gemini-3.1-flash-live-preview` — this IS the correct one

---

## ⚠️ Critical: SDK Migration Required

**Old (broken) package:**
```
@google/generative-ai   ← deprecated, DO NOT USE
```

**New (correct) package:**
```
@google/genai           ← use this
```

Update `package.json`:
```bash
pnpm remove @google/generative-ai
pnpm add @google/genai
```

Update imports everywhere:
```typescript
// OLD — remove
import { GoogleGenerativeAI } from '@google/generative-ai';

// NEW — use
import { GoogleGenAI } from '@google/genai';
```

---

## JavaScript/TypeScript Connection Setup

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const session = await ai.live.connect({
  model: 'gemini-3.1-flash-live-preview',
  config: {
    responseModalities: ['audio'],   // AUDIO only — never mix TEXT + AUDIO
    systemInstruction: {
      parts: [{ text: 'You are Aria, an AI consulting co-pilot.' }]
    }
  },
  callbacks: {
    onopen:   ()      => console.log('Gemini Live connected'),
    onmessage: (res)  => handleResponse(res),
    onerror:  (err)   => console.error('Gemini Live error:', err),
    onclose:  ()      => console.log('Gemini Live closed')
  }
});
```

---

## Sending Real-Time Input

```typescript
// Text input
session.sendRealtimeInput({ text: 'Hello, how are you?' });

// Audio input (PCM, 16kHz, 16-bit mono)
session.sendRealtimeInput({
  audio: {
    data: chunk.toString('base64'),
    mimeType: 'audio/pcm;rate=16000'
  }
});

// Video frame
session.sendRealtimeInput({
  video: {
    data: frame.toString('base64'),
    mimeType: 'image/jpeg'
  }
});

// Signal microphone pause (flushes cached audio)
session.sendRealtimeInput({ audioStreamEnd: true });
```

**⚠️ Important:** Use `sendRealtimeInput` for ALL real-time input including text.
Do NOT use `send_client_content` for live conversation — it only seeds initial context.
Do NOT use `media` as a key — use specific keys: `audio`, `video`, `text`.

---

## Receiving Responses

```typescript
function handleResponse(response: any) {
  const content = response.serverContent;
  if (!content) return;

  // Audio output parts
  if (content?.modelTurn?.parts) {
    for (const part of content.modelTurn.parts) {
      if (part.inlineData) {
        const audioData = part.inlineData.data; // Base64 encoded PCM 24kHz
        // Play audio...
      }
    }
  }

  // Transcriptions
  if (content?.inputTranscription) {
    console.log('User said:', content.inputTranscription.text);
  }
  if (content?.outputTranscription) {
    console.log('Aria said:', content.outputTranscription.text);
  }

  // Interruption signal — stop playback, clear audio queue
  if (content?.interrupted) {
    clearAudioQueue();
  }
}
```

**⚠️ Important:** A single server event can contain MULTIPLE content parts.
Always iterate over all parts — never assume only one part per event.

---

## Audio Format Specifications

| Direction | Format | Sample Rate | Bit Depth | Channels |
|-----------|--------|-------------|-----------|----------|
| Input (mic → Gemini) | Raw PCM, little-endian | 16kHz (API resamples other rates) | 16-bit | Mono |
| Output (Gemini → speaker) | Raw PCM, little-endian | 24kHz | 16-bit | Mono |

MIME type for input: `audio/pcm;rate=16000`

---

## Session Limits

| Session Type | Max Duration (no compression) |
|---|---|
| Audio only | 15 minutes |
| Audio + Video | 2 minutes |
| Connection lifetime | ~10 minutes (use session resumption) |

**⚠️ Axis currently rotates sessions every 14 minutes — reduce to 9 minutes to stay safe within the ~10 minute connection lifetime.**

Context window:
- Native audio mode: 128k tokens
- Standard mode: 32k tokens

---

## Function Calling (Tool Use)

```typescript
const session = await ai.live.connect({
  model: 'gemini-3.1-flash-live-preview',
  config: {
    responseModalities: ['audio'],
    tools: [{
      functionDeclarations: [{
        name: 'searchKnowledgeBase',
        description: 'Search the deal knowledge base for relevant information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' }
          },
          required: ['query']
        }
      }]
    }]
  },
  callbacks: { /* ... */ }
});
```

**⚠️ Function calling is SYNCHRONOUS only in Gemini 3.1 Flash Live.**
Tool calls block until the function returns. Keep tool implementations fast (<2s).

Handling tool calls in the response:
```typescript
if (response.toolCall) {
  for (const fc of response.toolCall.functionCalls) {
    const result = await executeTool(fc.name, fc.args);
    session.sendToolResponse({
      functionResponses: [{
        id: fc.id,
        name: fc.name,
        response: result
      }]
    });
  }
}
```

---

## Thinking Level (replaces thinkingBudget)

```typescript
config: {
  responseModalities: ['audio'],
  thinkingConfig: {
    thinkingLevel: 'minimal'  // options: minimal | low | medium | high
  }
}
```

**⚠️ `thinkingBudget` no longer exists. Replace with `thinkingLevel`.**

---

## Ephemeral Tokens (for client-side use)

Never expose the Gemini API key in browser JavaScript. Use ephemeral tokens:

```typescript
// Backend: generate ephemeral token
const token = await ai.live.generateEphemeralToken({
  model: 'gemini-3.1-flash-live-preview',
  config: { /* same config as the session */ },
  expiresIn: 60  // seconds
});
// Send token to frontend

// Frontend: use ephemeral token instead of API key
const ai = new GoogleGenAI({ apiKey: ephemeralToken });
```

Axis already proxies tool calls through the backend (`POST /api/aria/tool-call`) — extend this pattern to also generate ephemeral tokens via `POST /api/aria/session-token` rather than returning the raw API key.

---

## Migration Checklist from Gemini 2.x to 3.1 Flash Live

- [ ] Update model string to `gemini-3.1-flash-live-preview`
- [ ] Replace `@google/generative-ai` with `@google/genai`
- [ ] Replace `GoogleGenerativeAI` import with `GoogleGenAI`
- [ ] Replace `thinkingBudget` with `thinkingLevel` (minimal/low/medium/high)
- [ ] Use `sendRealtimeInput` exclusively for all real-time input
- [ ] Handle multiple content parts per server event
- [ ] Reduce session rotation from 14 min → 9 min
- [ ] Verify `responseModalities: ['audio']` only — not mixed with TEXT
- [ ] Confirm function calling handlers await and respond synchronously
- [ ] Use ephemeral tokens instead of raw API key on the frontend

---

## Known Issues (as of April 2026)

- Mixing `TEXT` in `responseModalities` with audio config causes immediate WebSocket close (error 1007)
- `gemini-2.5-flash-native-audio-preview-09-2025`: transcription flags enabled but no transcription events returned in Node.js SDK — use `gemini-3.1-flash-live-preview` instead
- WebSocket 1008 error "Operation not implemented" during function calling in older preview models — fixed in 3.1 Flash Live

---

*Source: google-gemini/gemini-skills SKILL.md, googleapis/js-genai GitHub issues, April 2026*
