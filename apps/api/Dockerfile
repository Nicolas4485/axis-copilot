# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# ─── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/agents/package.json packages/agents/
COPY packages/inference/package.json packages/inference/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/knowledge-graph/package.json packages/knowledge-graph/
COPY packages/memory/package.json packages/memory/
COPY packages/rag/package.json packages/rag/
COPY packages/tools/package.json packages/tools/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
COPY prisma ./prisma
RUN pnpm --filter @axis/api prisma generate
RUN pnpm --filter @axis/api build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
