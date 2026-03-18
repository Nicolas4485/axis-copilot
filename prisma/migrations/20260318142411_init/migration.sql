-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StakeholderInfluence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "StakeholderInterest" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('REPORTS_TO', 'COLLABORATES', 'INFLUENCES', 'BLOCKS');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('PRODUCT_CRITIQUE', 'PROCESS_ANALYSIS', 'COMPETITIVE', 'STAKEHOLDER_MAP');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GDRIVE', 'UPLOAD', 'WEB', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'INDEXED', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('UNRESOLVED', 'RESOLVED_A', 'RESOLVED_B', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('EPISODIC', 'SEMANTIC', 'PROCEDURAL');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_DOCS', 'GOOGLE_SHEETS', 'GMAIL', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "ExportDestination" AS ENUM ('GDOC', 'GSHEET', 'EMAIL', 'MARKDOWN', 'JSON');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CONSULTANT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "company_size" INTEGER,
    "website" TEXT,
    "notes" TEXT,
    "tech_stack" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "title" TEXT,
    "mode" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contexts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "summary" TEXT,
    "pain_points" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "budget_signal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholders" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "influence" "StakeholderInfluence" NOT NULL DEFAULT 'MEDIUM',
    "interest" "StakeholderInterest" NOT NULL DEFAULT 'MEDIUM',
    "department" TEXT,
    "reports_to_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_relations" (
    "id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "relationship_type" "RelationshipType" NOT NULL,

    CONSTRAINT "stakeholder_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" "AnalysisType" NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_entries" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "features" JSONB NOT NULL DEFAULT '[]',
    "positioning" TEXT,

    CONSTRAINT "competitor_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_steps" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "automation_score" INTEGER NOT NULL,
    "agent_type" TEXT,
    "human_checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "human_checkpoint_reason" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "process_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "title" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_path" TEXT,
    "source_id" TEXT,
    "mime_type" TEXT,
    "doc_type" TEXT,
    "checksum" TEXT,
    "last_synced" TIMESTAMP(3),
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "conflict_notes" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "entity_count" INTEGER NOT NULL DEFAULT 0,
    "attribution_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "entity_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "value_a" TEXT NOT NULL,
    "value_b" TEXT NOT NULL,
    "source_doc_a" TEXT NOT NULL,
    "source_doc_b" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "memory_type" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "destination" "ExportDestination" NOT NULL,
    "external_id" TEXT,
    "external_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "clients_user_id_idx" ON "clients"("user_id");

-- CreateIndex
CREATE INDEX "clients_created_at_idx" ON "clients"("created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_client_id_idx" ON "sessions"("client_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "client_contexts_client_id_idx" ON "client_contexts"("client_id");

-- CreateIndex
CREATE INDEX "client_contexts_session_id_idx" ON "client_contexts"("session_id");

-- CreateIndex
CREATE INDEX "stakeholders_client_id_idx" ON "stakeholders"("client_id");

-- CreateIndex
CREATE INDEX "stakeholder_relations_from_id_idx" ON "stakeholder_relations"("from_id");

-- CreateIndex
CREATE INDEX "stakeholder_relations_to_id_idx" ON "stakeholder_relations"("to_id");

-- CreateIndex
CREATE UNIQUE INDEX "stakeholder_relations_from_id_to_id_relationship_type_key" ON "stakeholder_relations"("from_id", "to_id", "relationship_type");

-- CreateIndex
CREATE INDEX "analyses_session_id_idx" ON "analyses"("session_id");

-- CreateIndex
CREATE INDEX "analyses_client_id_idx" ON "analyses"("client_id");

-- CreateIndex
CREATE INDEX "analyses_created_at_idx" ON "analyses"("created_at");

-- CreateIndex
CREATE INDEX "competitor_entries_analysis_id_idx" ON "competitor_entries"("analysis_id");

-- CreateIndex
CREATE INDEX "process_steps_analysis_id_idx" ON "process_steps"("analysis_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_user_id_idx" ON "knowledge_documents"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_client_id_idx" ON "knowledge_documents"("client_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_sync_status_idx" ON "knowledge_documents"("sync_status");

-- CreateIndex
CREATE INDEX "knowledge_documents_created_at_idx" ON "knowledge_documents"("created_at");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- CreateIndex
CREATE INDEX "document_chunks_created_at_idx" ON "document_chunks"("created_at");

-- CreateIndex
CREATE INDEX "conflict_records_user_id_idx" ON "conflict_records"("user_id");

-- CreateIndex
CREATE INDEX "conflict_records_client_id_idx" ON "conflict_records"("client_id");

-- CreateIndex
CREATE INDEX "conflict_records_status_idx" ON "conflict_records"("status");

-- CreateIndex
CREATE INDEX "conflict_records_created_at_idx" ON "conflict_records"("created_at");

-- CreateIndex
CREATE INDEX "agent_memories_user_id_idx" ON "agent_memories"("user_id");

-- CreateIndex
CREATE INDEX "agent_memories_client_id_idx" ON "agent_memories"("client_id");

-- CreateIndex
CREATE INDEX "agent_memories_created_at_idx" ON "agent_memories"("created_at");

-- CreateIndex
CREATE INDEX "integrations_user_id_idx" ON "integrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_user_id_provider_key" ON "integrations"("user_id", "provider");

-- CreateIndex
CREATE INDEX "export_records_session_id_idx" ON "export_records"("session_id");

-- CreateIndex
CREATE INDEX "cost_records_session_id_idx" ON "cost_records"("session_id");

-- CreateIndex
CREATE INDEX "cost_records_user_id_idx" ON "cost_records"("user_id");

-- CreateIndex
CREATE INDEX "cost_records_created_at_idx" ON "cost_records"("created_at");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contexts" ADD CONSTRAINT "client_contexts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contexts" ADD CONSTRAINT "client_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "stakeholders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_relations" ADD CONSTRAINT "stakeholder_relations_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "stakeholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_relations" ADD CONSTRAINT "stakeholder_relations_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "stakeholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_entries" ADD CONSTRAINT "competitor_entries_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_records" ADD CONSTRAINT "conflict_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_records" ADD CONSTRAINT "conflict_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
