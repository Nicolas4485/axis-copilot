// All agent tools — exported from @axis/tools

// Types
export type { ToolContext, ToolResult, ToolDefinition, ToolFunction } from './types.js'

// Tool implementations
export { webSearch, webSearchDefinition } from './web-search.js'
export { perplexitySearch, perplexitySearchDefinition, formatCitations } from './perplexity-search.js'
export type { PerplexitySearchInput, PerplexityCitation, PerplexitySearchData } from './perplexity-search.js'
export { saveClientContext, saveClientContextDefinition } from './save-client-context.js'
export { searchKnowledgeBase, searchKnowledgeBaseDefinition } from './search-knowledge-base.js'
export { getGraphContext, getGraphContextDefinition } from './get-graph-context.js'
export { updateClientRecord, updateClientRecordDefinition } from './update-client-record.js'
export { saveAnalysis, saveAnalysisDefinition } from './save-analysis.js'
export { getCompetitiveContext, getCompetitiveContextDefinition } from './get-competitive-context.js'
export { saveProcessAnalysis, saveProcessAnalysisDefinition } from './save-process-analysis.js'
export { createAutomationBlueprint, createAutomationBlueprintDefinition } from './create-automation-blueprint.js'
export { saveCompetitor, saveCompetitorDefinition } from './save-competitor.js'
export { getMarketContext, getMarketContextDefinition } from './get-market-context.js'
export { generateComparisonMatrix, generateComparisonMatrixDefinition } from './generate-comparison-matrix.js'
export { saveStakeholder, saveStakeholderDefinition } from './save-stakeholder.js'
export { getOrgChart, getOrgChartDefinition } from './get-org-chart.js'
export { draftEmail, draftEmailDefinition } from './draft-email.js'
export { updateStakeholderInfluence, updateStakeholderInfluenceDefinition } from './update-stakeholder-influence.js'
export { flagForReview, flagForReviewDefinition } from './flag-for-review.js'
export { storeCorrection, storeCorrectionDefinition } from './store-correction.js'
export { ingestDocument, ingestDocumentDefinition } from './ingest-document.js'
export { analyzeImage, analyzeImageDefinition } from './analyze-image.js'
export { scheduleAriaMeeting, scheduleAriaMeetingDefinition } from './schedule-aria-meeting.js'
export { githubReadFile, githubReadFileDefinition } from './github-tools.js'
export { githubCreateBranch, githubCreateBranchDefinition } from './github-tools.js'
export { githubWriteFile, githubWriteFileDefinition } from './github-tools.js'
export { githubCreatePR, githubCreatePRDefinition } from './github-tools.js'
export { githubListRepos, githubListReposDefinition } from './github-tools.js'
export { githubListFiles, githubListFilesDefinition } from './github-tools.js'
export { githubSearchCode, githubSearchCodeDefinition } from './github-tools.js'
export { askClarification, askClarificationDefinition } from './ask-clarification.js'

// Google Workspace integration
export * as google from './google/index.js'

// Gmail tools (text-mode ToolRegistry)
export { searchGmail, searchGmailDefinition, readEmail, readEmailDefinition } from './gmail-tools.js'

// Drive tools (text-mode ToolRegistry)
export { searchGoogleDrive, searchGoogleDriveDefinition, readDriveDocument, readDriveDocumentDefinition } from './drive-tools.js'

// Calendar + Task tools (text-mode ToolRegistry)
export { bookMeeting, bookMeetingDefinition, createTask, createTaskDefinition } from './calendar-task-tools.js'

// PE Deal pipeline tools (text-mode ToolRegistry)
export { listDeals, listDealsDefinition, createDeal, createDealDefinition, getDealStatus, getDealStatusDefinition, moveDealStage, moveDealStageDefinition } from './deal-tools.js'
// run_cim_analysis and generate_ic_memo are registered directly in packages/agents/src/tool-registry.ts
// because they depend on CimAnalyst and MemoWriter (which live in @axis/agents, avoiding circular deps)
