// Tool system type definitions

/** Context available to every tool execution */
export interface ToolContext {
  sessionId: string
  userId: string
  clientId: string | null
  clientName?: string | null
  requestId: string
  githubToken?: string  // per-user PAT from DB, takes precedence over GITHUB_TOKEN env var
}

/** Standard result from any tool */
export interface ToolResult {
  success: boolean
  data: unknown
  error?: string
  durationMs: number
}

/** A tool definition for the model's tool_use interface */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Function signature every tool must implement */
export type ToolFunction = (
  input: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>
