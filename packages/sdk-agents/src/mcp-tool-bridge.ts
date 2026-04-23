// MCP Tool Bridge — wraps AXIS ToolFunction entries as in-process MCP servers
// for the Claude Agent SDK. Each AXIS tool's JSON inputSchema is converted to
// a recursive Zod shape so the SDK validates payloads before they reach execute().

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolFunction } from '@axis/tools'

export interface AxisToolEntry {
  definition: ToolDefinition
  execute: ToolFunction
}

interface JsonSchemaProp {
  type?: string
  description?: string
  enum?: unknown[]
  items?: JsonSchemaProp
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

interface JsonSchemaObject {
  type?: string
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

// Recursively converts a JSON schema property to a Zod type.
function propToZod(prop: JsonSchemaProp): z.ZodTypeAny {
  switch (prop.type) {
    case 'string': {
      // Only build an enum validator when we have at least 2 valid string members.
      // An empty or single-member enum is a schema error — fall back to z.string().
      const members = (prop.enum ?? []).filter((v): v is string => typeof v === 'string')
      return members.length >= 2
        ? z.enum(members as [string, ...string[]])
        : z.string()
    }
    case 'number':
      return z.number()
    case 'integer':
      return z.number().int()
    case 'boolean':
      return z.boolean()
    case 'array':
      return prop.items != null
        ? z.array(propToZod(prop.items))
        : z.array(z.unknown())
    case 'object':
      if (prop.properties != null) {
        const shape = buildShape(prop.properties, new Set(prop.required ?? []))
        return z.object(shape)
      }
      return z.record(z.unknown())
    default:
      return z.unknown()
  }
}

function buildShape(
  properties: Record<string, JsonSchemaProp>,
  required: Set<string>
): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, prop]) => {
      const base = propToZod(prop)
      return [key, required.has(key) ? base : base.optional()]
    })
  )
}

// Converts a top-level JSON schema to a Zod raw shape.
// Rejects schemas whose type is anything other than 'object'.
function jsonSchemaToShape(schema: JsonSchemaObject): Record<string, z.ZodTypeAny> {
  if (schema.type != null && schema.type !== 'object') {
    throw new Error(
      `[MCP Bridge] Tool inputSchema must be an object schema, got type: "${schema.type}"`
    )
  }
  const props = schema.properties
  if (props == null) return {}
  return buildShape(props, new Set(schema.required ?? []))
}

// Safe JSON serialisation: handles BigInt, circular refs, and undefined.
function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  try {
    return (
      JSON.stringify(value, (_key, v) =>
        typeof v === 'bigint' ? v.toString() : v
      ) ?? 'null'
    )
  } catch {
    return String(value)
  }
}

// Returns a safe error string suitable for passing to the model.
// - Messages over 150 chars are likely raw API response bodies — replace with generic text.
// - Messages containing auth-related keywords are redacted entirely.
// This keeps agent-useful errors (e.g. "Query is required") while preventing provider
// response bodies, stack traces, or credential strings from reaching the model.
function sanitiseError(raw: string | undefined): string {
  if (raw == null || raw.trim() === '') return 'Tool execution failed'
  const trimmed = raw.trim()
  if (/api[_\-]?key|bearer\s|authorization:|token|secret|password/i.test(trimmed)) {
    return 'Tool execution failed (redacted)'
  }
  if (trimmed.length > 150) return 'Tool execution failed (details logged server-side)'
  return trimmed
}

function wrapAxisTool(entry: AxisToolEntry, context: ToolContext) {
  const { definition, execute } = entry
  const schema = definition.inputSchema as JsonSchemaObject
  const shape = jsonSchemaToShape(schema) as Record<string, z.ZodTypeAny>

  return tool(
    definition.name,
    definition.description,
    shape,
    async (args) => {
      try {
        const result = await execute(args as Record<string, unknown>, context)
        const text = result.success
          ? safeStringify(result.data)
          : `Error: ${sanitiseError(result.error)}`
        return { content: [{ type: 'text' as const, text }] }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${sanitiseError(msg)}` }] }
      }
    }
  )
}

/**
 * Builds an in-process MCP server exposing a named set of AXIS tools.
 * Pass the returned config to `query({ options: { mcpServers: { [serverName]: bridge } } })`.
 */
export function buildMcpBridge(
  tools: ReadonlyArray<AxisToolEntry>,
  context: ToolContext,
  serverName = 'axis-tools'
) {
  const mcpTools = tools.map((entry) => wrapAxisTool(entry, context))
  return createSdkMcpServer({ name: serverName, version: '1.0.0', tools: mcpTools })
}
