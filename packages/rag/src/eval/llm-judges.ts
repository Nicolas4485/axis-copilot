// LLM judges for RAGAS-style RAG evaluation
//
// Replaces keyword-counting / length-ratio heuristics with Claude Haiku calls.
// Each function returns a 0–1 score and falls back to a neutral value on error.
//
// Uses 'relevance_score' task (Haiku) with 'MICRO_CLASSIFY' system prompt —
// the MICRO_CLASSIFY prompt instructs the model to reply with JSON only,
// which is exactly what each judge needs.

import type { InferenceEngine } from '@axis/inference'

type JudgeResp = Awaited<ReturnType<InferenceEngine['route']>>

function getText(resp: JudgeResp): string {
  return resp.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function parseScore(text: string, fallback: number): number {
  // Fast path: {"score": 0.87}
  const fast = text.match(/"score"\s*:\s*([\d.]+)/)
  if (fast?.[1]) {
    const v = parseFloat(fast[1])
    if (!isNaN(v)) return Math.max(0, Math.min(1, v))
  }
  // Fallback: full JSON parse
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.substring(start, end + 1)) as Record<string, unknown>
      const v = obj['score']
      if (typeof v === 'number') return Math.max(0, Math.min(1, v))
    } catch { /* */ }
  }
  return fallback
}

const TASK = 'relevance_score' as const
const KEY  = 'MICRO_CLASSIFY'

// ─── Judge 1: Context Quality ──────────────────────────────────────────────

/**
 * How well does the retrieved context contain information needed to answer
 * the question? Replaces keyword-counting context precision heuristic.
 */
export async function judgeContextQuality(
  context: string,
  question: string,
  engine: InferenceEngine,
  userId: string,
): Promise<number> {
  if (!context || context.length < 20) return 0

  try {
    const resp = await engine.route(TASK, {
      systemPromptKey: KEY,
      messages: [{
        role: 'user',
        content: `Question: ${question}\n\nRetrieved Context:\n${context.substring(0, 1500)}\n\nScore how well the retrieved context contains information needed to answer this question.\n1.0 = context directly contains the answer\n0.5 = context is partially relevant\n0.0 = context is completely irrelevant\n\nReply ONLY with: {"score": <0.0-1.0>}`,
      }],
      maxTokens: 25,
      userId,
    })
    return parseScore(getText(resp), 0.5)
  } catch {
    return 0.5
  }
}

// ─── Judge 2: Faithfulness ─────────────────────────────────────────────────

/**
 * What fraction of factual claims in the answer are supported by the context?
 * Replaces length-ratio hallucination heuristic.
 */
export async function judgeFaithfulness(
  answer: string,
  context: string,
  engine: InferenceEngine,
  userId: string,
): Promise<number> {
  if (!answer || answer.length < 5) return 0
  // Correct refusal when context is empty
  if (answer.toUpperCase().includes('NOT FOUND') && context.length < 50) return 1.0
  // Wrong refusal when context has content
  if (answer.toUpperCase().includes('NOT FOUND') && context.length > 100) return 0.2

  try {
    const resp = await engine.route(TASK, {
      systemPromptKey: KEY,
      messages: [{
        role: 'user',
        content: `Answer: ${answer}\n\nContext:\n${context.substring(0, 1500)}\n\nExtract each factual claim from the answer. For each claim, state whether it is directly supported by the context.\nReply ONLY with: {"claims": ["<claim>"], "supported": [true]}`,
      }],
      maxTokens: 350,
      userId,
    })

    const text = getText(resp)
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return 0.7

    const parsed = JSON.parse(text.substring(start, end + 1)) as {
      claims?: unknown[]
      supported?: unknown[]
    }
    const claims   = Array.isArray(parsed.claims)   ? parsed.claims   : []
    const supported = Array.isArray(parsed.supported) ? parsed.supported : []
    if (claims.length === 0) return 0.7
    return supported.filter(Boolean).length / claims.length
  } catch {
    return 0.7
  }
}

// ─── Judge 3: Answer Relevance ─────────────────────────────────────────────

/**
 * How directly and completely does the answer address the question?
 * Replaces regex-pattern matching heuristic.
 */
export async function judgeAnswerRelevance(
  answer: string,
  question: string,
  engine: InferenceEngine,
  userId: string,
): Promise<number> {
  if (!answer || answer.length < 5) return 0

  try {
    const resp = await engine.route(TASK, {
      systemPromptKey: KEY,
      messages: [{
        role: 'user',
        content: `Question: ${question}\n\nAnswer: ${answer}\n\nScore how directly and completely the answer addresses the question.\n1.0 = directly and completely answers the question\n0.5 = partially answers the question\n0.0 = does not address the question at all\n\nReply ONLY with: {"score": <0.0-1.0>}`,
      }],
      maxTokens: 25,
      userId,
    })
    return parseScore(getText(resp), 0.5)
  } catch {
    return 0.5
  }
}

// ─── Judge 4: Context Recall (optional) ───────────────────────────────────

/**
 * How much of the ground truth answer is covered by the retrieved context?
 * Only called when EvalQuestion.groundTruth is defined.
 */
export async function judgeContextRecall(
  context: string,
  groundTruth: string,
  engine: InferenceEngine,
  userId: string,
): Promise<number> {
  if (!context || context.length < 20 || !groundTruth) return 0

  try {
    const resp = await engine.route(TASK, {
      systemPromptKey: KEY,
      messages: [{
        role: 'user',
        content: `Ground Truth Answer: ${groundTruth}\n\nRetrieved Context:\n${context.substring(0, 1500)}\n\nScore how much of the ground truth information can be inferred from the retrieved context.\n1.0 = all ground truth information is covered by the context\n0.5 = some information is missing from the context\n0.0 = none of the ground truth is present in the context\n\nReply ONLY with: {"score": <0.0-1.0>}`,
      }],
      maxTokens: 25,
      userId,
    })
    return parseScore(getText(resp), 0.5)
  } catch {
    return 0.5
  }
}
