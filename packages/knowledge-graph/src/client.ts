// Neo4j client — connection pooling, typed queries, transaction wrapper,
// exponential backoff retries, health check, graceful degradation

import neo4j, {
  type Driver,
  type Session,
  type ManagedTransaction,
  type QueryResult,
  type RecordShape,
} from 'neo4j-driver'

/** Configuration for the Neo4j client */
export interface Neo4jConfig {
  uri: string
  username: string
  password: string
  database?: string
  maxConnectionPoolSize?: number
}

/** Result of a health check */
export interface Neo4jHealthStatus {
  connected: boolean
  latencyMs: number
  error?: string
}

const DEFAULT_MAX_POOL_SIZE = 50
const MAX_RETRIES = 3
const BASE_DELAY_MS = 200

/** Load config from environment variables */
function loadConfig(): Neo4jConfig {
  const uri = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687'
  const username = process.env['NEO4J_USERNAME'] ?? 'neo4j'
  const password = process.env['NEO4J_PASSWORD'] ?? 'changeme'
  const database = process.env['NEO4J_DATABASE'] ?? 'neo4j'
  const maxPool = process.env['NEO4J_MAX_POOL_SIZE']
  const maxConnectionPoolSize = maxPool
    ? parseInt(maxPool, 10)
    : DEFAULT_MAX_POOL_SIZE

  return { uri, username, password, database, maxConnectionPoolSize }
}

/**
 * Neo4j client with connection pooling, retries, and graceful degradation.
 *
 * Usage:
 *   const client = new Neo4jClient()
 *   const result = await client.query('MATCH (n) RETURN n LIMIT 10')
 *   await client.close()
 */
export class Neo4jClient {
  private driver: Driver | null = null
  private config: Neo4jConfig
  private available = true

  constructor(config?: Neo4jConfig) {
    this.config = config ?? loadConfig()
  }

  /** Get or create the driver (lazy init) */
  private getDriver(): Driver {
    if (!this.driver) {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize ?? DEFAULT_MAX_POOL_SIZE,
          connectionAcquisitionTimeout: 5000,
          connectionTimeout: 5000,
        }
      )
    }
    return this.driver
  }

  /** Get a new session */
  private getSession(): Session {
    return this.getDriver().session({
      database: this.config.database ?? 'neo4j',
    })
  }

  /**
   * Run a read-only Cypher query with exponential backoff retries.
   * Returns null if Neo4j is unavailable (graceful degradation).
   */
  async query<T extends RecordShape = RecordShape>(
    cypher: string,
    params?: Record<string, unknown>
  ): Promise<QueryResult<T> | null> {
    if (!this.available) {
      console.warn('[Neo4j] Unavailable — returning null (graceful degradation)')
      return null
    }

    return this.withRetry(async () => {
      const session = this.getSession()
      try {
        return await session.executeRead(
          (tx: ManagedTransaction) => tx.run<T>(cypher, params ?? {})
        )
      } finally {
        await session.close()
      }
    })
  }

  /**
   * Run a write Cypher query with exponential backoff retries.
   * Returns null if Neo4j is unavailable.
   */
  async write<T extends RecordShape = RecordShape>(
    cypher: string,
    params?: Record<string, unknown>
  ): Promise<QueryResult<T> | null> {
    if (!this.available) {
      console.warn('[Neo4j] Unavailable — returning null (graceful degradation)')
      return null
    }

    return this.withRetry(async () => {
      const session = this.getSession()
      try {
        return await session.executeWrite(
          (tx: ManagedTransaction) => tx.run<T>(cypher, params ?? {})
        )
      } finally {
        await session.close()
      }
    })
  }

  /**
   * Run multiple write operations in a single transaction.
   * Returns null if Neo4j is unavailable.
   */
  async writeTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>
  ): Promise<T | null> {
    if (!this.available) {
      console.warn('[Neo4j] Unavailable — returning null (graceful degradation)')
      return null
    }

    return this.withRetry(async () => {
      const session = this.getSession()
      try {
        return await session.executeWrite(work)
      } finally {
        await session.close()
      }
    })
  }

  /** Health check — verify connectivity and measure latency */
  async healthCheck(): Promise<Neo4jHealthStatus> {
    const start = Date.now()
    try {
      const result = await this.query('RETURN 1 AS ok')
      if (!result) {
        return { connected: false, latencyMs: Date.now() - start, error: 'Unavailable' }
      }
      this.available = true
      return { connected: true, latencyMs: Date.now() - start }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      this.available = false
      return { connected: false, latencyMs: Date.now() - start, error }
    }
  }

  /** Check if Neo4j is currently available */
  isAvailable(): boolean {
    return this.available
  }

  /** Mark as unavailable (called externally when connection fails) */
  markUnavailable(): void {
    this.available = false
    console.warn('[Neo4j] Marked as unavailable — falling back to vector-only RAG')
  }

  /** Mark as available (called after successful reconnection) */
  markAvailable(): void {
    this.available = true
    console.log('[Neo4j] Reconnected — graph queries enabled')
  }

  /** Close the driver and release all connections */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
    }
  }

  /**
   * Retry wrapper with exponential backoff.
   * On final failure, marks Neo4j as unavailable and returns null.
   */
  private async withRetry<T>(
    operation: () => Promise<T>
  ): Promise<T | null> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await operation()
      } catch (err) {
        lastError = err
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        console.warn(
          `[Neo4j] Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }. Retrying in ${delay}ms...`
        )

        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(delay)
        }
      }
    }

    // All retries exhausted — degrade gracefully
    this.available = false
    const errorMsg = lastError instanceof Error ? lastError.message : 'Unknown error'
    console.error(
      `[Neo4j] All ${MAX_RETRIES} retries exhausted. Marking unavailable. Last error: ${errorMsg}`
    )
    return null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
