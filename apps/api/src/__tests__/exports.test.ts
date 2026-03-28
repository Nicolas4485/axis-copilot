import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { exportsRouter } from '../routes/exports.js'

// ─── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    exportRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    integration: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@axis/tools', () => ({
  google: {
    getValidToken: vi.fn(),
    createDocument: vi.fn(),
    appendText: vi.fn(),
    createSpreadsheet: vi.fn(),
    writeRange: vi.fn(),
    formatSheet: vi.fn(),
    sendEmail: vi.fn(),
  },
}))

vi.mock('pdfkit', () => {
  const EventEmitter = require('events')
  return {
    default: class MockPDFDocument extends EventEmitter {
      fontSize = vi.fn().mockReturnThis()
      font = vi.fn().mockReturnThis()
      fillColor = vi.fn().mockReturnThis()
      text = vi.fn().mockReturnThis()
      moveDown = vi.fn().mockReturnThis()
      moveTo = vi.fn().mockReturnThis()
      lineTo = vi.fn().mockReturnThis()
      strokeColor = vi.fn().mockReturnThis()
      stroke = vi.fn().mockReturnThis()
      pipe = vi.fn()
      end = vi.fn(() => { this.emit('end') })
      y = 100
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { google } from '@axis/tools'

// ─── Test app setup ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express()
  app.use(express.json())

  // Inject auth context that the routes expect
  app.use((req, _res, next) => {
    req.userId = 'user-test-123'
    req.requestId = 'req-test-456'
    next()
  })

  app.use('/api/exports', exportsRouter)
  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const mockSession = {
  id: 'session-1',
  title: 'Test Session',
  mode: 'intake',
  status: 'ACTIVE',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:30:00Z'),
  userId: 'user-test-123',
  clientId: null,
  client: null,
  messages: [
    { id: 'msg-1', role: 'USER', content: 'Hello AXIS', createdAt: new Date('2024-01-15T10:00:00Z'), mode: 'intake' },
    { id: 'msg-2', role: 'ASSISTANT', content: 'Hello! How can I help?', createdAt: new Date('2024-01-15T10:01:00Z'), mode: 'intake' },
  ],
}

const mockExportRecord = {
  id: 'export-1',
  sessionId: 'session-1',
  destination: 'MARKDOWN',
  externalId: null,
  externalUrl: null,
  createdAt: new Date(),
}

describe('POST /api/exports/:sessionId', () => {
  const app = buildApp()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as unknown as never)
    vi.mocked(prisma.exportRecord.create).mockResolvedValue(mockExportRecord as unknown as never)
    vi.mocked(prisma.session.update).mockResolvedValue(mockSession as unknown as never)
  })

  it('returns 400 on missing destination', async () => {
    const res = await request(app).post('/api/exports/session-1').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 on invalid destination', async () => {
    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'WORD' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when session not found', async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue(null)
    const res = await request(app)
      .post('/api/exports/nonexistent')
      .send({ destination: 'MARKDOWN' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns markdown content for MARKDOWN destination', async () => {
    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'MARKDOWN' })

    expect(res.status).toBe(200)
    expect(res.body.destination).toBe('MARKDOWN')
    expect(typeof res.body.content).toBe('string')
    expect(res.body.content).toContain('Test Session')
    expect(res.body.content).toContain('Hello AXIS')
  })

  it('returns structured JSON for JSON destination', async () => {
    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'JSON' })

    expect(res.status).toBe(200)
    expect(res.body.destination).toBe('JSON')
    expect(res.body.content.session.id).toBe('session-1')
    expect(res.body.content.messages).toHaveLength(2)
  })

  it('returns 400 for EMAIL destination without recipientEmail', async () => {
    // Mock Google integration exists
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: 'int-1',
      userId: 'user-test-123',
      provider: 'GMAIL',
      accessToken: 'enc:token',
      refreshToken: 'enc:refresh',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    } as unknown as never)

    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'EMAIL' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_EMAIL')
  })

  it('creates Google Doc and returns external URL for GDOC destination', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: 'int-1',
      provider: 'GOOGLE_DOCS',
      accessToken: 'enc:token',
      refreshToken: 'enc:refresh',
      expiresAt: new Date(Date.now() + 3600000),
      userId: 'user-test-123',
      createdAt: new Date(),
    } as unknown as never)
    vi.mocked(google.getValidToken).mockResolvedValue('valid-access-token')
    vi.mocked(google.createDocument).mockResolvedValue({
      documentId: 'doc-123',
      title: 'Test Session',
      revisionId: 'rev-1',
    })
    vi.mocked(google.appendText).mockResolvedValue(undefined)
    vi.mocked(prisma.exportRecord.create).mockResolvedValue({ ...mockExportRecord, destination: 'GDOC', externalId: 'doc-123', externalUrl: 'https://docs.google.com/document/d/doc-123' } as unknown as never)

    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'GDOC', title: 'My Export' })

    expect(res.status).toBe(200)
    expect(res.body.externalId).toBe('doc-123')
    expect(res.body.externalUrl).toContain('docs.google.com')
    expect(google.createDocument).toHaveBeenCalledWith('valid-access-token', 'My Export')
    expect(google.appendText).toHaveBeenCalledWith('valid-access-token', 'doc-123', expect.any(String))
  })

  it('returns 400 when Google is not connected for GDOC export', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(null)

    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'GDOC' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('GOOGLE_NOT_CONNECTED')
  })

  it('creates Google Sheet for GSHEET destination', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: 'int-1',
      provider: 'GOOGLE_SHEETS',
      accessToken: 'enc:token',
      refreshToken: 'enc:refresh',
      expiresAt: new Date(Date.now() + 3600000),
      userId: 'user-test-123',
      createdAt: new Date(),
    } as unknown as never)
    vi.mocked(google.getValidToken).mockResolvedValue('valid-token')
    vi.mocked(google.createSpreadsheet).mockResolvedValue({
      spreadsheetId: 'sheet-456',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-456',
      title: 'Test Session',
    })
    vi.mocked(google.writeRange).mockResolvedValue({ updatedCells: 6 })
    vi.mocked(google.formatSheet).mockResolvedValue(undefined)

    const res = await request(app)
      .post('/api/exports/session-1')
      .send({ destination: 'GSHEET' })

    expect(res.status).toBe(200)
    expect(google.createSpreadsheet).toHaveBeenCalled()
    expect(google.writeRange).toHaveBeenCalled()
    // Header row + 2 messages = 3 rows
    const [, , , rows] = vi.mocked(google.writeRange).mock.calls[0]!
    expect(rows).toHaveLength(3) // header + 2 messages
    expect(rows[0]).toEqual(['Timestamp', 'Role', 'Mode', 'Content'])
  })
})

describe('GET /api/exports/:sessionId', () => {
  const app = buildApp()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as unknown as never)
  })

  it('returns list of exports for a session', async () => {
    vi.mocked(prisma.exportRecord.findMany).mockResolvedValue([
      mockExportRecord,
    ] as unknown as never)

    const res = await request(app).get('/api/exports/session-1')
    expect(res.status).toBe(200)
    expect(res.body.exports).toHaveLength(1)
    expect(res.body.exports[0].destination).toBe('MARKDOWN')
  })

  it('returns 404 when session not found', async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue(null)
    const res = await request(app).get('/api/exports/nonexistent')
    expect(res.status).toBe(404)
  })
})
