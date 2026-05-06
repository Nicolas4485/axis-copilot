// Telegram bot — Aria interface via Telegram.
// Handles text messages and voice notes. Responds with text + audio (WAV via Gemini TTS).
// Runs in long-poll mode locally; webhook mode in production (TELEGRAM_WEBHOOK_URL set).

import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'
import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'
import { env } from '../lib/env.js'

const engine = new InferenceEngine()
const aria = new Aria({ engine, prisma })

const REDIS_SESSION_TTL = 60 * 60 * 24 * 30 // 30 days

// ─── Session management ────────────────────────────────────────────────────────

async function getOrCreateSession(chatId: number, userId: string): Promise<string> {
  const key = `tg:session:${chatId}`
  const existingId = await redis.get(key)

  if (existingId) {
    const session = await prisma.session.findUnique({ where: { id: existingId }, select: { id: true } })
    if (session) return session.id
  }

  const session = await prisma.session.create({
    data: {
      userId,
      title: `Telegram ${chatId}`,
      mode: 'telegram',
    },
  })

  await redis.set(key, session.id, 'EX', REDIS_SESSION_TTL)
  return session.id
}

// ─── Audio helpers ─────────────────────────────────────────────────────────────

// Wraps raw 16-bit mono PCM in a WAV container (no external deps required).
function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

// Gemini TTS: text → PCM → WAV buffer. Returns null if unavailable or on error.
async function generateTtsWav(text: string, voiceName: string): Promise<Buffer | null> {
  const apiKey = env().GEMINI_API_KEY
  if (!apiKey) return null

  // Gemini TTS has a practical limit — truncate very long responses to keep latency reasonable.
  const ttsText = text.length > 800 ? text.slice(0, 800) + '…' : text

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ttsText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
      }
    )

    if (!res.ok) {
      console.error('[TelegramBot] TTS error:', res.status)
      return null
    }

    const data = await res.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data: string } }> }
      }>
    }

    const audioB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!audioB64) return null

    return pcmToWav(Buffer.from(audioB64, 'base64'))
  } catch (err) {
    console.error('[TelegramBot] TTS fetch error:', err instanceof Error ? err.message : err)
    return null
  }
}

// Transcribes a Telegram voice/audio file (OGG buffer) via Gemini Flash.
async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  const apiKey = env().GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio message exactly as spoken. Return the transcription only, no commentary.' },
              { inlineData: { mimeType: 'audio/ogg', data: audioBuffer.toString('base64') } },
            ],
          }],
        }),
      }
    )

    if (!res.ok) return null

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch (err) {
    console.error('[TelegramBot] STT error:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Core message handler (shared between text and voice flows) ────────────────

async function handleAriaMessage(
  ctx: Context,
  text: string,
  userId: string,
): Promise<void> {
  try {
    const chatId = ctx.chat!.id
    const sessionId = await getOrCreateSession(chatId, userId)

    const ariaResponse = await aria.handleTextMessage(sessionId, userId, text, undefined, null)

    // Escape Markdown chars that Telegram v1 can't handle — fall back to plain text on error.
    try {
      await ctx.reply(ariaResponse.content, { parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(ariaResponse.content)
    }

    // Look up the user's preferred Gemini voice (defaults to Aoede).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { voiceName: true },
    })
    const voiceName = (user?.voiceName as string | null) ?? 'Aoede'

    const wavBuffer = await generateTtsWav(ariaResponse.content, voiceName)
    if (wavBuffer) {
      await ctx.sendAudio(
        { source: wavBuffer, filename: 'aria.wav' },
        { title: 'Aria', performer: 'Axis Copilot' },
      )
    }
  } catch (err) {
    console.error('[TelegramBot] handleAriaMessage error:', err instanceof Error ? err.message : err)
    await ctx.reply('Sorry, I ran into an issue. Please try again in a moment.')
  }
}

// ─── Bot factory ───────────────────────────────────────────────────────────────

export function createTelegramBot(): Telegraf {
  const config = env()
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN)
  const userId = config.TELEGRAM_ARIA_USER_ID

  bot.start(async (ctx: Context) => {
    await ctx.reply(
      '👋 Hi! I\'m *Aria*, your AI consulting co-pilot.\n\n' +
      'Send me a text or voice message and I\'ll respond with both text and audio.\n\n' +
      'Type /help for more info.',
      { parse_mode: 'Markdown' },
    )
  })

  bot.help(async (ctx: Context) => {
    await ctx.reply(
      '*Aria on Telegram*\n\n' +
      '• Send any text message to chat with Aria\n' +
      '• Send a voice note — Aria transcribes it and responds\n' +
      '• Every reply includes a voice audio file\n\n' +
      '*What Aria can do:*\n' +
      '• Prep for client meetings\n' +
      '• Draft proposals and emails\n' +
      '• Search your knowledge base\n' +
      '• Analyse products, processes, stakeholders',
      { parse_mode: 'Markdown' },
    )
  })

  // Text messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return // skip unhandled commands

    const typingInterval = setInterval(() => { void ctx.sendChatAction('typing') }, 4000)
    void ctx.sendChatAction('typing')

    try {
      await handleAriaMessage(ctx, text, userId)
    } finally {
      clearInterval(typingInterval)
    }
  })

  // Voice notes
  bot.on('voice', async (ctx) => {
    const typingInterval = setInterval(() => { void ctx.sendChatAction('typing') }, 4000)
    void ctx.sendChatAction('typing')

    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
      const audioRes = await fetch(fileLink.href)
      if (!audioRes.ok) {
        await ctx.reply('Sorry, I couldn\'t download your voice message. Please try again.')
        return
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

      const transcription = await transcribeAudio(audioBuffer)
      if (!transcription) {
        await ctx.reply('Sorry, I couldn\'t transcribe your voice message. Please type your message instead.')
        return
      }

      // Echo transcription so the user knows what Aria heard.
      await ctx.reply(`🎤 _"${transcription}"_`, { parse_mode: 'Markdown' })

      await handleAriaMessage(ctx, transcription, userId)
    } catch (err) {
      console.error('[TelegramBot] Voice handler error:', err instanceof Error ? err.message : err)
      await ctx.reply('Sorry, I ran into an issue processing your voice message.')
    } finally {
      clearInterval(typingInterval)
    }
  })

  // Unhandled update types (stickers, photos etc.)
  bot.on('message', async (ctx) => {
    await ctx.reply('Please send a text message or voice note.')
  })

  return bot
}
