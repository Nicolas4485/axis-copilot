'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

export default function RegisterPage() {
  const router = useRouter()
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ name, email }),
      })
      const data = await res.json() as { user?: { id: string }; error?: string; code?: string }
      if (!res.ok) {
        if (data.code === 'USER_EXISTS') {
          setError('An account with this email already exists. Sign in instead.')
        } else {
          setError(data.error ?? 'Registration failed. Please try again.')
        }
        return
      }
      router.replace('/')
    } catch {
      setError('Network error. Check that the API is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #0a0a0a)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          margin: '0 auto',
          padding: '40px 32px',
          background: 'var(--bg-secondary, #111)',
          border: '1px solid var(--border, rgba(255,255,255,0.08))',
          borderRadius: 16,
        }}
      >
        {/* Wordmark */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-primary, #fff)',
              margin: 0,
            }}
          >
            AXIS
          </p>
          <p
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 13,
              color: 'var(--text-muted, rgba(255,255,255,0.45))',
              marginTop: 6,
            }}
          >
            Create your account
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: '10px 14px',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              borderRadius: 8,
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--error)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e) }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="name"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted, rgba(255,255,255,0.5))',
                marginBottom: 6,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Chen"
              required
              autoComplete="name"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 8,
                color: 'var(--text-primary, #fff)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted, rgba(255,255,255,0.5))',
                marginBottom: 6,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Work Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. alex@firm.com"
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 8,
                color: 'var(--text-primary, #fff)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim() || !email.trim()}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: loading || !name.trim() || !email.trim()
                ? 'rgba(200,121,65,0.3)'
                : 'var(--gold, #C87941)',
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !name.trim() || !email.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 150ms',
              marginTop: 4,
            }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p
          style={{
            marginTop: 24,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-muted, rgba(255,255,255,0.3))',
          }}
        >
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--gold, #C87941)', textDecoration: 'underline' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
