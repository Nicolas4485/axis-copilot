// deal-tools.ts — PE pipeline tools for Aria
// list_deals, create_deal, get_deal_status, move_deal_stage

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient, type DealStage, type Priority } from '@prisma/client'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

// ─── list_deals ──────────────────────────────────────────────────────────────

export const listDealsDefinition: ToolDefinition = {
  name: 'list_deals',
  description: 'List all deals in the PE pipeline. Returns deal names, stages, and IDs. Use this to see the current pipeline, find a deal ID before running analysis, or answer questions about what deals are being tracked.',
  inputSchema: {
    type: 'object',
    properties: {
      stage: {
        type: 'string',
        enum: ['SOURCING', 'SCREENING', 'DILIGENCE', 'IC_MEMO', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'],
        description: 'Filter by stage (optional — omit to list all deals)',
      },
    },
  },
}

export async function listDeals(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  try {
    const where: Record<string, unknown> = { userId: context.userId }
    if (input['stage']) where['stage'] = input['stage']

    const deals = await prisma.deal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { select: { name: true } },
        _count: { select: { documents: true } },
      },
    })

    const formatted = deals.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      priority: d.priority,
      sector: d.sector ?? null,
      dealSize: d.dealSize ?? null,
      client: d.client?.name ?? null,
      documentCount: d._count.documents,
      updatedAt: d.updatedAt.toISOString(),
    }))

    return {
      success: true,
      data: { deals: formatted, total: formatted.length },
      durationMs: 0,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to list deals',
      durationMs: 0,
    }
  }
}

// ─── create_deal ─────────────────────────────────────────────────────────────

export const createDealDefinition: ToolDefinition = {
  name: 'create_deal',
  description: 'Create a new deal in the PE pipeline. Use when the user wants to track a new company or start a new investment process. Automatically places the deal in SOURCING stage. Returns the deal ID needed for analysis tools.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Deal / company name (e.g. "Nexus DataOps")' },
      sector: { type: 'string', description: 'Industry sector (e.g. "SaaS", "Healthcare", "Industrials")' },
      dealSize: { type: 'string', description: 'Approximate deal size (e.g. "$50M–$100M")' },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        description: 'Deal priority (default MEDIUM)',
      },
      notes: { type: 'string', description: 'Any initial notes or context about the deal' },
    },
    required: ['name'],
  },
}

export async function createDeal(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  try {
    const dealName = input['name'] as string

    // Find or create a client record for this company
    let client = await prisma.client.findFirst({
      where: { userId: context.userId, name: dealName },
    })

    if (!client) {
      client = await prisma.client.create({
        data: {
          userId: context.userId,
          name: dealName,
          industry: (input['sector'] as string | undefined) ?? null,
        },
      })
    }

    const rawPriority = (input['priority'] as string | undefined) ?? 'MEDIUM'
    const priority = (['LOW', 'MEDIUM', 'HIGH'].includes(rawPriority) ? rawPriority : 'MEDIUM') as Priority

    const deal = await prisma.deal.create({
      data: {
        userId: context.userId,
        clientId: client.id,
        name: dealName,
        sector: (input['sector'] as string | undefined) ?? null,
        dealSize: (input['dealSize'] as string | undefined) ?? null,
        priority,
        stage: 'SOURCING',
        notes: (input['notes'] as string | undefined) ?? null,
      },
    })

    return {
      success: true,
      data: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        clientId: client.id,
        message: `Deal created for "${deal.name}". Use deal ID "${deal.id}" with run_cim_analysis or generate_ic_memo.`,
      },
      durationMs: 0,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to create deal',
      durationMs: 0,
    }
  }
}

// ─── get_deal_status ──────────────────────────────────────────────────────────

export const getDealStatusDefinition: ToolDefinition = {
  name: 'get_deal_status',
  description: 'Get the full status of a deal: stage, documents uploaded, whether CIM analysis has been run, whether an IC memo exists. Use this before deciding what step to take next on a deal.',
  inputSchema: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'Deal ID (get from list_deals if unknown)' },
    },
    required: ['dealId'],
  },
}

