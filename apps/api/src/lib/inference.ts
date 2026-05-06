import { InferenceEngine, CostTracker } from '@axis/inference'
import type { CostEntry } from '@axis/inference'
import { prisma } from './prisma.js'

function buildEngine(): InferenceEngine {
  const costTracker = new CostTracker({
    onPersist: (entry: CostEntry) => {
      if (!entry.sessionId) return
      prisma.costRecord.create({
        data: {
          sessionId:    entry.sessionId,
          userId:       entry.userId,
          task:         entry.task,
          model:        entry.model,
          inputTokens:  entry.inputTokens,
          outputTokens: entry.outputTokens,
          cacheHit:     entry.cacheHit,
          costUsd:      entry.costUsd,
          latencyMs:    Math.round(entry.latencyMs),
        },
      }).catch((err: unknown) => {
        console.error(JSON.stringify({ event: 'costRecord.create.failed', error: String(err) }))
      })
    },
  })

  return new InferenceEngine({ costTracker })
}

export const sharedEngine = buildEngine()
