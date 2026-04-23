// ToolRegistry — maps tool names to implementations and definitions
// All tools imported from @axis/tools

import type { ToolFunction, ToolDefinition, ToolContext, ToolResult } from '@axis/tools'
import {
  webSearch, webSearchDefinition,
  perplexitySearch, perplexitySearchDefinition,
  saveClientContext, saveClientContextDefinition,
  searchKnowledgeBase, searchKnowledgeBaseDefinition,
  getGraphContext, getGraphContextDefinition,
  updateClientRecord, updateClientRecordDefinition,
  saveAnalysis, saveAnalysisDefinition,
  getCompetitiveContext, getCompetitiveContextDefinition,
  saveProcessAnalysis, saveProcessAnalysisDefinition,
  createAutomationBlueprint, createAutomationBlueprintDefinition,
  saveCompetitor, saveCompetitorDefinition,
  getMarketContext, getMarketContextDefinition,
  generateComparisonMatrix, generateComparisonMatrixDefinition,
  saveStakeholder, saveStakeholderDefinition,
  getOrgChart, getOrgChartDefinition,
  draftEmail, draftEmailDefinition,
  updateStakeholderInfluence, updateStakeholderInfluenceDefinition,
  flagForReview, flagForReviewDefinition,
  storeCorrection, storeCorrectionDefinition,
  ingestDocument, ingestDocumentDefinition,
  analyzeImage, analyzeImageDefinition,
  scheduleAriaMeeting, scheduleAriaMeetingDefinition,
  githubReadFile, githubReadFileDefinition,
  githubCreateBranch, githubCreateBranchDefinition,
  githubWriteFile, githubWriteFileDefinition,
  githubCreatePR, githubCreatePRDefinition,
  githubListRepos, githubListReposDefinition,
  githubListFiles, githubListFilesDefinition,
  githubSearchCode, githubSearchCodeDefinition,
  searchGmail, searchGmailDefinition,
  readEmail, readEmailDefinition,
  searchGoogleDrive, searchGoogleDriveDefinition,
  readDriveDocument, readDriveDocumentDefinition,
  bookMeeting, bookMeetingDefinition,
  createTask, createTaskDefinition,
  listDeals, listDealsDefinition,
  createDeal, createDealDefinition,
  getDealStatus, getDealStatusDefinition,
  moveDealStage, moveDealStageDefinition,
} from '@axis/tools'
// PE tools that need CimAnalyst/MemoWriter live here to avoid circular deps
import {
  runCimAnalysis, runCimAnalysisDefinition,
  generateIcMemo, generateIcMemoDefinition,
} from './pe-tools.js'

interface ToolEntry {
  definition: ToolDefinition
  execute: ToolFunction
}

