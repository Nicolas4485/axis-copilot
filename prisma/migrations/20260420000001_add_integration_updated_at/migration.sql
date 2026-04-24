-- Add missing updated_at column to integrations table
-- This column is defined in schema.prisma but was absent from the initial migration

ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
