#!/usr/bin/env node
// eval:rag CLI — runs the RAG evaluation framework
//
// Usage:
//   pnpm eval:rag                          # all categories, all questions
//   pnpm eval:rag --category financial-figures
//   pnpm eval:rag --max 10 --userId <id>
//   pnpm eval:rag --ci                     # exit 1 if targets not met
//
// Required env: DATABASE_URL, ANTHROPIC_API_KEY, REDIS_URL, ...
// Optional env: EVAL_USER_EMAIL (looks up userId by email)

import { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '../index.js'
import { RagEvaluator, THRESHOLDS } from './rag-evaluator.js'
import type { QuestionCategory } from './test-set.js'

const prisma = new PrismaClient()

// ─── CLI arg parsing ──────────────────────────────────────────

function parseArgs(): {
  category?: QuestionCategory
  max?: number
  ci: boolean
  userId?: string
  email?: string
  clientId?: string
} {
  const args = process.argv.slice(2)
  const result: {
    category?: QuestionCategory
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
      case '--max':
        result.max = parseInt(args[++i] ?? '60', 10)
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
      // Use first user in the database
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
  const rag = new RAGEngine({ engine, prisma })

  const evaluator = new RagEvaluator({ rag, engine, prisma })

  console.log(`\nRunning evaluation:`)
  console.log(`  User:       ${userId}`)
  console.log(`  Client:     ${args.clientId ?? 'all'}`)
  console.log(`  Category:   ${args.category ?? 'all'}`)
  console.log(`  Max Q:      ${args.max ?? 60}`)
  console.log(`\nTargets:`)
  console.log(`  Context Precision:    ${THRESHOLDS.contextPrecision * 100}%`)
  console.log(`  Answer Faithfulness:  ${THRESHOLDS.answerFaithfulness * 100}%`)
  console.log(`  Answer Relevance:     ${THRESHOLDS.answerRelevance * 100}%`)
  console.log('\n' + '─'.repeat(50))

  let done = 0
  const results = await evaluator.run({
    userId,
    clientId: args.clientId ?? null,
    ...(args.category ? { categories: [args.category] } : {}),
    ...(args.max !== undefined ? { maxQuestions: args.max } : {}),
    onProgress: (d, total, question) => {
      done = d
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
  console.log(`  Context Precision:   ${fmt(results.contextPrecision, THRESHOLDS.contextPrecision)}  ${bar(results.contextPrecision)}`)
  console.log(`  Ans Faithfulness:    ${fmt(results.answerFaithfulness, THRESHOLDS.answerFaithfulness)}  ${bar(results.answerFaithfulness)}`)
  console.log(`  Ans Relevance:       ${fmt(results.answerRelevance, THRESHOLDS.answerRelevance)}  ${bar(results.answerRelevance)}`)

  if (results.categories.length > 0) {
    console.log('\n' + '─'.repeat(50))
    console.log(`${BOLD}BY CATEGORY${RESET}`)
    for (const cat of results.categories) {
      if (cat.count === 0) continue
      console.log(`\n  ${cat.category} (${cat.count} questions)`)
      console.log(`    Context Precision:   ${fmt(cat.contextPrecision, THRESHOLDS.contextPrecision)}`)
      console.log(`    Ans Faithfulness:    ${fmt(cat.answerFaithfulness, THRESHOLDS.answerFaithfulness)}`)
      console.log(`    Ans Relevance:       ${fmt(cat.answerRelevance, THRESHOLDS.answerRelevance)}`)
    }
  }

  // Show failing questions
  const failing = results.questions.filter(
    (q) =>
      q.contextPrecision < THRESHOLDS.contextPrecision ||
      q.answerFaithfulness < THRESHOLDS.answerFaithfulness ||
      q.answerRelevance < THRESHOLDS.answerRelevance
  )

  if (failing.length > 0) {
    console.log('\n' + '─'.repeat(50))
    console.log(`${BOLD}FAILING QUESTIONS (${failing.length})${RESET}`)
    for (const q of failing.slice(0, 10)) {
      console.log(`\n  [${q.id}] ${q.question.substring(0, 80)}`)
      console.log(`    Context: ${fmt(q.contextPrecision, THRESHOLDS.contextPrecision)}  Faithful: ${fmt(q.answerFaithfulness, THRESHOLDS.answerFaithfulness)}  Relevant: ${fmt(q.answerRelevance, THRESHOLDS.answerRelevance)}`)
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
