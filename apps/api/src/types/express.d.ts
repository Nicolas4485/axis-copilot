// Augment Express Request with AXIS-specific fields injected by middleware.

declare global {
  namespace Express {
    interface Request {
      /** Set by injectRequestId middleware on every request. */
      requestId: string
      /** Set by authenticate middleware after JWT validation. */
      userId?: string
      /** Set by authenticate middleware after JWT validation. */
      userEmail?: string
    }
  }
}

export {}
