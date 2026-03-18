// Neo4j knowledge graph — @axis/knowledge-graph

// Schema types
export type {
  BaseNode,
  BaseRelationship,
  NodeLabel,
  RelationshipType,
  GraphNode,
  GraphRelationship,
  ClientNode,
  CompetitorNode,
  TechnologyNode,
  PersonNode,
  ProcessNode,
  IndustryNode,
  ConceptNode,
  DocumentNode,
  MeetingNode,
  DecisionNode,
  CompetesWithRel,
  UsesTechnologyRel,
  WorksAtRel,
  MentionedInRel,
  DependsOnRel,
  BlocksRel,
  InfluencesRel,
  ConflictsWithRel,
  PartOfRel,
  LeadsToRel,
  ReportsToRel,
  NodeWithRelationships,
  GraphPath,
  Subgraph,
  GraphConflict,
} from './schema.js'

// Client
export { Neo4jClient } from './client.js'
export type { Neo4jConfig, Neo4jHealthStatus } from './client.js'

// Operations
export { GraphOperations } from './operations.js'
export type { NodeProperties, RelationshipProperties } from './operations.js'
