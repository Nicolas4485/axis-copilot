// Pipeline Worker — runs the ingestion pipeline in a separate process
// to avoid OOM issues from tsx's in-memory TypeScript compilation
//
// This script is COMPILED to JS via `tsc` and run with `node` (no tsx).
// It resolves workspace packages from their compiled dist/ directories.

import { PrismaClient } from '@prisma/client'

// Dynamic imports to resolve from dist/ at runtime
async function run(): Promise<void> {
  // Read input from stdin
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }

  const inputJson = Buffer.concat(chunks).toString('utf-8')
  const input = JSON.parse(inputJson) as {
    fileContent: string // base64
    filename: string
    mimeType: string
    userId: string
    options?: {
      clientId?: string
      sourceType?: string
      sourceId?: string
      sourcePath?: string
    }
  }

  const fileContent = Buffer.from(input.fileContent, 'base64')
  const prisma = new PrismaClient()

  try {
    // Import IngestionPipeline — will resolve from dist/ when compiled
    const { IngestionPipeline } = await import('@axis/ingestion')

    const pipeline = new IngestionPipeline({
      prisma,
      onProgress: (event: { step?: string; message?: string; stepNumber?: number; totalSteps?: number }) => {
        process.stderr.write(JSON.stringify(event) + '\n')
      },
    })

    const result = await pipeline.ingestDocument(
      fileContent,
      input.filename,
      input.mimeType,
      input.userId,
      input.options as { clientId?: string; sourceType?: 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL'; sourceId?: string; sourcePath?: string }
    )

    // Send result to parent via stdout
    process.stdout.write(JSON.stringify(result))
  } finally {
    await prisma.$disconnect()
  }
}

run().catch((err) => {
  process.stderr.write(`Pipeline worker fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
