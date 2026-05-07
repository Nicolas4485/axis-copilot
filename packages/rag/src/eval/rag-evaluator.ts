// RAG Evaluator — RAGAS-style LLM-judge metrics against the 150-question test set
//
// Metrics (all 0–1, all computed by Claude Haiku via InferenceEngine):
//   contextQuality     — does retrieved context contain what's needed?  (target >0.85)
//   answerFaithfulness — are answer claims supported by context?        (target >0.90)
//   answerRelevance    — does the answer address the question?           (target >0.80)
//   contextRecall      — does context cover the ground truth? (optional, target >0.80)
//
// Usage:
//   import { RagEvaluator } from './rag-evaluator.js'
//   const ev = new RagEvaluator({ rag, engine, prisma })
//   const result = await ev.run({ userId, clientId, agentTarget: 'mel' })

import type { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '../index.js'
import { EVAL_QUESTIONS } from './test-set.js'
import type { EvalQuestion, QuestionCategory, AgentAlias } from './test-set.js'
import {
  judgeContextQuality,
  judgeFaithfulness,
  judgeAnswerRelevance,
  judgeContextRecall,
} from './llm-judges.js'

// ─── Types ────────────────────────────────────────────────────

export interface QuestionResult {
  id: string
  category: QuestionCategory
  agentTarget: AgentAlias
  question: string
  answer: string
  context: string
  contextQuality: number      // 0-1: did context contain what was needed?
  answerFaithfulness: number  // 0-1: were claims supported by context?
  answerRelevance: number     // 0-1: did answer address the question?
  contextRecall?: number      // 0-1: only when groundTruth is defined
  latencyMs: number
  error?: string
}

export interface CategorySummary {
  category: QuestionCategory
  count: number
  contextQuality: number
  answerFaithfulness: number
  answerRelevance: number
  contextRecall?: number
  passRate: number
}

export interface EvalResult {
  runId: string
  userId: string
  clientId: string | null
  runAt: string
  durationMs: number
  totalQuestions: number
  contextQuality: number
  answerFaithfulness: number
  answerRelevance: number
  contextRecall?: number
  passRate: number
  categories: CategorySummary[]
  questions: QuestionResult[]
  passed: boolean
}

export interface EvalRunOptions {
  userId: string
  clientId: string | null
  categories?: QuestionCategory[]
  agentTarget?: AgentAlias
  maxQuestions?: number
  onProgress?: (done: number, total: number, question: string) => void
}

// ─── Thresholds ────────────────────────────────────────────────

export const THRESHOLDS = {
  contextQuality:     0.85,
  answerFaithfulness: 0.90,
  answerRelevance:    0.80,
  contextRecall:      0.80,
}

// ─── RagEvaluator ─────────────────────────────────────────────

export class RagEvaluator {
  private rag: RAGEngine
  private engine: InferenceEngine
  private prisma: PrismaClient

  constructor({
    rag,
    engine,
    prisma,
  }: {
    rag: RAGEngine
    engine: InferenceEngine
    prisma: PrismaClient
  }) {
    this.rag    = rag
    this.engine = engine
    this.prisma = prisma
  }

  async run(options: EvalRunOptions): Promise<EvalResult> {
    const { userId, clientId, categories, agentTarget, maxQuestions, onProgress } = options
    const startTime = Date.now()

    let questions = EVAL_QUESTIONS

    if (categories && categories.length > 0) {
      questions = questions.filter((q) => categories.includes(q.category))
    }

    if (agentTarget) {
      questions = questions.filter((q) => q.agentTarget === agentTarget)
    }

    if (maxQuestions) {
      questions = questions.slice(0, maxQuestions)
    }

    const results: QuestionResult[] = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!
      onProgress?.(i, questions.length, q.question)
      results.push(await this.evaluateQuestion(q, userId, clientId))
    }

    onProgress?.(questions.length, questions.length, 'Computing metrics...')
    return this.computeSummary(results, userId, clientId, startTime)
  }

  private async evaluateQuestion(
    q: EvalQuestion,
    userId: string,
    clientId: string | null,
  ): Promise<QuestionResult> {
    const t0 = Date.now()

    try {
      // Step 1: retrieve context
      const ragResult = await this.rag.query(q.question, userId, clientId, {
        targetTokens: 2000,
        maxChunks: 8,
      })
      const context = ragResult.context

      // Step 2: generate answer from context
      const answerResponse = await this.engine.route('agent_response', {
        systemPromptKey: 'AGENT_BASE',
        messages: [{
          role: 'user',
          content: `Question: ${q.question}\n\nContext:\n${context}\n\nAnswer the question using ONLY the provided context. If the answer is not in the context, say "NOT FOUND".`,
        }],
        maxTokens: 300,
        userId,
      })

      const answer = answerResponse.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      // Step 3: run judges in parallel
      const [contextQuality, answerFaithfulness, answerRelevance] = await Promise.all([
        judgeContextQuality(context, q.question, this.engine, userId),
        judgeFaithfulness(answer, context, this.engine, userId),
        judgeAnswerRelevance(answer, q.question, this.engine, userId),
      ])

      // Step 4: context recall (only when ground truth is available)
      const contextRecall = q.groundTruth
        ? await judgeContextRecall(context, q.groundTruth, this.engine, userId)
        : undefined

      return {
        id: q.id,
        category: q.category,
        agentTarget: q.agentTarget,
        question: q.question,
        answer,
        context: context.substring(0, 500),
        contextQuality,
        answerFaithfulness,
        answerRelevance,
        ...(contextRecall !== undefined ? { contextRecall } : {}),
        latencyMs: Date.now() - t0,
      }
    } catch (err) {
      return {
        id: q.id,
        category: q.category,
        agentTarget: q.agentTarget,
        question: q.question,
        answer: '',
        context: '',
        contextQuality: 0,
        answerFaithfulness: 0,
        answerRelevance: 0,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  private computeSummary(
    results: QuestionResult[],
    userId: string,
    clientId: string | null,
    startTime: number,
  ): EvalResult {
    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    const passes = (r: QuestionResult): boolean =>
      r.contextQuality >= THRESHOLDS.contextQuality &&
      r.answerFaithfulness >= THRESHOLDS.answerFaithfulness &&
      r.answerRelevance >= THRESHOLDS.answerRelevance

    // Discover categories dynamically from actual results
    const categorySet = [...new Set(results.map((r) => r.category))] as QuestionCategory[]

    const categories: CategorySummary[] = categorySet.map((cat) => {
      const cr = results.filter((r) => r.category === cat)
      const recallVals = cr.map((r) => r.contextRecall).filter((v): v is number => v !== undefined)
      const catRecall = recallVals.length > 0 ? avg(recallVals) : undefined
      return {
        category: cat,
        count: cr.length,
        contextQuality:     avg(cr.map((r) => r.contextQuality)),
        answerFaithfulness: avg(cr.map((r) => r.answerFaithfulness)),
        answerRelevance:    avg(cr.map((r) => r.answerRelevance)),
        ...(catRecall !== undefined ? { contextRecall: catRecall } : {}),
        passRate:           cr.length > 0 ? cr.filter(passes).length / cr.length : 0,
      }
    })

    const overallQuality     = avg(results.map((r) => r.contextQuality))
    const overallFaithful    = avg(results.map((r) => r.answerFaithfulness))
    const overallRelevance   = avg(results.map((r) => r.answerRelevance))
    const recallAll          = results.map((r) => r.contextRecall).filter((v): v is number => v !== undefined)
    const overallRecall      = recallAll.length > 0 ? avg(recallAll) : undefined

    const passed =
      overallQuality   >= THRESHOLDS.contextQuality &&
      overallFaithful  >= THRESHOLDS.answerFaithfulness &&
      overallRelevance >= THRESHOLDS.answerRelevance

    return {
      runId: `eval-${Date.now()}`,
      userId,
      clientId,
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalQuestions: results.length,
      contextQuality:     overallQuality,
      answerFaithfulness: overallFaithful,
      answerRelevance:    overallRelevance,
      ...(overallRecall !== undefined ? { contextRecall: overallRecall } : {}),
      passRate: results.length > 0 ? results.filter(passes).length / results.length : 0,
      categories,
      questions: results,
      passed,
    }
  }
}

export { THRESHOLDS as RAG_EVAL_THRESHOLDS }
