// API client for AXIS backend

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

interface ApiOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed', code: 'UNKNOWN' })) as { error: string; code: string }
    throw new ApiError(response.status, error.code, error.error)
  }

  return await response.json() as T
}

// ─── Sessions ─────────────────────────────────────────────────

export interface Session {
  id: string
  title: string
  mode: string
  status: string
  createdAt: string
  updatedAt: string
  client?: Client
  messages?: Message[]
}

export interface Message {
  id: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  mode: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface SessionListItem {
  id: string
  title: string
  mode: string
  status: string
  client: { id: string; name: string } | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export const sessions = {
  list: () =>
    request<{ sessions: SessionListItem[] }>('/api/sessions'),

  create: (data: { clientId?: string; title?: string; mode?: string }) =>
    request<Session>('/api/sessions', { method: 'POST', body: data }),

  get: (id: string) =>
    request<Session>(`/api/sessions/${id}`),

  getCost: (id: string) =>
    request<SessionCost>(`/api/sessions/${id}/cost`),
}

// ─── Clients ──────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  industry: string | null
  companySize: number | null
  website: string | null
  notes: string | null
  techStack: unknown
  createdAt: string
  updatedAt: string
  stakeholders?: Stakeholder[]
  sessions?: Session[]
}

export interface Stakeholder {
  id: string
  name: string
  role: string | null
  email: string | null
  influence: string
  interest: string
  department: string | null
}

export const clients = {
  list: () => request<{ clients: Client[] }>('/api/clients').catch(() => ({ clients: [] as Client[] })),

  get: (id: string) =>
    request<Client>(`/api/clients/${id}`),

  create: (data: { name: string; industry: string; companySize: string }) =>
    request<Client>('/api/clients', { method: 'POST', body: data }),

  update: (id: string, data: Partial<Client>) =>
    request<Client>(`/api/clients/${id}`, { method: 'PATCH', body: data }),

  getStakeholders: (id: string) =>
    request<{ stakeholders: Stakeholder[]; count: number }>(`/api/clients/${id}/stakeholders`),

  getOrgChart: (id: string) =>
    request<{ tree: unknown[]; stakeholderCount: number }>(`/api/clients/${id}/orgchart`),
}

// ─── Deals ────────────────────────────────────────────────────

export type DealStage = 'SOURCING' | 'SCREENING' | 'DILIGENCE' | 'IC_MEMO' | 'CLOSED_WON' | 'CLOSED_LOST' | 'ON_HOLD'
export type Priority  = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Deal {
  id:             string
  userId:         string
  clientId:       string
  name:           string
  stage:          DealStage
  priority:       Priority
  targetClose:    string | null
  sector:         string | null
  dealSize:       string | null
  notes:          string | null
  assigneeId:     string | null
  createdAt:      string
  updatedAt:      string
  client:         { id: string; name: string }
  sessionCount?:  number
  documentCount?: number
  conflictCount?: number
}

export type SyncStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED' | 'CONFLICT'

export interface DealDocument {
  id:            string
  title:         string
  mimeType:      string | null
  docType:       string | null
  syncStatus:    SyncStatus
  chunkCount:    number
  entityCount:   number
  sourceType:    string
  createdAt:     string
  conflictCount: number
}

export const deals = {
  list: () =>
    request<{ deals: Deal[] }>('/api/deals'),

  get: (id: string) =>
    request<Deal>(`/api/deals/${id}`),

  create: (data: {
    name: string
    clientId: string
    stage?: DealStage
    priority?: Priority
    sector?: string
    dealSize?: string
    notes?: string
    targetClose?: string
  }) => request<Deal>('/api/deals', { method: 'POST', body: data }),

  update: (id: string, data: Partial<Omit<Deal, 'id' | 'userId' | 'client' | 'createdAt' | 'sessionCount' | 'documentCount' | 'conflictCount'>>) =>
    request<Deal>(`/api/deals/${id}`, { method: 'PATCH', body: data }),

  updateStage: (id: string, stage: DealStage) =>
    request<Deal>(`/api/deals/${id}/stage`, { method: 'PATCH', body: { stage } }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/api/deals/${id}`, { method: 'DELETE' }),

  listDocuments: (dealId: string) =>
    request<{ documents: DealDocument[] }>(`/api/deals/${dealId}/documents`),

  deleteDocument: (dealId: string, docId: string) =>
    request<{ success: boolean }>(`/api/deals/${dealId}/documents/${docId}`, { method: 'DELETE' }),

  renameDocument: (docId: string, title: string) =>
    request<{ document: { id: string; title: string } }>(`/api/knowledge/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
}

// ─── Health ───────────────────────────────────────────────────

export interface HealthStatus {
  status: string
  db: string
  redis: string
  neo4j: string
  anthropic: string
  localInference: string
  version: string
}

export interface SessionCost {
  sessionId: string
  totalCostUsd: number
  totalCalls: number
  cacheHitRate: number
}

export const health = {
  // Calls the authenticated detailed endpoint so the UI gets per-service status.
  // /api/health (public) only returns { status } to avoid leaking infra details.
  check: () => request<HealthStatus>('/api/health/detailed'),
}

// ─── Knowledge ────────────────────────────────────────────────

export interface EntityDetailsResponse {
  entityId: string
  entity: { id: string; name: string; label: string } | null
  relationships: Array<{
    type: string
    direction: 'outbound' | 'inbound'
    other: { id: string; name: string; label: string }
  }>
  documents: Array<{ id: string; title: string }>
  available?: boolean
}

export interface ConflictRecord {
  id: string
  userId: string
  clientId: string | null
  entityName: string
  entityType: string
  property: string
  valueA: string
  valueB: string
  sourceDocA: string
  sourceDocB: string
  status: 'UNRESOLVED' | 'RESOLVED_A' | 'RESOLVED_B' | 'CUSTOM'
  resolution: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
}

export const knowledge = {
  getConflicts: (clientId: string) =>
    request<{ conflicts: ConflictRecord[]; count: number }>(`/api/knowledge/conflicts/${clientId}`),

  resolveConflict: (conflictId: string, body: { resolution: ConflictRecord['status']; customValue?: string }) =>
    request<{ conflict: ConflictRecord }>(`/api/knowledge/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body,
    }),

  getGraph: (clientId: string) =>
    request<{ nodes: unknown[]; relationships: unknown[] }>(`/api/knowledge/graph/${clientId}`),

  getEntityDetails: (entityId: string) =>
    request<EntityDetailsResponse>(`/api/knowledge/entities/${entityId}/details`),
}

/** Supported single-file MIME types for direct upload (mirrors server SUPPORTED_MIME_TYPES) */
export const SINGLE_FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv'

export type SingleFileUploadResult = {
  documentId: string
  clientId: string | null
  docType: string
  chunkCount: number
  entityCount: number
  status: string
}

/**
 * Upload a single document (PDF, DOCX, PPTX, etc.) directly.
 * Returns the ingest result or throws on error.
 */
export async function uploadSingleFile(
  file: File,
  options: { clientId?: string; dealId?: string },
): Promise<SingleFileUploadResult> {
  const form = new FormData()
  form.append('file', file)
  if (options.clientId) form.append('clientId', options.clientId)
  if (options.dealId)   form.append('dealId',   options.dealId)

  const res = await fetch(`${API_BASE}/api/knowledge/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Upload failed (${res.status})`)
  }

  return res.json() as Promise<SingleFileUploadResult>
}

export type ZipSSEEvent =
  | { type: 'extracted'; count: number; message: string }
  | { type: 'file_start';  filename: string; index: number; total: number }
  | { type: 'file_done';   filename: string; index: number; total: number; documentId: string; chunks: number }
  | { type: 'file_error';  filename: string; index: number; total: number; error: string }
  | { type: 'done';        succeeded: number; failed: number; total: number; documentIds: string[] }
  | { type: 'error';       message: string }

export function streamZipUpload(
  file: File,
  options: { clientId?: string; dealId?: string },
  onEvent: (event: ZipSSEEvent) => void
): AbortController {
  const ctrl = new AbortController()
  const form = new FormData()
  form.append('file', file)
  if (options.clientId) form.append('clientId', options.clientId)
  if (options.dealId)   form.append('dealId',   options.dealId)

  void (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/upload-zip`, {
        method: 'POST',
        credentials: 'include',
        body: form,
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        onEvent({ type: 'error', message: `Upload failed (${res.status})` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          try {
            onEvent(JSON.parse(line.slice(5).trim()) as ZipSSEEvent)
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message })
      }
    }
  })()

  return ctrl
}

// ─── Analytics ────────────────────────────────────────────────

export interface AgentMetric {
  agent: string
  queryCount: number
  avgResponseMs: number
  successRate: number
}

export interface CostAnalytics {
  totalUsd: number
  byModel: Array<{ model: string; costUsd: number; callCount: number }>
  byDay: Array<{ date: string; costUsd: number }>
  bySession: Array<{ sessionId: string; title: string; costUsd: number }>
}

export interface KnowledgeGrowthEntry {
  date: string
  nodeCount: number
  edgeCount: number
}

export const analytics = {
  getCosts: (days?: number) =>
    request<CostAnalytics>(`/api/cost/analytics${days !== undefined ? `?days=${days}` : ''}`),

  getKnowledgeGrowth: (clientId: string) =>
    request<{ growth: KnowledgeGrowthEntry[] }>(`/api/analytics/knowledge/${clientId}`),

  getAgentMetrics: () =>
    request<{ metrics: AgentMetric[] }>('/api/analytics/agents'),
}

// ─── User profile ─────────────────────────────────────────────

export type GeminiVoice = 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Leda' | 'Orus' | 'Zephyr'

export interface UserProfile {
  id: string
  email: string
  name: string | null
  voiceName: GeminiVoice
  role: string
  createdAt: string
}

export const userProfile = {
  get: () =>
    request<{ user: UserProfile; availableVoices: GeminiVoice[] }>('/api/user/me'),
  update: (data: { name?: string; voiceName?: GeminiVoice }) =>
    request<{ user: UserProfile }>('/api/user/me', { method: 'PATCH', body: data }),

  /**
   * Fetch a TTS sample for the given voice without saving any preference.
   * Returns raw PCM data + metadata so the frontend can play via Web Audio API.
   */
  voicePreview: async (voice: GeminiVoice): Promise<{ audioBase64: string; mimeType: string; sampleRate: number }> => {
    const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    const res      = await fetch(`${API_BASE}/api/user/voice-preview`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ voice }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; detail?: string }
      throw new Error(body.error ?? `Voice preview failed (${res.status})`)
    }
    return res.json() as Promise<{ audioBase64: string; mimeType: string; sampleRate: number }>
  },
}

