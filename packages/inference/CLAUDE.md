# Inference Package Rules

## Architecture
Unified inference engine with model routing and cost tracking.
- Route: Qwen3 8B (local/Ollama:11434) -> Claude Haiku (fast) -> Claude Sonnet (balanced)
- All model calls go through InferenceEngine.route() — never call APIs directly
- Cost tracking per task, session, and model
- Prompt library with templated system prompts per agent type

## Key patterns
- Task types determine model selection (entity_extraction -> Haiku, strategy_analysis -> Sonnet)
- Local-first: attempt Ollama, fall back to Claude API
- Token counting and cost estimation before each call
- Rate limiting awareness built in

## Rules
- Never bypass InferenceEngine — it tracks costs and applies routing logic
- Always specify task type when calling route() for proper model selection
- Cost tracker persistence is in-memory only (Redis TODO)
- Prompt templates must be versioned for reproducibility
