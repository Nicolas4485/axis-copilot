-- Add settings JSON column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
