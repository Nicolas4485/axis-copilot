# AXIS Project Memory

## PROJECT
Name: axis-copilot
Purpose: AI consulting co-pilot with agentic RAG, knowledge graph, multi-agent system
Stack: Next.js 14 App Router, Express + TypeScript, PostgreSQL 16 + pgvector,
       Redis 7, Neo4j 5.18, Ollama Qwen3 8B (local), Anthropic API
Package manager: pnpm (workspaces + turborepo). Node: 24.x

## STRUCTURE
apps/web          — Next.js 14 frontend (port 3000)
apps/api          — Express backend (port 4000)
packages/agents   — 5 specialist agents + orchestrator
packages/inference — InferenceEngine (Qwen3 router + Claude client + cost tracker)
packages/ingestion — Document parsers + ingestion pipeline
packages/knowledge-graph — Neo4j client + operations
packages/rag      — RAG retriever + compressor + citations
packages/memory   — Infinite memory manager (5-tier)
packages/tools    — All agent tools
packages/types    — Shared TypeScript interfaces + encryption utility
prisma/           — Schema + migrations

## COMMANDS
dev:           pnpm dev
build:         pnpm build
test:          pnpm test
typecheck:     pnpm typecheck
lint:          pnpm lint
db:migrate:    pnpm db:migrate
db:seed:       pnpm db:seed
local-models:  ollama pull qwen3:8b && ollama serve
docker-up:     docker-compose up -d
health:        curl http://localhost:4000/api/health

## CRITICAL ARCHITECTURE RULES
- ALL model calls go through packages/inference/src/index.ts (InferenceEngine)
- NEVER call Anthropic SDK directly from agent code
- NEVER call Ollama directly from agent code
- Qwen3 handles ALL pipeline tasks
- Claude Haiku: entity verification and session summarisation ONLY
- Claude Sonnet: user-facing outputs ONLY (responses, emails, reports)
- System prompts MUST stay within tier limits: MICRO<=150, TASK<=400, AGENT<=800 tokens
- Dynamic context goes in USER turn, not system prompt
- All Claude calls use prompt caching (cache_control: ephemeral)

## CONVENTIONS
- API: REST, camelCase JSON, { error, code, requestId } on errors
- Database: snake_case columns, PascalCase Prisma models
- OAuth tokens encrypted at rest (AES-256-GCM)
- SSE events: { type: "token"|"tool_start"|"tool_result"|"conflict_warning"|"done" }

## KNOWN GOTCHAS
- pgvector: embedding column uses raw SQL
- Ollama JSON mode: add format:"json" to request body not prompt
- Neo4j unavailable: fall back to vector-only RAG, never crash API
- Drive webhooks expire every 7 days: renewal cron runs daily at 23:00 UTC

## DO NOT TOUCH
- prisma/migrations/ — never edit, only add new migrations
- packages/inference/src/prompt-library.ts — discuss before changing
- .env files — read only
