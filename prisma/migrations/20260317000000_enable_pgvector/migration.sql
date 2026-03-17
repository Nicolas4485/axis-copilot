-- Enable pgvector extension before schema tables are created.
-- This migration runs first so that vector(1536) columns in subsequent
-- migrations are valid.
CREATE EXTENSION IF NOT EXISTS vector;