/** Central registry of all available tools */
const TOOL_MAP: Record<string, ToolEntry> = {
  web_search: { definition: webSearchDefinition, execute: webSearch },
  perplexity_search: { definition: perplexitySearchDefinition, execute: perplexitySearch },
  save_client_context: { definition: saveClientContextDefinition, execute: saveClientContext },
  search_knowledge_base: { definition: searchKnowledgeBaseDefinition, execute: searchKnowledgeBase },
  get_graph_context: { definition: getGraphContextDefinition, execute: getGraphContext },
  update_client_record: { definition: updateClientRecordDefinition, execute: updateClientRecord },
  save_analysis: { definition: saveAnalysisDefinition, execute: saveAnalysis },
  get_competitive_context: { definition: getCompetitiveContextDefinition, execute: getCompetitiveContext },
  save_process_analysis: { definition: saveProcessAnalysisDefinition, execute: saveProcessAnalysis },
  create_automation_blueprint: { definition: createAutomationBlueprintDefinition, execute: createAutomationBlueprint },
  save_competitor: { definition: saveCompetitorDefinition, execute: saveCompetitor },
  get_market_context: { definition: getMarketContextDefinition, execute: getMarketContext },
  generate_comparison_matrix: { definition: generateComparisonMatrixDefinition, execute: generateComparisonMatrix },
  save_stakeholder: { definition: saveStakeholderDefinition, execute: saveStakeholder },
  get_org_chart: { definition: getOrgChartDefinition, execute: getOrgChart },
  draft_email: { definition: draftEmailDefinition, execute: draftEmail },
  update_stakeholder_influence: { definition: updateStakeholderInfluenceDefinition, execute: updateStakeholderInfluence },
  flag_for_review: { definition: flagForReviewDefinition, execute: flagForReview },
  store_correction: { definition: storeCorrectionDefinition, execute: storeCorrection },
  ingest_document: { definition: ingestDocumentDefinition, execute: ingestDocument },
  analyze_image: { definition: analyzeImageDefinition, execute: analyzeImage },
  schedule_aria_meeting: { definition: scheduleAriaMeetingDefinition, execute: scheduleAriaMeeting },
  github_read_file: { definition: githubReadFileDefinition, execute: githubReadFile },
  github_create_branch: { definition: githubCreateBranchDefinition, execute: githubCreateBranch },
  github_write_file: { definition: githubWriteFileDefinition, execute: githubWriteFile },
  github_create_pr: { definition: githubCreatePRDefinition, execute: githubCreatePR },
  github_list_repos: { definition: githubListReposDefinition, execute: githubListRepos },
  github_list_files: { definition: githubListFilesDefinition, execute: githubListFiles },
  github_search_code: { definition: githubSearchCodeDefinition, execute: githubSearchCode },
  // Google tools — available in text-mode agentic loop
  search_gmail: { definition: searchGmailDefinition, execute: searchGmail },
  read_email: { definition: readEmailDefinition, execute: readEmail },
  search_google_drive: { definition: searchGoogleDriveDefinition, execute: searchGoogleDrive },
  read_drive_document: { definition: readDriveDocumentDefinition, execute: readDriveDocument },
  book_meeting: { definition: bookMeetingDefinition, execute: bookMeeting },
  create_task: { definition: createTaskDefinition, execute: createTask },
  // PE Deal pipeline tools
  list_deals: { definition: listDealsDefinition, execute: listDeals },
  create_deal: { definition: createDealDefinition, execute: createDeal },
  get_deal_status: { definition: getDealStatusDefinition, execute: getDealStatus },
  move_deal_stage: { definition: moveDealStageDefinition, execute: moveDealStage },
  run_cim_analysis: { definition: runCimAnalysisDefinition, execute: runCimAnalysis },
  generate_ic_memo: { definition: generateIcMemoDefinition, execute: generateIcMemo },
}

export class ToolRegistry {
  /** Get tool definitions for a list of tool names (for passing to model) */
  getDefinitions(toolNames: string[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = []
    for (const name of toolNames) {
      const entry = TOOL_MAP[name]
      if (entry) {
        definitions.push(entry.definition)
      } else {
        console.warn(`[ToolRegistry] Unknown tool: ${name}`)
      }
    }
    return definitions
  }

  /** Execute a tool by name, logging duration and success/failure */
  async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const entry = TOOL_MAP[name]
    if (!entry) {
      return {
        success: false,
        data: null,
        error: `Unknown tool: ${name}`,
        durationMs: 0,
      }
    }

    const start = Date.now()
    const inputSummary = JSON.stringify(input).slice(0, 200)
    console.log(`[ToolRegistry] Executing ${name} | input: ${inputSummary}`)

    try {
      const result = await entry.execute(input, context)
      const durationMs = Date.now() - start
      console.log(
        `[ToolRegistry] ${name} ${result.success ? 'succeeded' : 'failed'} in ${durationMs}ms`
      )
      return { ...result, durationMs }
    } catch (err) {
      const durationMs = Date.now() - start
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[ToolRegistry] ${name} threw error in ${durationMs}ms: ${errorMessage}`)
      return {
        success: false,
        data: null,
        error: errorMessage,
        durationMs,
      }
    }
  }

  /** Check if a tool exists */
  hasTool(name: string): boolean {
    return name in TOOL_MAP
  }

  /** List all registered tool names */
  listTools(): string[] {
    return Object.keys(TOOL_MAP)
  }
}
