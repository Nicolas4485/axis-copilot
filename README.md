# AXIS — AI Consulting Co-pilot

A multi-agent AI platform for consulting teams. AXIS routes your questions through five specialist agents (Intake, Product, Process, Competitive, Stakeholder), retrieves context from a knowledge graph and vector store, and remembers everything across sessions.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS, React Query |
| Backend | Express 4, TypeScript, Zod validation |
| Agents | 5 specialist agents via Anthropic SDK |
| Inference | Qwen3 8B (local, Ollama) + Claude Haiku/Sonnet |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| Graph | Neo4j 5.18 |
| Auth | JWT + Google OAuth 2.0 |
| Monorepo | pnpm workspaces + Turborepo |

## Prerequisites

- Node.js ≥ 24
- pnpm ≥ 10
- Docker + Docker Compose
- Ollama (for local inference) — `ollama pull qwen3:8b`
- Anthropic API key

## Quick start

### 1. Clone and install

```bash
git clone <repo-url> axis-copilot
cd axis-copilot
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | ≥32 character secret for JWT signing |
| `ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes) for AES-256-GCM |
| `NEO4J_URI` | No | Default: `bolt://localhost:7687` |
| `NEO4J_USER` | No | Default: `neo4j` |
| `NEO4J_PASSWORD` | No | Default: `changeme` |
| `GOOGLE_CLIENT_ID` | No | For Google Docs/Sheets/Gmail integration |
| `GOOGLE_CLIENT_SECRET` | No | For Google Docs/Sheets/Gmail integration |
| `OLLAMA_BASE_URL` | No | Default: `http://localhost:11434` |

Generate a valid `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start infrastructure

```bash
docker-compose up -d postgres redis neo4j
```

Wait for services to be healthy:
```bash
docker-compose ps
```

### 4. Run database migrations

```bash
pnpm db:migrate:dev
pnpm db:seed
```

### 5. Start local models (optional)

```bash
pnpm local-models
# Pulls qwen3:8b and starts Ollama on port 11434
```

### 6. Start the dev server

```bash
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:4000
- API health: http://localhost:4000/api/health
- Neo4j browser: http://localhost:7474

## Commands

```bash
pnpm dev          # Start all services in watch mode
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm typecheck    # TypeScript check across all packages
pnpm lint         # ESLint across all packages

pnpm db:migrate:dev   # Create a new Prisma migration
pnpm db:migrate       # Deploy migrations (production)
pnpm db:seed          # Seed the database
pnpm db:generate      # Regenerate Prisma client
```

## Project structure

```
axis-copilot/
├── apps/
│   ├── api/          # Express backend (port 4000)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   ├── agents/       # 5 specialist agents + orchestrator
│   ├── inference/    # Model routing (Qwen3 + Claude)
│   ├── ingestion/    # Document parsers + pipeline
│   ├── knowledge-graph/ # Neo4j client + operations
│   ├── memory/       # 5-tier infinite memory system
│   ├── rag/          # Hybrid RAG (pgvector + Neo4j)
│   ├── tools/        # Agent tools + Google integrations
│   └── types/        # Shared TypeScript types
├── prisma/           # Database schema + migrations
└── docker-compose.yml
```

## Architecture overview

### Inference routing

All model calls go through `packages/inference` — never call Anthropic or Ollama directly:

| Task | Model | Fallback |
|---|---|---|
| `agent_response`, `classify`, `entity_extract` | Qwen3 8B (local) | Claude Haiku |
| `entity_verify`, `session_summary` | Claude Haiku | — |
| `user_response`, `user_email`, `user_report` | Claude Sonnet | — |

### Memory tiers

| Tier | Storage | Content |
|---|---|---|
| Working | Redis | Current session (~10 messages) |
| Summary | Redis | Compressed session summaries |
| Episodic | pgvector | Searchable past interactions |
| Semantic | Neo4j | Knowledge graph relationships |
| Archival | Google Drive | Full session exports |

### Specialist agents

| Agent | Mode | Focus |
|---|---|---|
| IntakeAgent | `intake` | Client discovery, pain points, goals |
| ProductAgent | `product` | Product critique, prioritisation |
| ProcessAgent | `process` | Workflow mapping, automation |
| CompetitiveAgent | `competitive` | Market research, positioning |
| StakeholderAgent | `stakeholder` | Org mapping, communication |

## Export formats

| Format | Description |
|---|---|
| Markdown | Plain text transcript download |
| JSON | Structured `{ session, messages }` object |
| PDF | Formatted PDF via `GET /api/exports/:id/pdf` |
| Google Docs | Creates a Doc in your Drive |
| Google Sheets | Transcript as spreadsheet rows |
| Email | Sends to recipient via Gmail |

Google exports require connecting your Google account in Settings.

## API reference

All protected routes require `Authorization: Bearer <jwt>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions/:id` | Get session + messages |
| `POST` | `/api/sessions/:id/messages` | Send a message (SSE stream) |
| `POST` | `/api/exports/:id` | Export session (GDOC/GSHEET/EMAIL/MARKDOWN/JSON) |
| `GET` | `/api/exports/:id/pdf` | Download session as PDF |
| `GET` | `/api/exports/:id` | List session exports |
| `GET` | `/api/clients` | List clients |
| `POST` | `/api/clients` | Create client |
| `GET` | `/api/cost` | Cost summary |

## Docker (staging)

Build and run all services in Docker:

```bash
docker-compose up --build
```

The `api` and `web` services are only needed for staging/CI. For local development, use `pnpm dev` for hot-reload.

## Testing

```bash
pnpm test               # Run all tests
pnpm test:watch         # Watch mode

# Run tests for a specific package
pnpm --filter @axis/inference test
pnpm --filter @axis/rag test
pnpm --filter @axis/api test
```

Tests are co-located with source: `src/__tests__/`.

## Environment validation

The API server validates all required environment variables at startup and exits immediately with a clear error message if anything is missing or misconfigured. This prevents silent failures mid-request.

## Graceful shutdown

The API handles `SIGTERM` and `SIGINT` signals by:
1. Stopping new HTTP connections
2. Closing the PostgreSQL connection pool
3. Quitting the Redis client
4. Exiting cleanly

This ensures zero-downtime deploys work correctly with container orchestrators.
