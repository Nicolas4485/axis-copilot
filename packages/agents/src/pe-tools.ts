// pe-tools.ts — PE workflow tools that need CimAnalyst and MemoWriter
// Fire-and-forget pattern: returns immediately, saves result as a session message when done
// (same pattern as specialist delegations — result appears in chat via 5-second polling)

import type { ToolContext, ToolResult, ToolDefinition } from '@axis/tools'
import { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { IngestionPipeline, extractFinancials, formatFinancialsForPrompt } from '@axis/ingestion'
import { google as googleWorkspace } from '@axis/tools'
const { getValidToken, getFileMetadata, downloadFileAuto } = googleWorkspace
// CimAnalyst and MemoWriter are lazy-loaded inside functions to break the circular
// dependency chain: base-agent → tool-registry → pe-tools → cim-analyst → base-agent
type CimAnalystType = import('./cim-analyst.js').CimAnalyst
type MemoWriterType = import('./memo-writer.js').MemoWriter

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

async function getDriveToken(userId: string): Promise<string> {
  const prisma = getPrisma()
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'GOOGLE_DRIVE' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration) {
    throw new Error('No Google Drive integration found — user has not connected Google account')
  }
  return getValidToken(
    {
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken ?? '',
      expiresAt: integration.expiresAt ?? new Date(0),
    },
    async (updated) => {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: updated.accessToken,
          refreshToken: updated.refreshToken,
          expiresAt: updated.expiresAt,
        },
      })
    }
  )
}

/** Save a result message to the session so it appears in chat via polling */
async function saveSessionMessage(
  sessionId: string,
  content: string,
  agent: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const prisma = getPrisma()
  await prisma.message.create({
    data: {
      sessionId,
      role: 'ASSISTANT',
      content,
      mode: 'intake',
      metadata: { agent, agentType: 'pe_workflow', ...metadata },
    },
  })
}

// ─── run_cim_analysis ─────────────────────────────────────────────────────────

export const runCimAnalysisDefinition: ToolDefinition = {
  name: 'run_cim_analysis',
  description: `Run a full PE due diligence analysis on a CIM. This triggers Alex (DueDiligenceAgent) who produces: fit score 1–10, red flags, financial extraction, LBO feasibility, management assessment, and IC questions. Returns immediately — full analysis appears in the chat in 3–5 minutes. Provide a Google Drive file ID (get from search_google_drive) or an existing documentId. Run this before generating an IC memo.`,
  inputSchema: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'Deal ID. Create with create_deal if it doesn\'t exist yet.' },
      driveFileId: { type: 'string', description: 'Google Drive file ID of the CIM PDF' },
      documentId: { type: 'string', description: 'Existing document ID already on the deal (alternative to driveFileId)' },
    },
    required: ['dealId'],
  },
}

