-- AlterTable
ALTER TABLE "integrations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "pitch_deck_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pptx_buffer" BYTEA NOT NULL,
    "theme_json" JSONB NOT NULL,
    "slot_map" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pitch_deck_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pitch_deck_templates_user_id_idx" ON "pitch_deck_templates"("user_id");

-- AddForeignKey
ALTER TABLE "pitch_deck_templates" ADD CONSTRAINT "pitch_deck_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
