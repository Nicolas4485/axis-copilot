// Shared utilities for SDK agent implementations

/** Extract plain text from a BetaMessage content array. */
export function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (b): b is { type: 'text'; text: string } =>
        typeof b === 'object' &&
        b !== null &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
    )
    .map((b) => b.text)
    .join('')
}
