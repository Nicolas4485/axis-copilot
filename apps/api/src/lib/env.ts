// Environment variable validation — runs at startup before any routes are registered.
// Throws with a clear message if required vars are missing so the process exits
// immediately rather than failing silently mid-request.

import { z } from 'zod'

const envSchema = z.object({
  // Required
  ANTHROPIC_API_KEY: z.string().optional().default(''),  // Optional — local-only mode works without it
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),

  // Optional with defaults
  PORT: z.string().optional().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  NEO4J_URI: z.string().optional().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().optional().default('neo4j'),
  NEO4J_PASSWORD: z.string().optional().default(''),
  OLLAMA_BASE_URL: z.string().optional().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().optional().default('qwen3:8b'),

  // Google OAuth — optional (features gracefully degrade if not set)
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default('http://localhost:4000/api/integrations/google/callback'),

  // Voyage AI — optional
  VOYAGE_API_KEY: z.string().optional().default(''),

  // Gemini — optional (Aria uses Gemini 2.0 Flash Live for voice/video)
  GEMINI_API_KEY: z.string().optional().default(''),

  // GitHub — optional (enables private repo sync + higher rate limits)
  GITHUB_TOKEN: z.string().optional().default(''),
})

export type Env = z.infer<typeof envSchema>

/**
 * Validate process.env at startup.
 * Throws a descriptive error listing ALL missing/invalid vars — not just the first.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `\n\n❌ Environment validation failed — server cannot start:\n${issues}\n\n` +
      `Copy .env.example to .env and fill in the required values.\n`
    )
  }

  return result.data
}

/** Cached validated env (set after validateEnv() is called at startup) */
let _env: Env | null = null

export function env(): Env {
  if (!_env) {
    throw new Error('env() called before validateEnv() — call validateEnv() at server startup')
  }
  return _env
}

export function initEnv(): Env {
  _env = validateEnv()
  return _env
}