export async function getDealStatus(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: input['dealId'] as string, userId: context.userId },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, sourceType: true, docType: true, createdAt: true },
        },
        sessions: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { id: true, title: true, mode: true, updatedAt: true },
        },
      },
    })

    if (!deal) {
      return { success: false, data: null, error: `Deal not found: ${input['dealId']}`, durationMs: 0 }
    }

    const dealId = input['dealId'] as string

    // CIM analysis and IC memo are stored as SEMANTIC AgentMemory records
    // whose JSON content contains the dealId.
    // CIM analysis: contains dealId but NOT '"type":"ic_memo"'
    // IC memo:      contains dealId AND '"type":"ic_memo"'
    const cimMemory = await prisma.agentMemory.findFirst({
      where: {
        userId: context.userId,
        memoryType: 'SEMANTIC',
        content: { contains: dealId },
        NOT: { content: { contains: '"type":"ic_memo"' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const icMemoMemory = await prisma.agentMemory.findFirst({
      where: {
        AND: [
          { userId: context.userId },
          { memoryType: 'SEMANTIC' },
          { content: { contains: dealId } },
          { content: { contains: '"type":"ic_memo"' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    // Extract CIM summary fields if the memory record exists
    let cimSummary: Record<string, unknown> | null = null
    if (cimMemory) {
      try {
        const parsed = JSON.parse(cimMemory.content) as Record<string, unknown>
        cimSummary = {
          fitScore: parsed['fitScore'] ?? parsed['fit_score'] ?? null,
          redFlags: parsed['redFlags'] ?? parsed['red_flags'] ?? [],
          summary: parsed['summary'] ?? null,
          createdAt: cimMemory.createdAt.toISOString(),
        }
      } catch { /* content not parseable as JSON — ignore */ }
    }

    return {
      success: true,
      data: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        priority: deal.priority,
        sector: deal.sector ?? null,
        dealSize: deal.dealSize ?? null,
        documents: deal.documents.map((d) => ({
          id: d.id,
          title: d.title,
          sourceType: d.sourceType,
          docType: d.docType ?? null,
        })),
        hasCimAnalysis: !!cimMemory,
        cimAnalysis: cimSummary,
        hasIcMemo: !!icMemoMemory,
        recentSession: deal.sessions[0] ?? null,
        nextSteps: buildNextSteps(deal, !!cimMemory, !!icMemoMemory),
      },
      durationMs: 0,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to get deal status',
      durationMs: 0,
    }
  }
}

function buildNextSteps(
  deal: { stage: string; documents: { id: string }[] },
  hasCimAnalysis: boolean,
  hasIcMemo: boolean
): string[] {
  const steps: string[] = []
  if (deal.documents.length === 0) steps.push('Upload a CIM document (use run_cim_analysis with a Drive file ID)')
  if (deal.documents.length > 0 && !hasCimAnalysis) steps.push('Run CIM analysis (use run_cim_analysis with the document ID)')
  if (hasCimAnalysis && !hasIcMemo) steps.push('Generate IC memo (use generate_ic_memo)')
  if (hasIcMemo && deal.stage === 'SCREENING') steps.push('Move deal to IC_MEMO stage (use move_deal_stage)')
  return steps
}

// ─── move_deal_stage ──────────────────────────────────────────────────────────

export const moveDealStageDefinition: ToolDefinition = {
  name: 'move_deal_stage',
  description: 'Move a deal to a different stage in the PE pipeline (Sourcing → Screening → Diligence → IC Memo → Closed Won/Lost). Use this when the team has made a decision to advance or close a deal.',
  inputSchema: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'Deal ID' },
      stage: {
        type: 'string',
        enum: ['SOURCING', 'SCREENING', 'DILIGENCE', 'IC_MEMO', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'],
        description: 'Target stage',
      },
      reason: { type: 'string', description: 'Reason for the stage change (optional)' },
    },
    required: ['dealId', 'stage'],
  },
}

export async function moveDealStage(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const prisma = getPrisma()
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: input['dealId'] as string, userId: context.userId },
    })

    if (!deal) {
      return { success: false, data: null, error: `Deal not found: ${input['dealId']}`, durationMs: 0 }
    }

    const rawStage = input['stage'] as string
    const validStages: DealStage[] = ['SOURCING', 'SCREENING', 'DILIGENCE', 'IC_MEMO', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD']
    if (!validStages.includes(rawStage as DealStage)) {
      return { success: false, data: null, error: `Invalid stage: ${rawStage}`, durationMs: 0 }
    }

    const updated = await prisma.deal.update({
      where: { id: input['dealId'] as string },
      data: { stage: rawStage as DealStage },
    })

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        previousStage: deal.stage,
        newStage: updated.stage,
        message: `"${deal.name}" moved from ${deal.stage} → ${updated.stage}`,
      },
      durationMs: 0,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to move deal stage',
      durationMs: 0,
    }
  }
}
