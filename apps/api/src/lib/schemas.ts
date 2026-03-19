// Zod validation schemas for all API boundaries

import { z } from 'zod'

// ─── Sessions ────────────────────────────────────────────────────

export const createSessionSchema = z.object({
  clientId: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  mode: z.enum(['intake', 'product', 'process', 'competitive', 'stakeholder']).optional(),
})

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  mode: z.enum(['intake', 'product', 'process', 'competitive', 'stakeholder']).optional(),
  imageBase64: z.string().optional(),
})

// ─── Clients ─────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().min(1).max(100),
  companySize: z.string().min(1).max(50),
  website: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
  techStack: z.array(z.string()).optional(),
})

export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().min(1).max(100).optional(),
  companySize: z.string().min(1).max(50).optional(),
  website: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
  techStack: z.array(z.string()).optional(),
})

// ─── Stakeholders ────────────────────────────────────────────────

export const createStakeholderSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  influence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  interest: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  department: z.string().max(100).optional(),
  reportsToId: z.string().optional(),
  notes: z.string().max(5000).optional(),
})

// ─── Integrations ────────────────────────────────────────────────

export const googleConnectSchema = z.object({
  provider: z.enum(['GOOGLE_DOCS', 'GOOGLE_SHEETS', 'GMAIL', 'GOOGLE_DRIVE']),
})

// ─── Knowledge ───────────────────────────────────────────────────

export const resolveConflictSchema = z.object({
  resolution: z.enum(['RESOLVED_A', 'RESOLVED_B', 'CUSTOM']),
  customValue: z.string().optional(),
})

// ─── Exports ─────────────────────────────────────────────────────

export const createExportSchema = z.object({
  destination: z.enum(['GDOC', 'GSHEET', 'EMAIL', 'MARKDOWN', 'JSON']),
  title: z.string().min(1).max(200).optional(),
  recipientEmail: z.string().email().optional(),
})

export const distributeSchema = z.object({
  stakeholderIds: z.array(z.string()).min(1),
  format: z.enum(['email', 'gdoc', 'gsheet']),
  subject: z.string().min(1).max(200).optional(),
})
