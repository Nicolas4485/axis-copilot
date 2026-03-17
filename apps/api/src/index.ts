import express from 'express'
import helmet from 'helmet'
import cors from 'cors'

import { injectRequestId, authenticate, generalRateLimit } from './middleware/auth.js'
import { healthHandler } from './routes/health.js'
import { sessionsRouter } from './routes/sessions.js'
import { clientsRouter } from './routes/clients.js'
import { integrationsRouter } from './routes/integrations.js'
import { knowledgeRouter } from './routes/knowledge.js'
import { exportsRouter } from './routes/exports.js'
import { costRouter } from './routes/cost.js'

const app = express()
const PORT = process.env['PORT'] ?? 4000

// ─── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(injectRequestId)

// ─── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler)

// OAuth callback is public — no JWT required
app.use('/api/integrations', integrationsRouter)

// ─── Protected routes (JWT + rate limit) ──────────────────────────────────────
app.use('/api', authenticate, generalRateLimit)

app.use('/api/sessions', sessionsRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/exports', exportsRouter)
app.use('/api/cost', costRouter)

// ─── 404 fallthrough ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
})

app.listen(PORT, () => {
  console.log(`AXIS API running on http://localhost:${PORT}`)
})
