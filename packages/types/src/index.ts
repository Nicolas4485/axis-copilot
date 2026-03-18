// Shared TypeScript types for the AXIS platform

export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E }

export interface RequestContext {
  requestId: string
  userId: string
  timestamp: Date
}

// Encryption utilities
export { encrypt, decrypt } from './encryption.js'
