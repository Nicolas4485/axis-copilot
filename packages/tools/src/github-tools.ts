// GitHub tools — read files, create branches, write files, create PRs
// Used by agents (Sean, Kevin) for deep work: reviewing code and creating alternatives

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

const GITHUB_API = 'https://api.github.com'

function getHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN']
  const headers: Record<string, string> = {
    'User-Agent': 'AXIS-Copilot',
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ─── github_read_file ──────────────────────────────────────────

export const githubReadFileDefinition: ToolDefinition = {
  name: 'github_read_file',
  description: 'Read a file from a GitHub repository. Returns the file content. Use to review code, wireframes, configs, or any source file.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner (e.g. Nicolas4485)' },
      repo: { type: 'string', description: 'Repository name' },
      path: { type: 'string', description: 'File path (e.g. src/app/page.tsx)' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
    },
    required: ['owner', 'repo', 'path'],
  },
}

export async function githubReadFile(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string
  const repo = input['repo'] as string
  const path = input['path'] as string
  const branch = (input['branch'] as string) ?? 'main'

  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
    const response = await fetch(url, { headers: getHeaders() })

    if (!response.ok) {
      return { success: false, data: null, error: `GitHub read failed: ${response.status}`, durationMs: Date.now() - start }
    }

    const data = await response.json() as { content?: string; encoding?: string; size?: number; name?: string }

    if (!data.content) {
      return { success: false, data: null, error: 'File has no content (may be a directory)', durationMs: Date.now() - start }
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8')

    return {
      success: true,
      data: { path, content, size: data.size, branch },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { success: false, data: null, error: `GitHub read error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_create_branch ──────────────────────────────────────

export const githubCreateBranchDefinition: ToolDefinition = {
  name: 'github_create_branch',
  description: 'Create a new branch in a GitHub repository. Use before writing files to keep changes isolated.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      branch: { type: 'string', description: 'New branch name' },
      baseBranch: { type: 'string', description: 'Base branch (default: main)' },
    },
    required: ['owner', 'repo', 'branch'],
  },
}

export async function githubCreateBranch(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string
  const repo = input['repo'] as string
  const branch = input['branch'] as string
  const baseBranch = (input['baseBranch'] as string) ?? 'main'

  try {
    // Get the SHA of the base branch
    const refResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, {
      headers: getHeaders(),
    })

    if (!refResponse.ok) {
      return { success: false, data: null, error: `Base branch "${baseBranch}" not found`, durationMs: Date.now() - start }
    }

    const refData = await refResponse.json() as { object: { sha: string } }

    // Create the new branch
    const createResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: refData.object.sha,
      }),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      return { success: false, data: null, error: `Branch creation failed: ${errorText}`, durationMs: Date.now() - start }
    }

    return {
      success: true,
      data: { branch, baseBranch, sha: refData.object.sha },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { success: false, data: null, error: `Branch creation error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_write_file ─────────────────────────────────────────

export const githubWriteFileDefinition: ToolDefinition = {
  name: 'github_write_file',
  description: 'Create or update a file in a GitHub repository. Always create a branch first. Use to submit improved code, wireframes, or configs.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      path: { type: 'string', description: 'File path to create/update' },
      content: { type: 'string', description: 'File content' },
      branch: { type: 'string', description: 'Branch to write to' },
      message: { type: 'string', description: 'Commit message' },
    },
    required: ['owner', 'repo', 'path', 'content', 'branch', 'message'],
  },
}

export async function githubWriteFile(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string
  const repo = input['repo'] as string
  const path = input['path'] as string
  const content = input['content'] as string
  const branch = input['branch'] as string
  const message = input['message'] as string

  try {
    // Check if file exists (to get SHA for update)
    let sha: string | undefined
    const existingResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: getHeaders(),
    })
    if (existingResponse.ok) {
      const existing = await existingResponse.json() as { sha: string }
      sha = existing.sha
    }

    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    }
    if (sha) body['sha'] = sha

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, data: null, error: `File write failed: ${errorText}`, durationMs: Date.now() - start }
    }

    const data = await response.json() as { content: { html_url: string }; commit: { sha: string } }

    return {
      success: true,
      data: { path, branch, commitSha: data.commit.sha, url: data.content.html_url },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { success: false, data: null, error: `File write error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_create_pr ──────────────────────────────────────────

export const githubCreatePRDefinition: ToolDefinition = {
  name: 'github_create_pr',
  description: 'Create a pull request in a GitHub repository. Use after writing files to a branch to submit your changes for review.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string', description: 'PR title' },
      body: { type: 'string', description: 'PR description with context and rationale' },
      head: { type: 'string', description: 'Branch with changes' },
      base: { type: 'string', description: 'Target branch (default: main)' },
    },
    required: ['owner', 'repo', 'title', 'body', 'head'],
  },
}

export async function githubCreatePR(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string
  const repo = input['repo'] as string
  const title = input['title'] as string
  const body = input['body'] as string
  const head = input['head'] as string
  const base = (input['base'] as string) ?? 'main'

  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, head, base }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, data: null, error: `PR creation failed: ${errorText}`, durationMs: Date.now() - start }
    }

    const data = await response.json() as { number: number; html_url: string; id: number }

    return {
      success: true,
      data: { prNumber: data.number, url: data.html_url, title, head, base },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { success: false, data: null, error: `PR creation error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}