// ─── Documents ────────────────────────────────────────────────

export interface DocumentSummary {
  id: string
  title: string
  mimeType: string
  clientId: string | null
  createdAt: string
}

export interface DocumentEntity {
  id: string
  text: string
  entityType: string
  start: number
  end: number
  nodeId: string | null
}

export interface DocumentDetail {
  id: string
  title: string
  content: string
  mimeType: string
  entities: DocumentEntity[]
  createdAt: string
}

export const documents = {
  list: (clientId?: string) =>
    request<{ documents: DocumentSummary[] }>(
      `/api/documents${clientId !== undefined ? `?clientId=${clientId}` : ''}`
    ),

  get: (id: string) =>
    request<DocumentDetail>(`/api/documents/${id}`),
}

// ─── Exports ──────────────────────────────────────────────────

export interface ExportResult {
  id: string
  format: string
  url: string
  createdAt: string
}

export const documentExports = {
  create: (data: { sessionId: string; format: 'pdf' | 'markdown' | 'json'; sections?: string[] }) =>
    request<ExportResult>('/api/exports', { method: 'POST', body: data }),

  get: (id: string) =>
    request<ExportResult>(`/api/exports/${id}`),
}

// ─── App Settings ─────────────────────────────────────────────

export interface ModelSettings {
  defaultModel: string
  temperature: number
  maxTokens: number
  routingMode: 'auto' | 'local' | 'cloud'
  useCache: boolean
}

