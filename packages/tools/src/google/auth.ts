// Google OAuth flow — token encryption, storage, and refresh
// Tokens encrypted at rest with AES-256-GCM (per CLAUDE.md)

import { encrypt, decrypt } from '@axis/types'

const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] ?? ''
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
const GOOGLE_REDIRECT_URI = process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:4000/api/integrations/google/callback'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** Token pair from OAuth flow */
export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

/** Encrypted token pair for storage */
export interface EncryptedTokens {
  accessToken: string   // encrypted
  refreshToken: string  // encrypted
  expiresAt: Date
}

/**
 * Generate the Google OAuth consent URL.
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
  }

  const data = await response.json() as { access_token: string; expires_in: number }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Encrypt tokens for database storage.
 */
export function encryptTokens(tokens: GoogleTokens): EncryptedTokens {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
  }
}

/**
 * Decrypt tokens from database storage.
 */
export function decryptTokens(encrypted: EncryptedTokens): GoogleTokens {
  return {
    accessToken: decrypt(encrypted.accessToken),
    refreshToken: decrypt(encrypted.refreshToken),
    expiresAt: encrypted.expiresAt,
  }
}

/**
 * Get a valid access token, refreshing if expired.
 *
 * @param encrypted  - The encrypted token pair from the database.
 * @param onRefresh  - Optional callback invoked with the new encrypted tokens
 *                     after a successful refresh so the caller can persist them.
 */
export async function getValidToken(
  encrypted: EncryptedTokens,
  onRefresh?: (updated: EncryptedTokens) => Promise<void>
): Promise<string> {
  const tokens = decryptTokens(encrypted)

  // Refresh 5 minutes before expiry
  const bufferMs = 5 * 60 * 1000
  if (tokens.expiresAt.getTime() - bufferMs > Date.now()) {
    return tokens.accessToken
  }

  const refreshed = await refreshAccessToken(tokens.refreshToken)

  if (onRefresh) {
    const updated: EncryptedTokens = {
      accessToken: encrypt(refreshed.accessToken),
      refreshToken: encrypted.refreshToken, // refresh token unchanged
      expiresAt: refreshed.expiresAt,
    }
    await onRefresh(updated)
  }

  return refreshed.accessToken
}