export async function runCimAnalysis(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  const dealId = input.dealId as string

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: context.userId },
  })
  if (!deal) {
    return { success: false, data: null, error: `Deal not found: ${dealId}`, durationMs: 0 }
  }

  // Fire and forget — return immediately, result saves to session when done
  void (async () => {
    try {
      const engine = new InferenceEngine()
      const rag = new RAGEngine({ engine, prisma })
      let documentId: string | null = null
      let financialOptions: { formattedBlock: string; rawData: Record<string, unknown> | null } | undefined

      if (input.driveFileId) {
        const token = await getDriveToken(context.userId)
        const meta = await getFileMetadata(token, input.driveFileId as string)
        const buffer = await downloadFileAuto(token, input.driveFileId as string, meta.mimeType ?? 'application/pdf')

        const pipeline = new IngestionPipeline({ prisma, engine })
        const ingested = await pipeline.ingestDocument(
          buffer.content,
          meta.name ?? 'cim.pdf',
          'application/pdf',
          context.userId,
          { clientId: deal.clientId, dealId, sourceType: 'GDRIVE', sourceId: input.driveFileId as string }
        )
        documentId = ingested.documentId

        try {
          const raw = await extractFinancials(buffer.content)
          if (raw) {
            financialOptions = {
              formattedBlock: formatFinancialsForPrompt(raw),
              rawData: raw as unknown as Record<string, unknown>,
            }
          }
        } catch { /* best-effort */ }

      } else if (input.documentId) {
        documentId = input.documentId as string
        const doc = await prisma.knowledgeDocument.findFirst({
          where: { id: documentId, userId: context.userId },
          select: { sourcePath: true },
        })
        if (doc?.sourcePath) {
          try {
            const { readFile } = await import('node:fs/promises')
            const buffer = await readFile(doc.sourcePath)
            const raw = await extractFinancials(buffer)
            if (raw) {
              financialOptions = {
                formattedBlock: formatFinancialsForPrompt(raw),
                rawData: raw as unknown as Record<string, unknown>,
              }
            }
          } catch { /* non-fatal */ }
        }
      } else {
        const existingDoc = await prisma.knowledgeDocument.findFirst({
          where: { dealId, userId: context.userId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (existingDoc) documentId = existingDoc.id
      }

      if (!documentId) {
        await saveSessionMessage(
          context.sessionId,
          `**Alex — CIM Analysis Failed**\n\nNo CIM document found for ${deal.name}. Please upload a PDF to the deal workspace first.`,
          'alex',
          { dealId, error: true }
        )
        return
      }

      const { CimAnalyst } = await import('./cim-analyst.js')
      const analyst: CimAnalystType = new CimAnalyst(engine, prisma, rag)
      const result = await analyst.analyze(
        documentId,
        dealId,
        context.userId,
        deal.clientId,
        (_event) => { /* noop */ },
        financialOptions
      )

      // Auto-advance to SCREENING
      if (deal.stage === 'SOURCING') {
        await prisma.deal.update({ where: { id: dealId }, data: { stage: 'SCREENING' } })
      }

      // Format the result as a rich chat message
      // CIMAnalysisResult shape: { companySnapshot, fitScore: FitScore, redFlags: {description,severity,pageRef}[], keyQuestions: string[], agentInsights, conflicts }
      const fitScore = result.fitScore as { overallFit?: number; recommendation?: string; rationale?: Record<string, string> } | undefined
      const overallFit = fitScore?.overallFit ?? null
      const recommendation = fitScore?.recommendation ?? null

      const rawRedFlags = result.redFlags as Array<{ description?: string; severity?: string } | string> | undefined
      const redFlagsList = rawRedFlags?.length
        ? rawRedFlags.map((f) => {
            const desc = typeof f === 'string' ? f : (f.description ?? JSON.stringify(f))
            const sev  = typeof f === 'object' ? f.severity : null
            return `- 🚩 ${desc}${sev ? ` *(${sev})*` : ''}`
          }).join('\n')
        : '— None identified'

      // Correct field name is keyQuestions (not icQuestions)
      const icQList = (result.keyQuestions as string[] | undefined)?.slice(0, 5)
        .map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') ?? ''

      const snapshot = result.companySnapshot as {
        revenue?: string; ebitda?: string; ebitdaMargin?: string; revenueGrowthYoY?: string;
        primaryMarket?: string; businessModel?: string; employees?: string
      } | undefined

      const financialLine = snapshot
        ? [
            snapshot.revenue ? `Revenue: ${snapshot.revenue}` : null,
            snapshot.ebitda ? `EBITDA: ${snapshot.ebitda}` : null,
            snapshot.ebitdaMargin ? `Margin: ${snapshot.ebitdaMargin}` : null,
            snapshot.revenueGrowthYoY ? `Growth: ${snapshot.revenueGrowthYoY}` : null,
          ].filter(Boolean).join(' · ')
        : null

      const insights = (result.agentInsights as { alex?: string } | undefined)?.alex

      const content = `## Alex — CIM Analysis: ${deal.name}

**Fit Score: ${overallFit ?? '—'}/100** · Recommendation: **${recommendation ?? '—'}**
${financialLine ? `\n*${financialLine}*` : ''}

${insights ? `### Alex's Take\n${insights}\n` : ''}
### Red Flags
${redFlagsList}

### Top IC Questions
${icQList || '— None generated'}

---
*Full analysis with financial tables, radar chart, and sector benchmarks at [Deal Workspace](/deals/${dealId}/cim-analysis). Run \`generate_ic_memo\` to produce the full IC memo.*`

      await saveSessionMessage(context.sessionId, content, 'alex', { dealId, fitScore: result.fitScore })
      console.log(`[PETools] ✓ CIM analysis saved to session ${context.sessionId} for ${deal.name}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[PETools] CIM analysis failed: ${msg}`)
      await saveSessionMessage(
        context.sessionId,
        `**Alex — CIM Analysis Failed**\n\nSomething went wrong analysing ${deal.name}: ${msg}`,
        'alex',
        { dealId, error: true }
      ).catch(() => {})
    }
  })()

  return {
    success: true,
    data: {
      status: 'started',
      dealId,
      company: deal.name,
      message: `Alex is running the full CIM analysis on ${deal.name}. This takes 3–5 minutes — the results will appear in this chat automatically. You don't need to wait or ask again.`,
    },
    durationMs: 0,
  }
}

// ─── generate_ic_memo ─────────────────────────────────────────────────────────

export const generateIcMemoDefinition: ToolDefinition = {
  name: 'generate_ic_memo',
  description: `Generate a full 13-section Investment Committee memo. Sections: (1) Executive Summary, (2) Company Overview, (3) Market Analysis, (4) Financial Analysis, (5) LBO Returns Analysis — bear/base/bull IRR and MOIC, (6) Financing Structure, (7) Investment Thesis, (8) Key Risks & Mitigants, (9) Exit Analysis, (10) Management Assessment, (11) Value Creation Plan — 100-day framework, (12) Due Diligence Findings & Open Items, (13) Recommendation. Returns immediately — full memo link appears in chat in 5–10 minutes. Run run_cim_analysis first for best output.`,
  inputSchema: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'Deal ID' },
    },
    required: ['dealId'],
  },
}

