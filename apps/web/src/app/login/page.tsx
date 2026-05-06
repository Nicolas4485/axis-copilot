'use client'

// Login page — cookie-based auth.
//
// On mount: GET /api/auth/me to check if cookie session is valid → redirect to / if so.
//
// Dev mode (NODE_ENV=development):
//   POST /api/auth/login → server sets httpOnly cookie, returns { user } → redirect to /
//
// Production mode:
//   POST /api/auth/login → returns { authUrl } → redirect to Google OAuth
//   Google callback sets httpOnly cookie, redirects to / (no token in URL)

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthContext } from '@/lib/providers'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

/* ── Hero stats shown on the left panel ─────────────────────────────────── */
const STATS = [
  { value: '13',   label: 'IC memo sections' },
  { value: '95%',  label: 'Extraction accuracy' },
  { value: '5',    label: 'Specialist agents' },
  { value: '< 3m', label: 'CIM to IC memo' },
]

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()

  const [status,   setStatus]   = useState<'loading' | 'google' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [authUrl,  setAuthUrl]  = useState<string | null>(null)

  // Handle OAuth error param (?error=...)
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      setErrorMsg(`Login failed: ${error.replace(/_/g, ' ')}`)
      setStatus('error')
    }
  }, [searchParams])

  // Redirect if already authenticated (shared auth cache — no extra /api/auth/me call)
  useEffect(() => {
    if (authLoading || searchParams.get('error')) return
    if (isAuthenticated) { router.replace('/'); return }

    fetch(`${API_BASE}/api/auth/login`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const data = await res.json() as { user?: { id: string }; authUrl?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
        if (data.user)    { window.location.href = '/'; return }
        if (data.authUrl) { setAuthUrl(data.authUrl); setStatus('google'); return }
        throw new Error('Unexpected login response')
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not reach server')
        setStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  function handleGoogleLogin() {
    if (authUrl) {
      window.location.href = authUrl
      return
    }
    setStatus('loading'); setErrorMsg(null)
    fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const data = await res.json() as { user?: { id: string }; authUrl?: string; error?: string }
        if (data.user)    { window.location.href = '/'; return }
        if (data.authUrl) { window.location.href = data.authUrl; return }
        throw new Error(data.error ?? 'Login failed')
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Login failed')
        setStatus('error')
      })
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg)',
    }}>
      {/* ── Left panel — navy hero ─────────────────────────────────────── */}
      <div style={{
        flex: '0 0 480px',
        background: 'var(--accent)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle grid texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Brand lockup */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
              display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: '.06em',
            }}>A</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '.18em', color: '#fff' }}>AXIS</div>
              <div style={{ fontSize: 10, letterSpacing: '.20em', color: 'rgba(255,255,255,0.50)', marginTop: 2, fontWeight: 500 }}>CO·PILOT</div>
            </div>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-playfair), ui-serif, serif',
            fontSize: 36,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.2,
            marginBottom: 16,
            letterSpacing: '-0.01em',
          }}>
            PE intelligence,<br />at deal speed.
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, maxWidth: 340 }}>
            Agentic AI that reads CIMs, builds IC memos, surfaces conflicts, and never misses a red flag.
          </p>
        </div>

        {/* Stats grid */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginBottom: 40,
          }}>
            {STATS.map((s) => (
              <div key={s.label} style={{
                padding: '16px 18px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 10,
              }}>
                <div style={{
                  fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
                  fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em',
                }}>{s.value}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.50)', marginTop: 4, letterSpacing: '.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', letterSpacing: '.02em' }}>
            Trusted for Riverside Partners · Demo Corp · NorthStar Software
          </p>
        </div>
      </div>

      {/* ── Right panel — sign-in form ────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        background: 'var(--bg)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Wordmark */}
          <div style={{ marginBottom: 36 }}>
            <p style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'var(--accent)',
              margin: 0,
            }}>AXIS</p>
            <p style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 13,
              color: 'var(--ink-3)',
              marginTop: 6,
              marginBottom: 0,
            }}>Sign in to your workspace</p>
          </div>

          {/* Error banner */}
          {errorMsg && (
            <div style={{
              marginBottom: 20,
              padding: '10px 14px',
              background: 'var(--bad-soft)',
              border: '1px solid var(--bad-b)',
              borderRadius: 8,
            }}>
              <p style={{ fontSize: 13, color: 'var(--bad)', margin: 0 }}>{errorMsg}</p>
              {errorMsg.includes('reach server') && (
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, marginBottom: 0 }}>
                  Make sure the API is running: <code style={{ fontFamily: 'monospace' }}>pnpm dev</code>
                </p>
              )}
            </div>
          )}

          {/* Loading spinner */}
          {status === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: '2px solid var(--line)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.7s linear infinite',
              }} />
              <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Signing you in…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Google SSO */}
          {status === 'google' && (
            <button
              onClick={handleGoogleLogin}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '12px 20px', borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                color: 'var(--ink)', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', boxShadow: 'var(--shadow-1)',
                transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-hover)'
                e.currentTarget.style.borderColor = 'var(--line-strong)'
                e.currentTarget.style.boxShadow = 'var(--shadow-2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--surface)'
                e.currentTarget.style.borderColor = 'var(--line)'
                e.currentTarget.style.boxShadow = 'var(--shadow-1)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          )}

          {/* Error retry */}
          {status === 'error' && (
            <button
              onClick={() => { setStatus('loading'); setErrorMsg(null); window.location.reload() }}
              style={{
                width: '100%', padding: '12px 20px', borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--surface)', color: 'var(--ink-2)',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Try again
            </button>
          )}

          {/* Footer */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 8 }}>
              Your data is encrypted at rest and never shared.
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: 0 }}>
              New here?{' '}
              <Link href="/register" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Responsive: stack vertically on small screens ── */}
      <style>{`
        @media (max-width: 767px) {
          .login-hero { display: none !important; }
        }
      `}</style>
    </div>
  )
}
