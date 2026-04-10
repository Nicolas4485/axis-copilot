# Knowledge Graph Package Rules

## Architecture
Neo4j-backed knowledge graph with 10 node types and 11 relationship types.

Node types: Client, Competitor, Technology, Person, Process, Industry, Concept, Document, Meeting, Decision
Relationship types: COMPETES_WITH, USES_TECHNOLOGY, CONFLICTS_WITH, RELATES_TO, ATTENDED_BY, DECIDED_AT, PART_OF, WORKS_FOR, MENTIONED_IN, DEPENDS_ON, SIMILAR_TO

## Key patterns
- All operations use merge/upsert semantics (no duplicates)
- Timestamps and source tracking on all nodes and relationships
- Graph traversal depth capped at 4 (performance guard)
- findRelated() returns typed entities with relationship metadata
- APOC library required for mergeNodes() — needs fallback without APOC

## Rules
- Never create duplicate nodes — always use merge
- Always track source document on entity creation
- Confidence scores must be stored on extracted entities
- Graph queries should complement vector search, not replace it
