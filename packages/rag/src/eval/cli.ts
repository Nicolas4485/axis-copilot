#!/usr/bin/env node
// eval:rag CLI — runs the RAGAS-style RAG evaluation framework
//
// Usage:
//   pnpm eval:rag                              # all categories, all agents
//   pnpm eval:rag --agent mel                  # only Mel's competitive-intel questions
//   pnpm eval:rag --category financial-figures # filter by category
//   pnpm eval:rag --max 10 --userId <id>
//   pnpm eval:rag --ci                         # exit 1 if targets not met
//
// Required env: DATABASE_URL, ANTHROPIC_API_KEY, REDIS_URL, ...
// Optional env: EVAL_USER_EMAIL (looks up userId by email)

import { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '../index.js'
import { RagEvaluator, THRESHOLDS } from './rag-evaluator.js'
import type { QuestionCategory, AgentAlias } from './test-set.js'

const prisma = new PrismaClient()

// ─── CLI arg parsing ──────────────────────────────────────────

function parseArgs(): {
  category?: QuestionCategory
  agentTarget?: AgentAlias
  max?: number
  ci: boolean
  userId?: string
  email?: string
  clientId?: string
} {
  const args = process.argv.slice(2)
  const result: {
    category?: QuestionCategory
    agentTarget?: AgentAlias
    max?: number
    ci: boolean
    userId?: string
    email?: string
    clientId?: string
  } = { ci: false }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--category':
        result.category = args[++i] as QuestionCategory
        break
      case '--agent':
        result.agentTarget = args[++i] as AgentAlias
        break
      case '--max':
        result.max = parseInt(args[++i] ?? '150', 10)
        break
      case '--ci':
        result.ci = true
        break
      case '--userId': {
        const v = args[++i]
        if (v !== undefined) result.userId = v
        break
      }
      case '--email': {
        const v = args[++i]
        if (v !== undefined) result.email = v
        break
      }
      case '--clientId': {
        const v = args[++i]
        if (v !== undefined) result.clientId = v
        break
      }
    }
  }

  return result
}

// ─── Color helpers ────────────────────────────────────────────

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function fmt(v: number, threshold: number) {
  const pct = (v * 100).toFixed(1)
  const color = v >= threshold ? GREEN : v >= threshold * 0.9 ? YELLOW : RED
  return `${color}${pct}%${RESET}`
}