export interface AppSettings {
  model: ModelSettings
  teamName: string | null
  webhookUrl: string | null
}

export const appSettings = {
  get: () => request<AppSettings>('/api/settings'),
  update: (data: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', { method: 'PATCH', body: data }),
}

// ─── API Keys ─────────────────────────────────────────────────

export interface ApiKeyEntry {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export const apiKeys = {
  list: () => request<{ keys: ApiKeyEntry[] }>('/api/api-keys'),

  create: (data: { name: string }) =>
    request<{ key: ApiKeyEntry; secret: string }>('/api/api-keys', { method: 'POST', body: data }),

  revoke: (id: string) =>
    request<{ success: boolean }>(`/api/api-keys/${id}`, { method: 'DELETE' }),
}

// ─── SSE Stream ───────────────────────────────────────────────

export interface SSEEvent {
  type: 'tool_start' | 'tool_result' | 'token' | 'conflict_warning' | 'sources' | 'delegation' | 'done'
      | 'rag_search' | 'rag_done' | 'model_call'
  [key: string]: unknown
}

export function streamMessage(
  sessionId: string,
  content: string,
  options?: { mode?: string; imageBase64?: string },
  onEvent?: (event: SSEEvent) => void
): AbortController {
  const controller = new AbortController()

  console.log('[SSE] Sending to', `${API_BASE}/api/sessions/${sessionId}/messages`)

  fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, ...options }),
    signal: controller.signal,
  })
    .then(async (response) => {
      console.log('[SSE] Response status:', response.status, 'body:', !!response.body)
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '')
        console.error('[SSE] Error response:', text)
        onEvent?.({ type: 'done', error: `HTTP ${response.status}: ${text}` })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent
              onEvent?.(event)
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent?.({ type: 'done', error: err.message })
      }
    })

  return controller
}

// ─── Aria (Conversational Orchestrator) ─────────────────────────

// SEC-1 resolved: apiKey is no longer returned by the server.
// Live sessions connect through the backend WebSocket proxy at /api/aria/live.
export interface AriaSessionToken {
  systemInstruction: string
  tools: Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
  model: string
  sessionId: string
}

