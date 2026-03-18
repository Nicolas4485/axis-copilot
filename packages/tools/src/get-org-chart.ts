// get_org_chart — Recursive tree from stakeholder relations, D3-ready JSON
// Used by: StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface GetOrgChartInput {
  clientId: string
}

/** D3-ready tree node */
interface OrgChartNode {
  id: string
  name: string
  role: string
  influence: string
  interest: string
  department: string | null
  children: OrgChartNode[]
}

export const getOrgChartDefinition: ToolDefinition = {
  name: 'get_org_chart',
  description: 'Retrieve the stakeholder org chart for a client. Returns stakeholders with reporting relationships and influence/interest levels.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID' },
    },
    required: ['clientId'],
  },
}

export async function getOrgChart(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const clientId = input['clientId'] as string | undefined

  if (!clientId) {
    return { success: false, data: null, error: 'clientId is required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Query all stakeholders for this client
    // const stakeholders = await prisma.stakeholder.findMany({
    //   where: { clientId },
    //   include: { reportsTo: true, directReports: true },
    //   orderBy: { name: 'asc' },
    // })

    // TODO: Query StakeholderRelation for REPORTS_TO edges
    // const relations = await prisma.stakeholderRelation.findMany({
    //   where: {
    //     from: { clientId },
    //     relationshipType: 'REPORTS_TO',
    //   },
    // })

    // Placeholder: return empty tree structure
    const stakeholders: Array<{
      id: string; name: string; role: string
      influence: string; interest: string
      department: string | null; reportsToId: string | null
    }> = []

    // Build tree: find roots (no reportsTo), then recursively attach children
    const tree = buildTree(stakeholders)

    return {
      success: true,
      data: {
        clientId,
        stakeholderCount: stakeholders.length,
        tree,
        // Flat list for table view
        flat: stakeholders.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          influence: s.influence,
          interest: s.interest,
          department: s.department,
          reportsToId: s.reportsToId,
        })),
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to get org chart: ${errorMsg}`, durationMs: Date.now() - start }
  }
}

/** Build a D3-ready tree from a flat stakeholder list */
function buildTree(
  stakeholders: Array<{
    id: string; name: string; role: string
    influence: string; interest: string
    department: string | null; reportsToId: string | null
  }>
): OrgChartNode[] {
  const nodeMap = new Map<string, OrgChartNode>()

  // Create all nodes
  for (const s of stakeholders) {
    nodeMap.set(s.id, {
      id: s.id,
      name: s.name,
      role: s.role,
      influence: s.influence,
      interest: s.interest,
      department: s.department,
      children: [],
    })
  }

  // Attach children to parents
  const roots: OrgChartNode[] = []
  for (const s of stakeholders) {
    const node = nodeMap.get(s.id)
    if (!node) continue

    if (s.reportsToId) {
      const parent = nodeMap.get(s.reportsToId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node) // Parent not found — treat as root
      }
    } else {
      roots.push(node)
    }
  }

  return roots
}