function bar(v: number, width = 20): string {
  const filled = Math.round(v * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()

  console.log(`\n${BOLD}AXIS RAG Evaluation Framework${RESET}`)
  console.log('═'.repeat(50))

  // Resolve userId
  let userId = args.userId
  if (!userId) {
    const email = args.email ?? process.env['EVAL_USER_EMAIL']
    if (email) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (!user) {
        console.error(`User with email ${email} not found`)
        process.exit(1)
      }
      userId = user.id
    } else {
      const user = await prisma.user.findFirst({ select: { id: true, email: true } })
      if (!user) {
        console.error('No users found in database. Run seed first.')
        process.exit(1)
      }
      userId = user.id
      console.log(`Using user: ${user.email} (${user.id})`)
    }
  }

  const engine = new InferenceEngine()
  const rag    = new RAGEngine({ engine, prisma })
  const evaluator = new RagEvaluator({ rag, engine, prisma })

  console.log(`\nRunning evaluation:`)
  console.log(`  User:       ${userId}`)
  console.log(`  Client:     ${args.clientId ?? 'all'}`)
  console.log(`  Agent:      ${args.agentTarget ?? 'all'}`)
  console.log(`  Category:   ${args.category ?? 'all'}`)
  console.log(`  Max Q:      ${args.max ?? 150}`)
  console.log(`\nTargets (LLM-judge metrics):`)
  console.log(`  Context Quality:      ${THRESHOLDS.contextQuality * 100}%`)
  console.log(`  Answer Faithfulness:  ${THRESHOLDS.answerFaithfulness * 100}%`)
  console.log(`  Answer Relevance:     ${THRESHOLDS.answerRelevance * 100}%`)
  console.log(`  Context Recall:       ${THRESHOLDS.contextRecall * 100}% (when ground truth present)`)
  console.log('\n' + '─'.repeat(50))

  const results = await evaluator.run({
    userId,
    clientId: args.clientId ?? null,
    ...(args.category    ? { categories:   [args.category]     } : {}),
    ...(args.agentTarget ? { agentTarget:  args.agentTarget    } : {}),
    ...(args.max !== undefined ? { maxQuestions: args.max       } : {}),
    onProgress: (d, total, question) => {
      const pct = Math.round((d / total) * 100)
      process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${question.substring(0, 60).padEnd(60)}`)
    },
  })

  process.stdout.write('\n\n')

  // ─── Results display ──────────────────────────────────────────

  console.log(`${BOLD}OVERALL RESULTS${RESET}`)
  console.log(`  Questions:   ${results.totalQuestions} evaluated in ${(results.durationMs / 1000).toFixed(1)}s`)
  console.log(`  Pass rate:   ${fmt(results.passRate, 0.7)} of questions passed all thresholds`)
  console.log('')
  console.log(`  Context Quality:     ${fmt(results.contextQuality, THRESHOLDS.contextQuality)}  ${bar(results.contextQuality)}`)
  console.log(`  Ans Faithfulness:    ${fmt(results.answerFaithfulness, THRESHOLDS.answerFaithfulness)}  ${bar(results.answerFaithfulness)}`)
  console.log(`  Ans Relevance:       ${fmt(results.answerRelevance, THRESHOLDS.answerRelevance)}  ${bar(results.answerRelevance)}`)
  if (results.contextRecall !== undefined) {
    console.log(`  Context Recall:      ${fmt(results.contextRecall, THRESHOLDS.contextRecall)}  ${bar(results.contextRecall)}`)
  }

  if (results.categories.length > 0) {
    console.log('\n' + '─'.repeat(50))
    console.log(`${BOLD}BY CATEGORY${RESET}`)
    for (const cat of results.categories) {
      if (cat.count === 0) continue
      console.log(`\n  ${cat.category} (${cat.count} questions)`)
      console.log(`    Context Quality:     ${fmt(cat.contextQuality, THRESHOLDS.contextQuality)}`)
      console.log(`    Ans Faithfulness:    ${fmt(cat.answerFaithfulness, THRESHOLDS.answerFaithfulness)}`)
      console.log(`    Ans Relevance:       ${fmt(cat.answerRelevance, THRESHOLDS.answerRelevance)}`)
      if (cat.contextRecall !== undefined) {
        console.log(`    Context Recall:      ${fmt(cat.contextRecall, THRESHOLDS.contextRecall)}`)
      }
    }
  }

  // Show failing questions
  const failing = results.questions.filter(
    (q) =>
      q.contextQuality < THRESHOLDS.contextQuality ||
      q.answerFaithfulness < THRESHOLDS.answerFaithfulness ||
      q.answerRelevance < THRESHOLDS.answerRelevance
  )

  if (failing.length > 0) {
    console.log('\n' + '─'.repeat(50))
    console.log(`${BOLD}FAILING QUESTIONS (${failing.length})${RESET}`)
    for (const q of failing.slice(0, 10)) {
      console.log(`\n  [${q.id}] [${q.agentTarget}] ${q.question.substring(0, 80)}`)
      console.log(`    Quality: ${fmt(q.contextQuality, THRESHOLDS.contextQuality)}  Faithful: ${fmt(q.answerFaithfulness, THRESHOLDS.answerFaithfulness)}  Relevant: ${fmt(q.answerRelevance, THRESHOLDS.answerRelevance)}`)
      if (q.error) console.log(`    ${RED}Error: ${q.error}${RESET}`)
      else console.log(`    Answer: ${q.answer.substring(0, 120)}`)
    }
    if (failing.length > 10) console.log(`  ... and ${failing.length - 10} more`)
  }

  console.log('\n' + '═'.repeat(50))
  if (results.passed) {
    console.log(`${GREEN}${BOLD}✓ ALL TARGETS MET — RAG quality is acceptable${RESET}`)
  } else {
    console.log(`${RED}${BOLD}✗ TARGETS NOT MET — RAG quality below threshold${RESET}`)
  }
  console.log('')

  await engine.shutdown()
  await prisma.$disconnect()

  if (args.ci && !results.passed) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Eval failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