export interface AriaToolResult {
  result: {
    success: boolean
    data: unknown
    error?: string
    durationMs: number
  }
}

export interface AriaDelegationResult {
  workerType: string
  content: string
  toolsUsed: string[]
  citations: unknown[]
  conflictsFound: unknown[]
}

export const aria = {
  /** Get a session token for Gemini Live mode */
  getSessionToken: (sessionId: string) =>
    request<AriaSessionToken>('/api/aria/session-token', { method: 'POST', body: { sessionId } }),

  /** Execute a tool during a live session */
  toolCall: (data: { sessionId: string; toolName: string; toolInput: Record<string, unknown> }) =>
    request<AriaToolResult>('/api/aria/tool-call', { method: 'POST', body: data }),

  /** Delegate to a worker agent during a live session */
  delegate: (data: { sessionId: string; workerType: string; query: string; imageBase64?: string }) =>
    request<AriaDelegationResult>('/api/aria/delegate', { method: 'POST', body: data }),

  /** Refresh memory context for a long live session */
  refreshMemory: (sessionId: string) =>
    request<{ systemInstruction: string }>('/api/aria/memory-refresh', { method: 'POST', body: { sessionId } }),
}

// ─── CIM Analysis ─────────────────────────────────────────────

export interface CimSSEEvent {
  type: 'step' | 'done' | 'error'
  step?: string
  progress?: number
  message?: string
  result?: CIMAnalysisResult
  error?: string
}

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

export interface FinancialYear {
  year: string
  revenue: number | null
  revenueGrowth: number | null
  grossProfit: number | null
  grossMargin: number | null
  ebitda: number | null
  ebitdaMargin: number | null
}

export interface FinancialExtraction {
  years: FinancialYear[]
  currency: string
  unit: 'millions' | 'thousands' | 'units'
  confidence: 'high' | 'medium' | 'low'
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
  extractedFinancials?: FinancialExtraction | null
}

export const cimAnalysis = {
  getLatest: (dealId: string) =>
    request<{ result: CIMAnalysisResult; createdAt: string }>(`/api/deals/${dealId}/cim-analysis/latest`),
}

/**
 * Stream a CIM analysis for a deal.
 * Pass either a File (new upload) or a documentId string (already ingested).
 */
export function streamCimAnalysis(
  dealId: string,
  fileOrDocumentId: File | string,
  onEvent: (event: CimSSEEvent) => void
): AbortController {
  const controller = new AbortController()

  const prepareRequest = (): { url: string; init: RequestInit } => {
    if (fileOrDocumentId instanceof File) {
      const form = new FormData()
      form.append('file', fileOrDocumentId)
      return {
        url: `${API_BASE}/api/deals/${dealId}/cim-analysis`,
        init: {
          method: 'POST',
          credentials: 'include' as RequestCredentials,
          body: form,
          signal: controller.signal,
        },
      }
    }
    return {
      url: `${API_BASE}/api/deals/${dealId}/cim-analysis`,
      init: {
        method: 'POST',
        credentials: 'include' as RequestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: fileOrDocumentId }),
        signal: controller.signal,
      },
    }
  }

  const { url, init } = prepareRequest()

  fetch(url, init)
    .then(async (response) => {
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '')
        onEvent({ type: 'error', error: `HTTP ${response.status}: ${text}` })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as CimSSEEvent
              onEvent(event)
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({ type: 'error', error: err.message })
      }
    })

  return controller
}

// ─── IC Memo ──────────────────────────────────────────────────

export interface MemoSection {
  id: string
  title: string
  content: string
  generatedAt: string
}

export interface MemoResult {
  dealId: string
  companyName: string
  version: number
  sections: MemoSection[]
  generatedAt: string
  durationMs: number
}

export type MemoSSEEvent =
  | { type: 'section_start'; sectionId: string; sectionTitle: string; progress: number; message: string }
  | { type: 'section_done'; sectionId: string; sectionTitle: string; progress: number; message: string }
  | { type: 'done'; result: MemoResult }
  | { type: 'error'; message: string }

export const memo = {
  getLatest: (dealId: string) =>
    request<{ memo: MemoResult }>(`/api/deals/${dealId}/memo/latest`),
}

export function streamMemo(
  dealId: string,
  onEvent: (event: MemoSSEEvent) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/api/deals/${dealId}/generate-memo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as MemoSSEEvent
              onEvent(event)
            } catch {
              // skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({ type: 'error', message: err.message })
      }
    })

  return controller
}

export function streamMemoSection(
  dealId: string,
  sectionId: string,
  onEvent: (event: MemoSSEEvent) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/api/deals/${dealId}/memo/section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionId }),
    credentials: 'include',
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as MemoSSEEvent
              onEvent(event)
            } catch {
              // skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({ type: 'error', message: err.message })
      }
    })

  return controller
}
