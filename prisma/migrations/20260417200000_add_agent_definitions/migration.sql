-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('MICRO', 'TASK', 'AGENT');

-- CreateTable
CREATE TABLE "agent_definitions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "tier" "AgentTier" NOT NULL DEFAULT 'AGENT',
    "system_prompt_text" TEXT NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "md_manifest" TEXT,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_definitions_user_id_key_key" ON "agent_definitions"("user_id", "key");

-- CreateIndex
CREATE INDEX "agent_definitions_user_id_idx" ON "agent_definitions"("user_id");

-- CreateIndex
CREATE INDEX "agent_definitions_is_active_idx" ON "agent_definitions"("is_active");

-- AddForeignKey
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