export async function generateIcMemo(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  const dealId = input.dealId as string

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: context.userId },
  })
  if (!deal) {
    return { success: false, data: null, error: `Deal not found: ${dealId}`, durationMs: 0 }
  }

  // Fire and forget
  void (async () => {
    try {
      const engine = new InferenceEngine()
      const rag = new RAGEngine({ engine, prisma })
      const { MemoWriter } = await import('./memo-writer.js')
      const writer: MemoWriterType = new MemoWriter(engine, prisma, rag)

      const result = await writer.generate(
        dealId,
        context.userId,
        deal.clientId,
        (_event) => { /* noop */ }
      )

      // Auto-advance stage
      if (deal.stage === 'SOURCING' || deal.stage === 'SCREENING') {
        await prisma.deal.update({ where: { id: dealId }, data: { stage: 'IC_MEMO' } })
      }

      // MemoResult.sections is MemoSection[] — array with { id, title, content, generatedAt }
      const sections = result.sections as Array<{ id: string; title: string; content: string }> | undefined
      const sectionCount = sections?.length ?? 0

      // Find recommendation section by ID (actual ID is 'recommendation', not 'investment_recommendation')
      const recommendationSection = sections?.find((s) => s.id === 'recommendation' || s.id === 'investment_recommendation')
      const recommendationExcerpt = recommendationSection?.content?.slice(0, 400) ?? null

      // Build section index for display
      const sectionList = sections?.map((s) => `• ${s.title}`).join('\n') ?? ''

      const content = `## IC Memo Ready: ${deal.name}

**${sectionCount}/13 sections generated** — full memo available in the deal workspace.

${recommendationExcerpt ? `### Recommendation (excerpt)\n${recommendationExcerpt}…\n` : ''}
${sectionList ? `<details>\n<summary>Sections generated</summary>\n\n${sectionList}\n</details>` : ''}

---
**[→ View Full IC Memo](/deals/${dealId}/memo)** — export as PDF or PowerPoint from the memo page.

*Deal advanced to IC Memo stage.*`

      await saveSessionMessage(context.sessionId, content, 'memo', { dealId, sectionCount })
      console.log(`[PETools] ✓ IC memo saved to session ${context.sessionId} for ${deal.name}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[PETools] IC memo generation failed: ${msg}`)
      await saveSessionMessage(
        context.sessionId,
        `**IC Memo Generation Failed**\n\nSomething went wrong generating the memo for ${deal.name}: ${msg}`,
        'memo',
        { dealId, error: true }
      ).catch(() => {})
    }
  })()

  return {
    success: true,
    data: {
      status: 'started',
      dealId,
      company: deal.name,
      message: `Generating the IC memo for ${deal.name} now — all 13 sections including LBO returns, exit analysis, and investment recommendation. This takes 5–10 minutes. The memo link will appear in this chat automatically when ready.`,
    },
    durationMs: 0,
  }
}
