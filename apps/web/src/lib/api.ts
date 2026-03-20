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
  const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export const sessions = {
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
  check: () => request<HealthStatus>('/api/health'),
}

// ─── Knowledge ────────────────────────────────────────────────

export const knowledge = {
  getConflicts: (clientId: string) =>
    request<{ conflicts: unknown[]; count: number }>(`/api/knowledge/conflicts/${clientId}`),

  getGraph: (clientId: string) =>
    request<{ nodes: unknown[]; relationships: unknown[] }>(`/api/knowledge/graph/${clientId}`),
}

// ─── SSE Stream ───────────────────────────────────────────────

export interface SSEEvent {
  type: 'tool_start' | 'tool_result' | 'token' | 'conflict_warning' | 'sources' | 'done'
  [key: string]: unknown
}

export function streamMessage(
  sessionId: string,
  content: string,
  options?: { mode?: string; imageBase64?: string },
  onEvent?: (event: SSEEvent) => void
): AbortController {
  const controller = new AbortController()
  const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null

  console.log('[SSE] Sending to', `${API_BASE}/api/sessions/${sessionId}/messages`)
  console.log('[SSE] Token present:', !!token)

  fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
