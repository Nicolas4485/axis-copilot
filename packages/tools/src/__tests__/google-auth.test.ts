import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAuthUrl, encryptTokens, decryptTokens, getValidToken } from '../google/auth.js'
import type { GoogleTokens, EncryptedTokens } from '../google/auth.js'

// Stub the @axis/types encrypt/decrypt with deterministic implementations for tests
vi.mock('@axis/types', () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ''),
  Result: undefined,
}))

describe('getAuthUrl', () => {
  // Note: GOOGLE_CLIENT_ID is a module-level constant captured at import time,
  // so process.env changes after import won't affect it. We test URL structure instead.

  it('returns a Google OAuth URL with correct base and parameters', () => {
    const url = getAuthUrl('my-state-token')
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(url).toContain('state=my-state-token')
    expect(url).toContain('client_id=')
    expect(url).toContain('response_type=code')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
  })

  it('includes all required Google scopes', () => {
    const url = getAuthUrl('state')
    expect(decodeURIComponent(url)).toContain('auth/drive.readonly')
    expect(decodeURIComponent(url)).toContain('auth/documents')
    expect(decodeURIComponent(url)).toContain('auth/spreadsheets')
    expect(decodeURIComponent(url)).toContain('auth/gmail.compose')
  })

  it('encodes state parameter correctly', () => {
    const url = getAuthUrl('state with spaces & special=chars')
    expect(url).toContain('state=')
    // Spaces should be URL-encoded (as + or %20)
    expect(url).not.toContain('state=state with spaces')
  })

  it('returns a valid URL', () => {
    const url = getAuthUrl('test-state')
    expect(() => new URL(url)).not.toThrow()
  })
})

describe('encryptTokens / decryptTokens', () => {
  const tokens: GoogleTokens = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    expiresAt: new Date('2025-01-01T00:00:00Z'),
  }

  it('encrypts accessToken and refreshToken', () => {
    const encrypted = encryptTokens(tokens)
    expect(encrypted.accessToken).toBe('enc:access-token-123')
    expect(encrypted.refreshToken).toBe('enc:refresh-token-456')
    expect(encrypted.expiresAt).toEqual(tokens.expiresAt)
  })

  it('decrypts back to original tokens', () => {
    const encrypted = encryptTokens(tokens)
    const decrypted = decryptTokens(encrypted)
    expect(decrypted.accessToken).toBe(tokens.accessToken)
    expect(decrypted.refreshToken).toBe(tokens.refreshToken)
    expect(decrypted.expiresAt).toEqual(tokens.expiresAt)
  })

  it('round-trip is lossless', () => {
    const rt = decryptTokens(encryptTokens(tokens))
    expect(rt).toEqual(tokens)
  })
})

describe('getValidToken', () => {
  it('returns the decrypted access token when not expired', async () => {
    const encrypted: EncryptedTokens = {
      accessToken: 'enc:valid-access-token',
      refreshToken: 'enc:refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    }

    const token = await getValidToken(encrypted)
    expect(token).toBe('valid-access-token')
  })

  it('calls onRefresh callback with updated encrypted tokens when token is expired', async () => {
    const expiredEncrypted: EncryptedTokens = {
      accessToken: 'enc:old-access-token',
      refreshToken: 'enc:my-refresh-token',
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    }

    // Mock the token refresh HTTP call
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const token = await getValidToken(expiredEncrypted, onRefresh)

    expect(token).toBe('new-access-token')
    expect(onRefresh).toHaveBeenCalledOnce()

    const [updatedTokens] = onRefresh.mock.calls[0] as [EncryptedTokens]
    // The new access token should be encrypted
    expect(updatedTokens.accessToken).toBe('enc:new-access-token')
    // Refresh token should be unchanged
    expect(updatedTokens.refreshToken).toBe('enc:my-refresh-token')

    vi.unstubAllGlobals()
  })

  it('throws when refresh fails', async () => {
    const expiredEncrypted: EncryptedTokens = {
      accessToken: 'enc:old-token',
      refreshToken: 'enc:bad-refresh',
      expiresAt: new Date(0), // epoch — definitely expired
    }

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid_grant',
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(getValidToken(expiredEncrypted)).rejects.toThrow('Token refresh failed')

    vi.unstubAllGlobals()
  })
})
