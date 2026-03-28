// Cost Tracker — per-session Redis dashboard and API helpers
// Tracks every model call's cost, tokens, and latency

import type { CostEntry, InferenceTask } from './types.js'

/** Aggregated cost summary for a session */
export interface SessionCostSummary {
  sessionId: string
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCalls: number
  cacheHitRate: number
  averageLatencyMs: number
  byModel: Record<string, ModelCostBreakdown>
  byTask: Record<string, TaskCostBreakdown>
  entries: CostEntry[]
}

export interface ModelCostBreakdown {
  model: string
  calls: number
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface TaskCostBreakdown {
  task: string
  calls: number
  costUsd: number
  averageLatencyMs: number
}

/** Global cost summary across all sessions for a user */
export interface GlobalCostSummary {
  userId: string
  totalCostUsd: number
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  cacheHitRate: number
  periodStart: string
  periodEnd: string
  byModel: Record<string, ModelCostBreakdown>
  byDay: Array<{ date: string; costUsd: number; calls: number }>
}

const COST_ENTRY_TTL_SECONDS = 30 * 24 * 60 * 60  // 30 days

/**
 * CostTracker stores and aggregates inference costs.
 *
 * Storage: Redis lists keyed by session and user.
 * Each CostEntry is logged when a model call completes.
 *
 * Provides:
 * - Per-session cost breakdown (GET /api/sessions/:id/cost)
 * - Global user summary (GET /api/cost/summary)
 */
export class CostTracker {
  // In-memory store until Redis is wired up
  private entries: CostEntry[] = []

  /**
   * Record a cost entry from a model call.
   */
  async record(entry: CostEntry): Promise<void> {
    this.entries.push(entry)

    console.log(
      `[Cost] ${entry.task} via ${entry.model}: ` +
      `${entry.inputTokens}in/${entry.outputTokens}out, ` +
      `$${entry.costUsd.toFixed(6)}, ${entry.latencyMs}ms` +
      (entry.cacheHit ? ' (cache hit)' : '')
    )

    // TODO: Store in Redis
    // const key = entry.sessionId
    //   ? `axis:cost:session:${entry.sessionId}`
    //   : `axis:cost:user:${entry.userId}`
    // await redis.rpush(key, JSON.stringify(entry))
    // await redis.expire(key, COST_ENTRY_TTL_SECONDS)
    //
    // Also store in user-level list for global summary
    // await redis.rpush(`axis:cost:user:${entry.userId}`, JSON.stringify(entry))

    void COST_ENTRY_TTL_SECONDS
  }

  /**
   * Get cost summary for a specific session.
   */
  async getSessionCost(sessionId: string): Promise<SessionCostSummary> {
    // TODO: Read from Redis
    // const raw = await redis.lrange(`axis:cost:session:${sessionId}`, 0, -1)
    // const entries = raw.map(r => JSON.parse(r) as CostEntry)
    const entries = this.entries.filter((e) => e.sessionId === sessionId)

    return this.aggregateSession(sessionId, entries)
  }

  /**
   * Get global cost summary for a user.
   */
  async getUserCostSummary(
    userId: string,
    periodDays: number = 30
  ): Promise<GlobalCostSummary> {
    // TODO: Read from Redis
    // const raw = await redis.lrange(`axis:cost:user:${userId}`, 0, -1)
    // const entries = raw.map(r => JSON.parse(r) as CostEntry)
    const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
    const entries = this.entries
      .filter((e) => e.userId === userId && e.timestamp >= cutoff)

    return this.aggregateGlobal(userId, entries, periodDays)
  }

  /**
   * Aggregate entries into a session cost summary.
   */
  private aggregateSession(sessionId: string, entries: CostEntry[]): SessionCostSummary {
    const byModel: Record<string, ModelCostBreakdown> = {}
    const byTask: Record<string, TaskCostBreakdown> = {}
    let totalCost = 0
    let totalInput = 0
    let totalOutput = 0
    let cacheHits = 0
    let totalLatency = 0

    for (const entry of entries) {
      totalCost += entry.costUsd
      totalInput += entry.inputTokens
      totalOutput += entry.outputTokens
      totalLatency += entry.latencyMs
      if (entry.cacheHit) cacheHits++

      // By model
      const modelKey = entry.model
      if (!byModel[modelKey]) {
        byModel[modelKey] = { model: modelKey, calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const m = byModel[modelKey]!
      m.calls++
      m.costUsd += entry.costUsd
      m.inputTokens += entry.inputTokens
      m.outputTokens += entry.outputTokens

      // By task
      const taskKey = entry.task
      if (!byTask[taskKey]) {
        byTask[taskKey] = { task: taskKey, calls: 0, costUsd: 0, averageLatencyMs: 0 }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const t = byTask[taskKey]!
      t.calls++
      t.costUsd += entry.costUsd
      t.averageLatencyMs = (t.averageLatencyMs * (t.calls - 1) + entry.latencyMs) / t.calls
    }

    return {
      sessionId,
      totalCostUsd: totalCost,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCalls: entries.length,
      cacheHitRate: entries.length > 0 ? cacheHits / entries.length : 0,
      averageLatencyMs: entries.length > 0 ? totalLatency / entries.length : 0,
      byModel,
      byTask,
      entries,
    }
  }

  /**
   * Aggregate entries into a global cost summary.
   */
  private aggregateGlobal(
    userId: string,
    entries: CostEntry[],
    periodDays: number
  ): GlobalCostSummary {
    const byModel: Record<string, ModelCostBreakdown> = {}
    const byDayMap: Record<string, { costUsd: number; calls: number }> = {}
    let totalCost = 0
    let totalInput = 0
    let totalOutput = 0
    let cacheHits = 0

    for (const entry of entries) {
      totalCost += entry.costUsd
      totalInput += entry.inputTokens
      totalOutput += entry.outputTokens
      if (entry.cacheHit) cacheHits++

      const modelKey = entry.model
      if (!byModel[modelKey]) {
        byModel[modelKey] = { model: modelKey, calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const m = byModel[modelKey]!
      m.calls++
      m.costUsd += entry.costUsd
      m.inputTokens += entry.inputTokens
      m.outputTokens += entry.outputTokens

      const day = entry.timestamp.slice(0, 10) // YYYY-MM-DD
      if (!byDayMap[day]) {
        byDayMap[day] = { costUsd: 0, calls: 0 }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const d = byDayMap[day]!
      d.costUsd += entry.costUsd
      d.calls++
    }

    const byDay = Object.entries(byDayMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()

    return {
      userId,
      totalCostUsd: totalCost,
      totalCalls: entries.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      cacheHitRate: entries.length > 0 ? cacheHits / entries.length : 0,
      periodStart,
      periodEnd: new Date().toISOString(),
      byModel,
      byDay,
    }
  }
}
