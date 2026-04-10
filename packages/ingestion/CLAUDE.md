# Ingestion Package Rules

## Architecture
15-step pipeline: fetch -> checksum -> attribute -> parse -> classify -> chunk -> embed -> store -> extract_entities -> verify -> detect_conflicts -> update_records -> episodic_memory -> publish -> finalise

## Key patterns
- Document type detection: 12 types (STRATEGY_DOC, FINANCIAL_REPORT, MEETING_NOTES, etc.)
- Chunk size: 400-600 tokens with 50-token overlap
- Embedding: Voyage AI (voyage-3) — falls back to zero vectors if unavailable
- Entity extraction uses Claude with confidence scoring (>0.8 auto-accept, 0.4-0.8 verify with Haiku, <0.4 drop)
- Client auto-attribution via folder matching + content analysis

## Known gaps (as of April 2026)
- BullMQ batch processing being wired (currently being fixed)
- Google Drive webhook not implemented (no incremental sync)
- Drive file fetch is a TODO stub
- Webhook renewal cron not implemented
