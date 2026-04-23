// GitHubSubagent — SDK-powered multi-file GitHub workflow agent.
// Reads files, creates a branch, writes changes, opens a PR.
// Used by ProductAgent (Sean) when multi-file code changes are needed.

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { ToolContext } from '@axis/tools'
import { buildMcpBridge } from './mcp-tool-bridge.js'
import { productSlice } from './tool-slices.js'
import { extractTextContent } from './utils.js'

const GitHubTaskSchema = z.object({
  owner:    z.string().min(1),
  repo:     z.string().min(1),
  branch:   z.string().min(1),
  task:     z.string().min(1),
  prTitle:  z.string().min(1),
  prBody:   z.string().min(1),
})

export type GitHubTask = z.infer<typeof GitHubTaskSchema>

export interface GitHubSubagentResult {
  prUrl:   string | null
  content: string
}

const MCP_SERVER = 'github-tools'

// GitHub-specific tool names from the product slice
const GITHUB_TOOLS = [
  'github_read_file',
  'github_create_branch',
  'github_write_file',
  'github_create_pr',
]

export class GitHubSubagent {
  async run(task: GitHubTask, context: ToolContext): Promise<GitHubSubagentResult> {
    const parsed = GitHubTaskSchema.safeParse(task)
    if (!parsed.success) {
      throw new Error(`Invalid GitHubTask: ${JSON.stringify(parsed.error.flatten())}`)
    }

    // Only expose the 4 GitHub tools — not the full product slice
    const githubEntries = productSlice.filter((e) =>
      GITHUB_TOOLS.includes(e.definition.name)
    )
    const bridge = buildMcpBridge(githubEntries, context, MCP_SERVER)
    const mcpToolNames = githubEntries.map((e) => `mcp__${MCP_SERVER}__${e.definition.name}`)

    const prompt = `You are Sean, a senior product engineer. Complete this GitHub task end-to-end.

Repository: ${task.owner}/${task.repo}
Target branch: ${task.branch}
Task: ${task.task}

PR Title: ${task.prTitle}
PR Body:
${task.prBody}

Execution steps:
1. Use github_read_file to read the files you need to understand before changing them
2. Create the branch ${task.branch} using github_create_branch (base: main)
3. Apply the required changes using github_write_file (one call per file changed)
4. Open the PR using github_create_pr with the title and body above
5. In your final message, state the PR URL clearly`

    let content = ''
    let prUrl: string | null = null

    for await (const msg of query({
      prompt,
      options: {
        mcpServers: { [MCP_SERVER]: bridge } as Record<string, typeof bridge>,
        tools: [],
        allowedTools: mcpToolNames,
        model: 'claude-sonnet-4-6',
        maxTurns: 15,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      },
    })) {
      const m = msg as SDKMessage
      if (m.type !== 'assistant') continue
      const text = extractTextContent(m.message.content)
      if (!text) continue
      content += text
      const urlMatch = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)
      if (urlMatch) prUrl = urlMatch[0]!
    }

    return { prUrl, content }
  }
}
