// AES-256-GCM encryption utility.
// SERVER-SIDE ONLY — uses Node.js crypto, not safe for browser bundles.
// Import directly: import { encrypt, decrypt } from '@axis/types/src/encryption.js'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY']
  if (!hex) {
    throw new Error('ENCRYPTION_KEY env var is required — set a 64-character hex string')
  }
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)')
  }
  return buf
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a base64-encoded string containing: iv (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * Decrypt a base64 string produced by `encrypt`.
 * Throws if the auth tag is invalid (tampered data).
 */
export function decrypt(encrypted: string): string {
  const key = getKey()
  const buf = Buffer.from(encrypted, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
