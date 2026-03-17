-- ivfflat indexes for approximate nearest-neighbor search.
-- Run this AFTER prisma migrate dev, once the embedding columns exist.
--
-- Via Docker:
--   docker exec -i axis-postgres psql -U axis -d axis < prisma/pgvector.sql
--
-- Or directly (if psql is installed):
--   psql postgresql://axis:axis@localhost:5432/axis -f prisma/pgvector.sql

CREATE INDEX idx_document_chunk_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_agent_memory_embedding
  ON agent_memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
