-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: output_feedback
CREATE TABLE "output_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "deal_id" TEXT,
    "agent_key" TEXT NOT NULL,
    "output_type" TEXT NOT NULL,
    "output_ref" TEXT,
    "rating" INTEGER NOT NULL,
    "original_text" TEXT NOT NULL,
    "corrected_text" TEXT,
    "comment" TEXT,
    "learned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "output_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "output_feedback_user_id_idx" ON "output_feedback"("user_id");
CREATE INDEX "output_feedback_agent_key_idx" ON "output_feedback"("agent_key");
CREATE INDEX "output_feedback_learned_idx" ON "output_feedback"("learned");
CREATE INDEX "output_feedback_created_at_idx" ON "output_feedback"("created_at");

-- AddForeignKey
ALTER TABLE "output_feedback" ADD CONSTRAINT "output_feedback_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
