// Neo4j knowledge graph schema — node and relationship type definitions

// ─── Base types ──────────────────────────────────────────────────────

/** Common properties on every graph node */
export interface BaseNode {
  id: string
  name: string
  createdAt: string   // ISO 8601
  updatedAt: string   // ISO 8601
  sourceDocIds: string[]
}

/** Label names for Neo4j nodes */
export type NodeLabel =
  | 'Client'
  | 'Competitor'
  | 'Technology'
  | 'Person'
  | 'Process'
  | 'Industry'
  | 'Concept'
  | 'Document'
  | 'Meeting'
  | 'Decision'

// ─── Node types ──────────────────────────────────────────────────────

export interface ClientNode extends BaseNode {
  label: 'Client'
  industry: string
  size: string
  stage: string
}

export interface CompetitorNode extends BaseNode {
  label: 'Competitor'
  website: string | null
  fundingStage: string | null
  employeeCount: number | null
}

export interface TechnologyNode extends BaseNode {
  label: 'Technology'
  category: string
  vendor: string | null
}

export interface PersonNode extends BaseNode {
  label: 'Person'
  role: string
  email: string | null
  influence: 'HIGH' | 'MEDIUM' | 'LOW'
  clientId: string | null
}

export interface ProcessNode extends BaseNode {
  label: 'Process'
  automationScore: number
  complexity: 'HIGH' | 'MEDIUM' | 'LOW'
  owner: string | null
}

export interface IndustryNode extends BaseNode {
  label: 'Industry'
  sector: string
  subSector: string | null
}

export interface ConceptNode extends BaseNode {
  label: 'Concept'
  domain: string
  definition: string
}

export interface DocumentNode extends BaseNode {
  label: 'Document'
  sourceType: 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL'
  mimeType: string
  clientId: string | null
}

export interface MeetingNode extends BaseNode {
  label: 'Meeting'
  date: string           // ISO 8601
  attendees: string[]
  outcomes: string[]
}

export interface DecisionNode extends BaseNode {
  label: 'Decision'
  rationale: string
  madeBy: string
  date: string           // ISO 8601
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'
}

/** Union of all graph node types */
export type GraphNode =
  | ClientNode
  | CompetitorNode
  | TechnologyNode
  | PersonNode
  | ProcessNode
  | IndustryNode
  | ConceptNode
  | DocumentNode
  | MeetingNode
  | DecisionNode

// ─── Relationship types ──────────────────────────────────────────────

export type RelationshipType =
  | 'COMPETES_WITH'
  | 'USES_TECHNOLOGY'
  | 'WORKS_AT'
  | 'MENTIONED_IN'
  | 'DEPENDS_ON'
  | 'BLOCKS'
  | 'INFLUENCES'
  | 'CONFLICTS_WITH'
  | 'PART_OF'
  | 'LEADS_TO'
  | 'REPORTS_TO'

/** Common properties on every relationship */
export interface BaseRelationship {
  type: RelationshipType
  fromId: string
  toId: string
}

export interface CompetesWithRel extends BaseRelationship {
  type: 'COMPETES_WITH'
  since: string | null
  marketOverlap: string[]
}

export interface UsesTechnologyRel extends BaseRelationship {
  type: 'USES_TECHNOLOGY'
  since: string | null
  depth: 'CORE' | 'SUPPLEMENTARY' | 'EXPERIMENTAL'
}

export interface WorksAtRel extends BaseRelationship {
  type: 'WORKS_AT'
  role: string
  since: string | null
  influence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface MentionedInRel extends BaseRelationship {
  type: 'MENTIONED_IN'
  context: string
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null
}

export interface DependsOnRel extends BaseRelationship {
  type: 'DEPENDS_ON'
  criticality: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface BlocksRel extends BaseRelationship {
  type: 'BLOCKS'
  reason: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface InfluencesRel extends BaseRelationship {
  type: 'INFLUENCES'
  direction: 'POSITIVE' | 'NEGATIVE' | 'MIXED'
  weight: number  // 0.0 to 1.0
}

export interface ConflictsWithRel extends BaseRelationship {
  type: 'CONFLICTS_WITH'
  reason: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export interface PartOfRel extends BaseRelationship {
  type: 'PART_OF'
  order: number | null
  optional: boolean
}

export interface LeadsToRel extends BaseRelationship {
  type: 'LEADS_TO'
  probability: number  // 0.0 to 1.0
}

export interface ReportsToRel extends BaseRelationship {
  type: 'REPORTS_TO'
  since: string | null
}

/** Union of all relationship types */
export type GraphRelationship =
  | CompetesWithRel
  | UsesTechnologyRel
  | WorksAtRel
  | MentionedInRel
  | DependsOnRel
  | BlocksRel
  | InfluencesRel
  | ConflictsWithRel
  | PartOfRel
  | LeadsToRel
  | ReportsToRel

// ─── Query result types ──────────────────────────────────────────────

/** A node with its direct relationships */
export interface NodeWithRelationships {
  node: GraphNode
  relationships: Array<{
    relationship: GraphRelationship
    targetNode: GraphNode
  }>
}

/** A path between two nodes */
export interface GraphPath {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  length: number
}

/** A subgraph (e.g. everything related to a client) */
export interface Subgraph {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
}

/** A detected conflict between two nodes */
export interface GraphConflict {
  nodeA: GraphNode
  nodeB: GraphNode
  property: string
  valueA: unknown
  valueB: unknown
  relationship: GraphRelationship | null
}
