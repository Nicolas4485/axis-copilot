# Phase 1 Kickoff Prompt
# Copy and paste this entire message into a new Claude Code session inside axis-copilot/

---

Read CLAUDE.md and AXIS_PE_SPEC.md in full before doing anything else.

We are building Phase 1 of the Axis Copilot PE edition. All context is in those two files.
Start with Task 1.1 — fix the clientId scoping bug. This is a data leakage issue where
clientId is null throughout the Aria agent context, RAG retrieval, and Neo4j operations,
meaning all users' data is mixed together.

Work through all 4 Phase 1 tasks in order:
1. clientId scoping fix
2. Auth & registration flow  
3. Gemini Live model name + error handling
4. Conflict Detection Dashboard UI

For each task: read the relevant files first, make the changes, then verify against the
acceptance criteria listed in AXIS_PE_SPEC.md before moving to the next task.

Do not start Phase 2 until all 4 Phase 1 tasks pass their acceptance criteria.
