// CimAnalyst — standalone CIM pipeline orchestrator (not a BaseAgent)
// Runs a 5-step workflow: extract → conflicts → DD agent → score → summary
// Called by POST /api/deals/:id/cim-analysis (SSE)

import type { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { InfiniteMemory } from '@axis/memory'
import { DueDiligenceAgent } from './specialists/due-diligence-agent.js'
import type { AgentContext } from './types.js'
import { findSectorBenchmark, formatBenchmarkForPrompt, DEFAULT_FIT_WEIGHTS } from './sector-benchmarks.js'

// ─── Public types ──────────────────────────────────────────────

export interface CompanySnapshot {
  name: string
  hq: string | null
  founded: string | null
  employees: string | null
  revenue: string | null
  ebitda: string | null
  ebitdaMargin: string | null
  revenueGrowthYoY: string | null
  description: string | null
  businessModel: string | null
  primaryMarket: string | null
  productsServices: string[]
  keyCustomers: string[]
  customerConcentration: string | null
  managementTeam: Array<{ name: string; title: string; tenure?: string }>
  keyRisks: string[]
  growthInitiatives: string[]
  financials: Array<{ year: string; revenue: string; ebitda?: string; growth?: string }>
  auditedFinancials: boolean
  askPrice: string | null
  proposedEVEBITDA: number | null
  pageCount: number | null
}

export interface FitScore {
  businessQuality: number
  financialQuality: number
  managementStrength: number
  marketDynamics: number
  dealStructure: number
  overallFit: number
  rationale: Record<string, string>
  recommendation: 'PASS' | 'PROCEED' | 'STRONG_PROCEED'
  redFlags: Array<{ flag: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; pageRef: string }>
}

export interface CIMConflict {
  entity: string
  property: string
  valueA: string
  sourceA: string
  valueB: string
  sourceB: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface CIMAnalysisResult {
  documentId: string
  dealId: string
  durationMs: number
  companySnapshot: CompanySnapshot
  fitScore: FitScore
  redFlags: Array<{ description: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; pageRef: string }>
  keyQuestions: string[]
  agentInsights: { alex: string }
  conflicts: CIMConflict[]
  /** Structured financial data extracted from the PDF (serialized, for UI display) */
  extractedFinancials?: Record<string, unknown> | null
}

export interface CimProgressEvent {
  type: 'step'
  step: string
  progress: number
  message: string
}

// ─── CimAnalyst ────────────────────────────────────────────────

export class CimAnalyst {
  private engine: InferenceEngine
  private prisma: PrismaClient
  private rag: RAGEngine
  private memory: InfiniteMemory

  constructor(engine: InferenceEngine, prisma: PrismaClient, rag: RAGEngine) {
    this.engine = engine
    this.prisma = prisma
    this.rag = rag
    this.memory = new InfiniteMemory({ engine, prisma })
  }

  async analyze(
    documentId: string,
    dealId: string,
    userId: string,
    clientId: string | null,
    onProgress: (event: CimProgressEvent) => void,
    financialOptions?: {
      /** Pre-formatted text block for prompt injection */
      formattedBlock: string
      /** Raw structured data for storage/display (serializable) */
      rawData: Record<string, unknown> | null
    }
  ): Promise<CIMAnalysisResult> {
    const startTime = Date.now()

    // ─── Step 1: Extract company structure (→15%) ──────────────
    onProgress({ type: 'step', step: 'extract', progress: 5, message: 'Querying document for structure...' })

    const structureContext = await this.rag.query(
      'company overview financials management team customers key risks growth initiatives revenue EBITDA',
      userId,
      clientId,
      { targetTokens: 6000, maxChunks: 20 }
    )

    const structureResponse = await this.engine.route('agent_response', {
      systemPromptKey: 'CIM_STRUCTURE_EXTRACT',
      messages: [{
        role: 'user',
        content: `Extract structured fields from this CIM. Return ONLY valid JSON.\n\nDocument context:\n${structureContext.context}`,
      }],
      maxTokens: 2000,
      userId,
    })

    const structureText = structureResponse.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const companySnapshot = this.parseCompanySnapshot(structureText)
    onProgress({ type: 'step', step: 'extract', progress: 15, message: `Extracted structure for: ${companySnapshot.name || 'Unknown Company'}` })

    // Resolve sector benchmarks — inject into scoring and summary for context
    const sectorHint = companySnapshot.primaryMarket ?? companySnapshot.businessModel ?? ''
    const sectorBenchmark = findSectorBenchmark(sectorHint, companySnapshot.name)
    const benchmarkBlock = sectorBenchmark ? `\n\n${formatBenchmarkForPrompt(sectorBenchmark)}` : ''

    // Financial extraction block — pre-formatted by the route handler from PDF text extraction
    const financialBlock = financialOptions?.formattedBlock
      ? `\n\n${financialOptions.formattedBlock}`
      : ''

    // ─── Step 2: Conflict detection (→30%) ─────────────────────
    onProgress({ type: 'step', step: 'conflicts', progress: 20, message: 'Checking for data conflicts...' })

    const conflictRecords = await this.prisma.conflictRecord.findMany({
      where: {
        userId,
        ...(clientId ? { clientId } : {}),
        status: 'UNRESOLVED',
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })

    const conflicts: CIMConflict[] = conflictRecords.map((r) => ({
      entity: r.entityName,
      property: r.property,
      valueA: r.valueA,
      sourceA: r.sourceDocA,
      valueB: r.valueB,
      sourceB: r.sourceDocB,
      severity: this.inferConflictSeverity(r.property, r.entityType),
    }))

    onProgress({ type: 'step', step: 'conflicts', progress: 30, message: `Found ${conflicts.length} conflict(s)` })

    // ─── Step 3: Due diligence agent — Alex (→60%) ─────────────
    onProgress({ type: 'step', step: 'agents', progress: 35, message: 'Running due diligence analysis...' })

    const ddAgent = new DueDiligenceAgent(this.engine, this.memory, this.rag)

    const agentCtx: AgentContext = {
      sessionId: `cim-${dealId}`,
      clientId,
      userId,
      assembledContext: structureContext.context,
      ragResult: structureContext,
      stakeholders: [],
      clientRecord: null,
    }

    const alexQuery = companySnapshot.name
      ? `Conduct a full PE due diligence assessment of ${companySnapshot.name}. Evaluate business quality, financial quality, and management depth. Flag all risks and identify key questions for the management meeting.`
      : 'Conduct a full PE due diligence assessment of this company. Evaluate business quality, financial quality, and management depth. Flag all risks and identify key questions for the management meeting.'

    const alexResponse = await ddAgent.run(alexQuery, agentCtx)
    onProgress({ type: 'step', step: 'agents', progress: 60, message: 'Due diligence analysis complete' })

    // ─── Step 4: Fit scoring (→75%) ────────────────────────────
    onProgress({ type: 'step', step: 'scoring', progress: 65, message: 'Scoring deal fit...' })

    const scoringContext = [
      `Company Structure:\n${structureText}`,
      `Due Diligence Assessment:\n${alexResponse.content}`,
      conflicts.length > 0
        ? `Data Conflicts (${conflicts.length}):\n${conflicts.map((c) => `- ${c.entity}.${c.property}: ${c.valueA} vs ${c.valueB}`).join('\n')}`
        : 'No data conflicts detected.',
    ].join('\n\n---\n\n')

    const weights = sectorBenchmark?.fitScoreWeights ?? DEFAULT_FIT_WEIGHTS

    const weightBlock = `
SCORING WEIGHTS FOR THIS SECTOR (${sectorBenchmark?.sector ?? 'General / Unknown'}):
businessQuality:    ${(weights.businessQuality * 100).toFixed(0)}%
financialQuality:   ${(weights.financialQuality * 100).toFixed(0)}%
managementStrength: ${(weights.managementStrength * 100).toFixed(0)}%
marketDynamics:     ${(weights.marketDynamics * 100).toFixed(0)}%
dealStructure:      ${(weights.dealStructure * 100).toFixed(0)}%
Sum: 100% — use EXACTLY these weights to compute overallFit.`

    const scoreResponse = await this.engine.route('user_report', {
      systemPromptKey: 'CIM_FIT_SCORE',
      messages: [{
        role: 'user',
        content: `Score this deal across 5 dimensions. Return ONLY valid JSON.\n\n${scoringContext}${financialBlock}${benchmarkBlock}\n\n${weightBlock}`,
      }],
      maxTokens: 1500,
      userId,
    })

    const scoreText = scoreResponse.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const fitScore = this.parseFitScore(scoreText)
    onProgress({ type: 'step', step: 'scoring', progress: 75, message: `Fit score: ${fitScore.overallFit}/100 — ${fitScore.recommendation}` })

    // ─── Step 5: Summary + key questions (→90%) ────────────────
    onProgress({ type: 'step', step: 'summary', progress: 80, message: 'Generating investment summary...' })

    const summaryResponse = await this.engine.route('user_report', {
      systemPromptKey: 'CIM_SUMMARY',
      messages: [{
        role: 'user',
        content: [
          `Company: ${companySnapshot.name || 'Unknown'}`,
          `Recommendation: ${fitScore.recommendation}`,
          `Overall Fit Score: ${fitScore.overallFit}/100`,
          '',
          `Company Structure:\n${structureText}`,
          '',
          `Due Diligence (Alex):\n${alexResponse.content}`,
          '',
          `Red Flags from scoring:\n${fitScore.redFlags.map((f) => `[${f.severity}] ${f.flag} (${f.pageRef})`).join('\n') || 'None'}`,
          '',
          `Data Conflicts:\n${conflicts.map((c) => `${c.entity}.${c.property}: ${c.valueA} vs ${c.valueB}`).join('\n') || 'None'}`,
          financialBlock ? `\n${financialBlock}` : '',
          benchmarkBlock ? `\n${benchmarkBlock}` : '',
        ].join('\n'),
      }],
      maxTokens: 2000,
      userId,
    })

    const summaryText = summaryResponse.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Extract key questions from Alex's response and scoring red flags
    const keyQuestions = this.extractKeyQuestions(alexResponse.content, fitScore)

    // Merge red flags from fit score
    const redFlags = fitScore.redFlags.map((f) => ({
      description: f.flag,
      severity: f.severity,
      pageRef: f.pageRef,
    }))

    onProgress({ type: 'step', step: 'summary', progress: 90, message: 'Summary generated' })

    // ─── Step 6: Persist result (→100%) ────────────────────────
    const result: CIMAnalysisResult = {
      documentId,
      dealId,
      durationMs: Date.now() - startTime,
      companySnapshot,
      fitScore,
      redFlags,
      keyQuestions,
      agentInsights: { alex: alexResponse.content },
      conflicts,
      extractedFinancials: financialOptions?.rawData ?? null,
    }

    await this.persistResult(result, userId, clientId, summaryText)
    onProgress({ type: 'step', step: 'done', progress: 100, message: 'Analysis complete' })

    return result
  }

  // ─── Private helpers ───────────────────────────────────────────

  private parseCompanySnapshot(text: string): CompanySnapshot {
    const defaults: CompanySnapshot = {
      name: 'Unknown', hq: null, founded: null, employees: null,
      revenue: null, ebitda: null, ebitdaMargin: null, revenueGrowthYoY: null,
      description: null, businessModel: null, primaryMarket: null,
      productsServices: [], keyCustomers: [], customerConcentration: null,
      managementTeam: [], keyRisks: [], growthInitiatives: [], financials: [],
      auditedFinancials: false, askPrice: null, proposedEVEBITDA: null, pageCount: null,
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch?.[0]) return defaults
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      return {
        name: (parsed['companyName'] as string | null) ?? defaults.name,
        hq: (parsed['hq'] as string | null) ?? null,
        founded: (parsed['founded'] as string | null) ?? null,
        employees: parsed['employeeCount'] != null ? String(parsed['employeeCount']) : null,
        revenue: (parsed['revenue'] as string | null) ?? null,
        ebitda: (parsed['ebitda'] as string | null) ?? null,
        ebitdaMargin: (parsed['ebitdaMargin'] as string | null) ?? null,
        revenueGrowthYoY: (parsed['revenueGrowthYoY'] as string | null) ?? null,
        description: null,
        businessModel: (parsed['businessModel'] as string | null) ?? null,
        primaryMarket: (parsed['primaryMarket'] as string | null) ?? null,
        productsServices: (parsed['productsServices'] as string[]) ?? [],
        keyCustomers: (parsed['keyCustomers'] as string[]) ?? [],
        customerConcentration: (parsed['customerConcentration'] as string | null) ?? null,
        managementTeam: (parsed['managementTeam'] as Array<{ name: string; title: string; tenure?: string }>) ?? [],
        keyRisks: (parsed['keyRisks'] as string[]) ?? [],
        growthInitiatives: (parsed['growthInitiatives'] as string[]) ?? [],
        financials: [],
        auditedFinancials: (parsed['auditedFinancials'] as boolean) ?? false,
        askPrice: (parsed['askPrice'] as string | null) ?? null,
        proposedEVEBITDA: (parsed['proposedEVEBITDA'] as number | null) ?? null,
        pageCount: parsed['pageCount'] != null ? Number(parsed['pageCount']) : null,
      }
    } catch {
      return defaults
    }
  }

  private parseFitScore(text: string): FitScore {
    const defaults: FitScore = {
      businessQuality: 0, financialQuality: 0, managementStrength: 0,
      marketDynamics: 0, dealStructure: 0, overallFit: 0,
      rationale: {}, recommendation: 'PASS', redFlags: [],
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch?.[0]) return defaults
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      const dim = (key: string): number => {
        const val = parsed[key] as Record<string, unknown> | undefined
        return typeof val?.['score'] === 'number' ? (val['score'] as number) : 0
      }

      const rationale: Record<string, string> = {}
      for (const key of ['businessQuality', 'financialQuality', 'managementStrength', 'marketDynamics', 'dealStructure']) {
        const val = parsed[key] as Record<string, unknown> | undefined
        if (typeof val?.['rationale'] === 'string') {
          rationale[key] = val['rationale'] as string
        }
      }

      return {
        businessQuality: dim('businessQuality'),
        financialQuality: dim('financialQuality'),
        managementStrength: dim('managementStrength'),
        marketDynamics: dim('marketDynamics'),
        dealStructure: dim('dealStructure'),
        overallFit: typeof parsed['overallFit'] === 'number' ? (parsed['overallFit'] as number) : 0,
        rationale,
        recommendation: (['PASS', 'PROCEED', 'STRONG_PROCEED'].includes(parsed['recommendation'] as string)
          ? parsed['recommendation']
          : 'PASS') as FitScore['recommendation'],
        redFlags: (parsed['redFlags'] as Array<{ flag: string; severity: string; pageRef: string }> ?? []).map((f) => ({
          flag: f.flag ?? '',
          severity: (['HIGH', 'MEDIUM', 'LOW'].includes(f.severity) ? f.severity : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
          pageRef: f.pageRef ?? '',
        })),
      }
    } catch {
      return defaults
    }
  }

  private extractKeyQuestions(ddContent: string, fitScore: FitScore): string[] {
    const questions: string[] = []

    // Pull questions from Alex's response (lines ending with ?)
    const questionLines = ddContent.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('?') && l.length > 20 && l.length < 200)
      .slice(0, 5)

    questions.push(...questionLines)

    // Add questions from red flags
    for (const flag of fitScore.redFlags.slice(0, 3)) {
      if (flag.severity === 'HIGH') {
        questions.push(`What is the explanation for ${flag.flag}?`)
      }
    }

    return [...new Set(questions)].slice(0, 8)
  }

  private inferConflictSeverity(property: string, entityType: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const highPriorityProps = ['revenue', 'ebitda', 'margin', 'growth', 'valuation', 'price']
    const propLower = property.toLowerCase()
    if (highPriorityProps.some((p) => propLower.includes(p))) return 'HIGH'
    if (entityType === 'FINANCIAL_REPORT') return 'HIGH'
    return 'MEDIUM'
  }

  private async persistResult(
    result: CIMAnalysisResult,
    userId: string,
    clientId: string | null,
    summaryText: string
  ): Promise<void> {
    try {
      await this.prisma.agentMemory.create({
        data: {
          userId,
          ...(clientId ? { clientId } : {}),
          memoryType: 'SEMANTIC',
          content: JSON.stringify({ ...result, summary: summaryText }),
          tags: [result.dealId, result.documentId, 'cim_analysis', result.companySnapshot.name ?? 'unknown'],
        },
      })
    } catch (err) {
      console.warn('[CimAnalyst] Failed to persist result to agent memory:', err instanceof Error ? err.message : err)
    }
  }
}
