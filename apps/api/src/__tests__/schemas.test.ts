import { describe, it, expect } from 'vitest'
import {
  createSessionSchema,
  sendMessageSchema,
  createClientSchema,
  updateClientSchema,
  createStakeholderSchema,
  createExportSchema,
  resolveConflictSchema,
} from '../lib/schemas.js'

describe('createSessionSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(createSessionSchema.safeParse({}).success).toBe(true)
  })

  it('accepts valid mode values', () => {
    const modes = ['intake', 'product', 'process', 'competitive', 'stakeholder'] as const
    for (const mode of modes) {
      expect(createSessionSchema.safeParse({ mode }).success).toBe(true)
    }
  })

  it('rejects unknown mode', () => {
    expect(createSessionSchema.safeParse({ mode: 'unknown' }).success).toBe(false)
  })

  it('accepts title up to 200 chars', () => {
    expect(createSessionSchema.safeParse({ title: 'A'.repeat(200) }).success).toBe(true)
    expect(createSessionSchema.safeParse({ title: 'A'.repeat(201) }).success).toBe(false)
  })

  it('rejects empty title', () => {
    expect(createSessionSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

describe('sendMessageSchema', () => {
  it('accepts valid content', () => {
    expect(sendMessageSchema.safeParse({ content: 'Hello AXIS' }).success).toBe(true)
  })

  it('rejects empty content', () => {
    expect(sendMessageSchema.safeParse({ content: '' }).success).toBe(false)
  })

  it('rejects content over 50000 chars', () => {
    expect(sendMessageSchema.safeParse({ content: 'a'.repeat(50001) }).success).toBe(false)
  })

  it('accepts optional imageBase64 and mode', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Analyse this',
      mode: 'product',
      imageBase64: 'base64data',
    })
    expect(result.success).toBe(true)
  })
})

describe('createClientSchema', () => {
  const valid = {
    name: 'Acme Corp',
    industry: 'Technology',
    companySize: '50-200',
  }

  it('accepts valid client', () => {
    expect(createClientSchema.safeParse(valid).success).toBe(true)
  })

  it('requires name, industry, companySize', () => {
    expect(createClientSchema.safeParse({ industry: 'Tech', companySize: '10' }).success).toBe(false)
    expect(createClientSchema.safeParse({ name: 'Acme', companySize: '10' }).success).toBe(false)
    expect(createClientSchema.safeParse({ name: 'Acme', industry: 'Tech' }).success).toBe(false)
  })

  it('validates website as URL when provided', () => {
    expect(createClientSchema.safeParse({ ...valid, website: 'https://acme.com' }).success).toBe(true)
    expect(createClientSchema.safeParse({ ...valid, website: 'not-a-url' }).success).toBe(false)
  })

  it('accepts techStack as array of strings', () => {
    expect(createClientSchema.safeParse({ ...valid, techStack: ['React', 'Node.js'] }).success).toBe(true)
  })

  it('rejects notes over 5000 chars', () => {
    expect(createClientSchema.safeParse({ ...valid, notes: 'a'.repeat(5001) }).success).toBe(false)
  })
})

describe('updateClientSchema', () => {
  it('accepts partial updates', () => {
    expect(updateClientSchema.safeParse({ name: 'New Name' }).success).toBe(true)
    expect(updateClientSchema.safeParse({ industry: 'Finance' }).success).toBe(true)
    expect(updateClientSchema.safeParse({}).success).toBe(true)
  })
})

describe('createStakeholderSchema', () => {
  const valid = {
    name: 'Jane Smith',
    role: 'CTO',
    influence: 'HIGH',
    interest: 'MEDIUM',
  }

  it('accepts valid stakeholder', () => {
    expect(createStakeholderSchema.safeParse(valid).success).toBe(true)
  })

  it('requires name, role, influence, interest', () => {
    expect(createStakeholderSchema.safeParse({ role: 'CTO', influence: 'HIGH', interest: 'LOW' }).success).toBe(false)
  })

  it('validates influence and interest enums', () => {
    expect(createStakeholderSchema.safeParse({ ...valid, influence: 'EXTREME' }).success).toBe(false)
    expect(createStakeholderSchema.safeParse({ ...valid, interest: 'NONE' }).success).toBe(false)
  })

  it('validates email format when provided', () => {
    expect(createStakeholderSchema.safeParse({ ...valid, email: 'jane@example.com' }).success).toBe(true)
    expect(createStakeholderSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })
})

describe('createExportSchema', () => {
  it('accepts all valid destinations', () => {
    const destinations = ['GDOC', 'GSHEET', 'EMAIL', 'MARKDOWN', 'JSON'] as const
    for (const destination of destinations) {
      expect(createExportSchema.safeParse({ destination }).success).toBe(true)
    }
  })

  it('rejects unknown destination', () => {
    expect(createExportSchema.safeParse({ destination: 'PDF' }).success).toBe(false)
    expect(createExportSchema.safeParse({ destination: 'WORD' }).success).toBe(false)
  })

  it('validates recipientEmail when provided', () => {
    expect(createExportSchema.safeParse({ destination: 'EMAIL', recipientEmail: 'user@example.com' }).success).toBe(true)
    expect(createExportSchema.safeParse({ destination: 'EMAIL', recipientEmail: 'not-an-email' }).success).toBe(false)
  })
})

describe('resolveConflictSchema', () => {
  it('accepts valid resolutions', () => {
    expect(resolveConflictSchema.safeParse({ resolution: 'RESOLVED_A' }).success).toBe(true)
    expect(resolveConflictSchema.safeParse({ resolution: 'RESOLVED_B' }).success).toBe(true)
    expect(resolveConflictSchema.safeParse({ resolution: 'CUSTOM', customValue: 'my value' }).success).toBe(true)
  })

  it('rejects unknown resolution', () => {
    expect(resolveConflictSchema.safeParse({ resolution: 'IGNORE' }).success).toBe(false)
  })
})
