// Maps AXIS session IDs → SDK session IDs for conversation continuity.
// One entry per active Aria text session; cleared when user ends session.

export class SdkSessionStore {
  private readonly sessions = new Map<string, string>()

  get(ariaSessionId: string): string | undefined {
    return this.sessions.get(ariaSessionId)
  }

  set(ariaSessionId: string, sdkSessionId: string): void {
    this.sessions.set(ariaSessionId, sdkSessionId)
  }

  clear(ariaSessionId: string): void {
    this.sessions.delete(ariaSessionId)
  }

  size(): number {
    return this.sessions.size
  }
}
