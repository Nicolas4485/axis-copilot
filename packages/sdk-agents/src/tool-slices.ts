// Named subsets of AXIS tools for each specialist agent.
// Each slice is passed to buildMcpBridge() to create a scoped MCP server.

import {
  webSearch, webSearchDefinition,
  perplexitySearch, perplexitySearchDefinition,
  searchKnowledgeBase, searchKnowledgeBaseDefinition,
  getGraphContext, getGraphContextDefinition,
  saveAnalysis, saveAnalysisDefinition,
  saveClientContext, saveClientContextDefinition,
  updateClientRecord, updateClientRecordDefinition,
  getCompetitiveContext, getCompetitiveContextDefinition,
  saveCompetitor, saveCompetitorDefinition,
  getMarketContext, getMarketContextDefinition,
  generateComparisonMatrix, generateComparisonMatrixDefinition,
  saveProcessAnalysis, saveProcessAnalysisDefinition,
  createAutomationBlueprint, createAutomationBlueprintDefinition,
  saveStakeholder, saveStakeholderDefinition,
  getOrgChart, getOrgChartDefinition,
  updateStakeholderInfluence, updateStakeholderInfluenceDefinition,
  draftEmail, draftEmailDefinition,
  flagForReview, flagForReviewDefinition,
  analyzeImage, analyzeImageDefinition,
  ingestDocument, ingestDocumentDefinition,
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
  githubReadFile, githubReadFileDefinition,
  githubCreateBranch, githubCreateBranchDefinition,
  githubWriteFile, githubWriteFileDefinition,
  githubCreatePR, githubCreatePRDefinition,
} from '@axis/tools'

import type { AxisToolEntry } from './mcp-tool-bridge.js'

// Mel — competitive intelligence analyst
export const competitiveSlice: AxisToolEntry[] = [
  { definition: perplexitySearchDefinition, execute: perplexitySearch },
  { definition: webSearchDefinition,        execute: webSearch },
  { definition: getCompetitiveContextDefinition, execute: getCompetitiveContext },
  { definition: saveCompetitorDefinition,   execute: saveCompetitor },
  { definition: getMarketContextDefinition, execute: getMarketContext },
  { definition: generateComparisonMatrixDefinition, execute: generateComparisonMatrix },
  { definition: searchKnowledgeBaseDefinition, execute: searchKnowledgeBase },
  { definition: flagForReviewDefinition,    execute: flagForReview },
]

// Sean — product strategist (+ GitHub for multi-file work)
export const productSlice: AxisToolEntry[] = [
  { definition: searchKnowledgeBaseDefinition, execute: searchKnowledgeBase },
  { definition: getGraphContextDefinition, execute: getGraphContext },
  { definition: saveAnalysisDefinition,    execute: saveAnalysis },
  { definition: updateClientRecordDefinition, execute: updateClientRecord },
  { definition: analyzeImageDefinition,    execute: analyzeImage },
  { definition: webSearchDefinition,       execute: webSearch },
  { definition: flagForReviewDefinition,   execute: flagForReview },
  { definition: githubReadFileDefinition,  execute: githubReadFile },
  { definition: githubCreateBranchDefinition, execute: githubCreateBranch },
  { definition: githubWriteFileDefinition, execute: githubWriteFile },
  { definition: githubCreatePRDefinition,  execute: githubCreatePR },
]

// Kevin — process optimisation specialist
export const processSlice: AxisToolEntry[] = [
  { definition: saveProcessAnalysisDefinition, execute: saveProcessAnalysis },
  { definition: createAutomationBlueprintDefinition, execute: createAutomationBlueprint },
  { definition: searchKnowledgeBaseDefinition, execute: searchKnowledgeBase },
  { definition: getGraphContextDefinition, execute: getGraphContext },
  { definition: webSearchDefinition,       execute: webSearch },
  { definition: analyzeImageDefinition,    execute: analyzeImage },
  { definition: flagForReviewDefinition,   execute: flagForReview },
]

// Anjie — stakeholder intelligence specialist
export const stakeholderSlice: AxisToolEntry[] = [
  { definition: saveStakeholderDefinition,         execute: saveStakeholder },
  { definition: getOrgChartDefinition,             execute: getOrgChart },
  { definition: updateStakeholderInfluenceDefinition, execute: updateStakeholderInfluence },
  { definition: draftEmailDefinition,              execute: draftEmail },
  { definition: searchKnowledgeBaseDefinition,     execute: searchKnowledgeBase },
  { definition: webSearchDefinition,               execute: webSearch },
  { definition: flagForReviewDefinition,           execute: flagForReview },
]

// Aria (orchestrator) — all tools
export const allToolsSlice: AxisToolEntry[] = [
  { definition: webSearchDefinition,               execute: webSearch },
  { definition: perplexitySearchDefinition,        execute: perplexitySearch },
  { definition: saveClientContextDefinition,       execute: saveClientContext },
  { definition: searchKnowledgeBaseDefinition,     execute: searchKnowledgeBase },
  { definition: getGraphContextDefinition,         execute: getGraphContext },
  { definition: updateClientRecordDefinition,      execute: updateClientRecord },
  { definition: saveAnalysisDefinition,            execute: saveAnalysis },
  { definition: getCompetitiveContextDefinition,   execute: getCompetitiveContext },
  { definition: saveProcessAnalysisDefinition,     execute: saveProcessAnalysis },
  { definition: createAutomationBlueprintDefinition, execute: createAutomationBlueprint },
  { definition: saveCompetitorDefinition,          execute: saveCompetitor },
  { definition: getMarketContextDefinition,        execute: getMarketContext },
  { definition: generateComparisonMatrixDefinition, execute: generateComparisonMatrix },
  { definition: saveStakeholderDefinition,         execute: saveStakeholder },
  { definition: getOrgChartDefinition,             execute: getOrgChart },
  { definition: draftEmailDefinition,              execute: draftEmail },
  { definition: updateStakeholderInfluenceDefinition, execute: updateStakeholderInfluence },
  { definition: flagForReviewDefinition,           execute: flagForReview },
  { definition: ingestDocumentDefinition,          execute: ingestDocument },
  { definition: analyzeImageDefinition,            execute: analyzeImage },
  { definition: searchGmailDefinition,             execute: searchGmail },
  { definition: readEmailDefinition,               execute: readEmail },
  { definition: searchGoogleDriveDefinition,       execute: searchGoogleDrive },
  { definition: readDriveDocumentDefinition,       execute: readDriveDocument },
  { definition: bookMeetingDefinition,             execute: bookMeeting },
  { definition: createTaskDefinition,              execute: createTask },
  { definition: listDealsDefinition,               execute: listDeals },
  { definition: createDealDefinition,              execute: createDeal },
  { definition: getDealStatusDefinition,           execute: getDealStatus },
  { definition: moveDealStageDefinition,           execute: moveDealStage },
  { definition: githubReadFileDefinition,          execute: githubReadFile },
  { definition: githubCreateBranchDefinition,      execute: githubCreateBranch },
  { definition: githubWriteFileDefinition,         execute: githubWriteFile },
  { definition: githubCreatePRDefinition,          execute: githubCreatePR },
]
