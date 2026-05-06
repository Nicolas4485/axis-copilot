# Task: Improve the Ingestion Pipeline Chunking Strategy

## Context

This is a TypeScript monorepo (`axis-copilot`) for an AI consulting co-pilot.
The relevant file is:

```
packages/ingestion/src/pipeline.ts
```

Supporting types are in:

```
packages/ingestion/src/types.ts
```

The `ParsedDocument` type (from `types.ts`) has this structure:

```ts
interface ParsedDocument {
  text: string           // full raw text of the document
  sections: ParsedSection[]  // structured sections extracted by the parser
  metadata: DocumentMetadata
  typeSignals: TypeSignal[]
}

interface ParsedSection {
  title: string
  content: string
  level: number   // heading depth: 1 = H1, 2 = H2, etc.
  order: number
}

interface DocumentChunk {
  content: string
  chunkIndex: number
  tokens: number
  metadata: {
    sectionTitle?: string
    pageNumber?: number
    sheetName?: string
    slideNumber?: number
  }
}
```

---

## Current Implementation (the problem)

In `pipeline.ts`, the `chunkDocument()` method (Step 6) works like this:

1. Uses a rough token estimate: `text.length / 4` (1 token ≈ 4 chars)
2. Targets 500 tokens per chunk (400–600 range), 50-token overlap
3. Calculates a positional cut point purely by character count
4. Searches ±200 chars around that cut for a sentence boundary (`.!?` + whitespace) and snaps to it
5. Annotates each chunk with the section it *happens to fall in* — but section boundaries are **never used as split points**

The constants at the top of the file are:
```ts
const CHUNK_TARGET_TOKENS = 500
const CHUNK_MIN_TOKENS = 400
const CHUNK_MAX_TOKENS = 600
const CHUNK_OVERLAP_TOKENS = 50
```

**The problem:** The parsers (GDoc, PDF, transcript, DOCX, etc.) extract rich section structure
with titles and heading levels. The current chunker ignores this entirely for split decisions.
This means a chunk can straddle two unrelated sections — e.g., "Q3 Revenue" and "Headcount
Planning" mixed in a single chunk — which hurts retrieval precision, especially for structured
consulting documents like proposals, contracts, meeting transcripts, and reports.

---

## What to implement

Replace the `chunkDocument()` private method with a **section-aware chunking strategy** that
follows this priority order:

### Priority 1 — Section boundaries (when sections exist)

If `parsed.sections` has content (length > 0), chunk **by section first**, then
sub-split sections that are too large by token count.

Logic:
- For each `ParsedSection`, treat it as an atomic unit if its token count is within
  `CHUNK_MIN_TOKENS` to `CHUNK_MAX_TOKENS`.
- If a section is **smaller than `CHUNK_MIN_TOKENS`**, merge it with the next section
  (as long as the combined total stays under `CHUNK_MAX_TOKENS`). Preserve both section
  titles in the metadata (e.g. `"Intro / Background"`).
- If a section is **larger than `CHUNK_MAX_TOKENS`**, sub-split it using the existing
  sentence-boundary snapping logic (search ±200 chars for `.!?` + whitespace), keeping
  the same `CHUNK_OVERLAP_TOKENS` overlap. Each sub-chunk should carry the parent
  section's title in metadata plus a sub-index (e.g. `"Q3 Revenue (2/3)"`).
- Never split mid-sentence if avoidable.

### Priority 2 — Paragraph boundaries (fallback when no sections)

If `parsed.sections` is empty or all sections have no title/content, fall back to
**paragraph-aware chunking**:

- Split the full `parsed.text` on double-newlines (`\n\n`) to get paragraphs.
- Accumulate paragraphs into a chunk until the next paragraph would push it over
  `CHUNK_MAX_TOKENS`.
- When a single paragraph exceeds `CHUNK_MAX_TOKENS` on its own, sub-split it with
  sentence-boundary snapping (same as above), with overlap.
- Apply `CHUNK_OVERLAP_TOKENS` overlap between chunks by carrying the last N tokens
  of the previous chunk into the start of the next.

### Priority 3 — Sentence-snapped token chunking (last resort)

Only if the text has no paragraph breaks and no sections — i.e., it's a wall of text —
fall back to the current token-based approach with sentence-boundary snapping. This is
the existing logic, kept as-is for this case.

---

## Additional requirements

1. **Keep the same token estimation function** (`estimateTokens`: `Math.ceil(text.length / 4)`).
   Do not add external tokenizer dependencies.

2. **Keep the same constants** (`CHUNK_TARGET_TOKENS`, `CHUNK_MIN_TOKENS`, `CHUNK_MAX_TOKENS`,
   `CHUNK_OVERLAP_TOKENS`). The new logic uses them the same way, just with different split
   triggers.

3. **Preserve the `DocumentChunk` shape exactly** — same fields, no new required fields.
   `metadata.sectionTitle` should be populated for every chunk that originates from a named
   section.

4. **The infinite-loop guard must stay**: if `nextPosition <= position`, force `position = endPos`.

5. **The fallback single-chunk case must stay**: if no chunks were produced but text exists,
   return a single chunk with the full text.

6. **Do not touch any other method** in the class. Only replace `chunkDocument()`.

7. **Add a Vitest test file** at:
   ```
   packages/ingestion/src/__tests__/chunker.test.ts
   ```

   The tests must cover:
   - A document with sections where one section is within token limits → produces one chunk
     per section, each with the correct `sectionTitle`
   - A document with a section that exceeds `CHUNK_MAX_TOKENS` → sub-splits into multiple
     chunks all carrying the parent section title
   - Two adjacent small sections that get merged → merged chunk title includes both names
   - A document with no sections but paragraph breaks → chunks respect paragraph boundaries
   - A plain wall of text (no sections, no paragraphs) → falls back to sentence-snapping
   - The infinite-loop guard: a chunk position that doesn't advance must not loop forever
   - The fallback single-chunk: a short document returns exactly one chunk

   Use only `vitest` (already installed). Mock nothing — these are pure unit tests on the
   chunking logic. Extract `chunkDocument` as a standalone exported function (or test it
   via a lightweight `IngestionPipeline` instance with a mocked `PrismaClient`) — your
   choice, but the tests must actually run.

   The vitest config already exists at `packages/ingestion/vitest.config.ts` — check it
   before adding the test file to confirm the include pattern.

---

## Summary of files to change

| File | Change |
|------|--------|
| `packages/ingestion/src/pipeline.ts` | Replace `chunkDocument()` method body with the new section-aware strategy |
| `packages/ingestion/src/__tests__/chunker.test.ts` | New test file (create it) |

Do not modify any other file. Do not change the method signature of `chunkDocument()` —
it takes `parsed: ParsedDocument` and returns `DocumentChunk[]`.
