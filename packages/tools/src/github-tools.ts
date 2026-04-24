// GitHub tools — discovery (list repos, list files, search code) + deep work (read, write, PR)
// Discovery tools: Sean, Mel, Aria — find what's built before speccing or comparing features
// Deep-work tools: Sean — review code, create alternatives, submit PRs

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

const GITHUB_API = 'https://api.github.com'

function getHeaders(token?: string): Record<string, string> {
  const tok = token ?? process.env['GITHUB_TOKEN']
  const headers: Record<string, string> = {
    'User-Agent': 'AXIS-Copilot',
    Accept: 'application/vnd.github.v3+json',
  }
  if (tok) headers['Authorization'] = `Bearer ${tok}`
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
    const response = await fetch(url, { headers: getHeaders(_context.githubToken) })

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
      headers: getHeaders(_context.githubToken),
    })

    if (!refResponse.ok) {
      return { success: false, data: null, error: `Base branch "${baseBranch}" not found`, durationMs: Date.now() - start }
    }

    const refData = await refResponse.json() as { object: { sha: string } }

    // Create the new branch
    const createResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { ...getHeaders(_context.githubToken), 'Content-Type': 'application/json' },
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
      headers: getHeaders(_context.githubToken),
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
      headers: { ...getHeaders(_context.githubToken), 'Content-Type': 'application/json' },
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

// ─── github_list_repos ─────────────────────────────────────────

export const githubListReposDefinition: ToolDefinition = {
  name: 'github_list_repos',
  description: 'List GitHub repositories for a user or organisation. Use to discover what repos exist before diving into files.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'GitHub username or org (optional — defaults to authenticated user)' },
      per_page: { type: 'number', description: 'Max repos to return (default 30, max 100)' },
    },
  },
}

export async function githubListRepos(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string | undefined
  const perPage = Math.min(Number(input['per_page'] ?? 30), 100)

  try {
    const url = owner
      ? `${GITHUB_API}/users/${owner}/repos?per_page=${perPage}&sort=updated`
      : `${GITHUB_API}/user/repos?per_page=${perPage}&sort=updated`

    const response = await fetch(url, { headers: getHeaders(_context.githubToken) })
    if (!response.ok) {
      return { success: false, data: null, error: `GitHub list repos failed: ${response.status}`, durationMs: Date.now() - start }
    }

    const raw = await response.json() as Array<{
      name: string; full_name: string; description: string | null
      language: string | null; default_branch: string; updated_at: string; private: boolean
    }>

    const repos = raw.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      default_branch: r.default_branch,
      updated_at: r.updated_at,
      private: r.private,
    }))

    return { success: true, data: { repos, count: repos.length }, durationMs: Date.now() - start }
  } catch (err) {
    return { success: false, data: null, error: `GitHub list repos error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_list_files ─────────────────────────────────────────

export const githubListFilesDefinition: ToolDefinition = {
  name: 'github_list_files',
  description: 'List files and directories at a path in a GitHub repository. Use to explore repo structure before reading specific files.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      path: { type: 'string', description: 'Directory path to list (default: repo root)' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
    },
    required: ['owner', 'repo'],
  },
}

export async function githubListFiles(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const owner = input['owner'] as string
  const repo = input['repo'] as string
  const path = (input['path'] as string | undefined) ?? ''
  const branch = (input['branch'] as string | undefined) ?? 'main'

  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
    const response = await fetch(url, { headers: getHeaders(_context.githubToken) })

    if (!response.ok) {
      return { success: false, data: null, error: `GitHub list files failed: ${response.status}`, durationMs: Date.now() - start }
    }

    const raw = await response.json() as Array<{
      name: string; path: string; type: 'file' | 'dir'; size: number
    }>

    if (!Array.isArray(raw)) {
      return { success: false, data: null, error: 'Path points to a file, not a directory — use github_read_file instead', durationMs: Date.now() - start }
    }

    const entries = raw.map((e) => ({ name: e.name, path: e.path, type: e.type, size: e.size }))
    return { success: true, data: { path: path || '(root)', branch, entries, count: entries.length }, durationMs: Date.now() - start }
  } catch (err) {
    return { success: false, data: null, error: `GitHub list files error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_search_code ────────────────────────────────────────

export const githubSearchCodeDefinition: ToolDefinition = {
  name: 'github_search_code',
  description: 'Search code across GitHub repositories. Use to check if a feature already exists before speccing it, or to compare competitor implementations.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "RAGEngine" or "useAuth hook")' },
      owner: { type: 'string', description: 'Limit search to this owner/org (recommended to avoid noise)' },
      repo: { type: 'string', description: 'Limit search to this specific repo (requires owner)' },
      language: { type: 'string', description: 'Filter by language (e.g. "TypeScript", "Python")' },
      per_page: { type: 'number', description: 'Max results (default 10, max 30)' },
    },
    required: ['query'],
  },
}

export async function githubSearchCode(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string
  const owner = input['owner'] as string | undefined
  const repo = input['repo'] as string | undefined
  const language = input['language'] as string | undefined
  const perPage = Math.min(Number(input['per_page'] ?? 10), 30)

  try {
    let q = query
    if (owner && repo) q += ` repo:${owner}/${repo}`
    else if (owner) q += ` user:${owner}`
    if (language) q += ` language:${language}`

    const url = `${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=${perPage}`
    const response = await fetch(url, {
      headers: {
        ...getHeaders(_context.githubToken),
        Accept: 'application/vnd.github.v3.text-match+json',
      },
    })

    if (response.status === 403) {
      return { success: false, data: null, error: 'GitHub search rate limit reached — wait 60 seconds and retry', durationMs: Date.now() - start }
    }
    if (!response.ok) {
      return { success: false, data: null, error: `GitHub search failed: ${response.status}`, durationMs: Date.now() - start }
    }

    const raw = await response.json() as {
      total_count: number
      items: Array<{
        path: string
        repository: { full_name: string; html_url: string }
        html_url: string
        score: number
      }>
    }

    const items = raw.items.map((i) => ({
      path: i.path,
      repo: i.repository.full_name,
      url: i.html_url,
      score: i.score,
    }))

    return {
      success: true,
      data: { query: q, total_count: raw.total_count, items },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { success: false, data: null, error: `GitHub search error: ${err instanceof Error ? err.message : 'Unknown'}`, durationMs: Date.now() - start }
  }
}

// ─── github_create_pr ──────────────────────────────────────────

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
      headers: { ...getHeaders(_context.githubToken), 'Content-Type': 'application/json' },
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
