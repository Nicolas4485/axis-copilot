'use client'

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInit = false

export function MermaidBlock({ code }: { code: string }) {
  const idRef  = useRef(`mmd-${Math.random().toString(36).slice(2)}`)
  const [svg,  setSvg]   = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!mermaidInit) {
      // Read live design-token values off the <html> element so the Mermaid
      // diagram tracks light/dark mode instead of being frozen to one palette.
      const styles = getComputedStyle(document.documentElement)
      const t = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback

      const accent    = t('--gold',         '#0B2545')
      const accentMid = t('--gold-dim',     '#0F2E5A')
      const textInk   = t('--text-primary', '#0F1115')
      const surface   = t('--bg-secondary', '#FFFFFF')
      const paper     = t('--bg-primary',   '#F6F6F3')
      const tertiary  = t('--bg-tertiary',  '#FAFAF8')
      const border    = t('--border',       'rgba(11,37,69,0.10)')

      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
        fontSize: 14,
        themeVariables: {
          primaryColor:       accent,
          primaryTextColor:   '#FFFFFF',
          primaryBorderColor: accentMid,
          lineColor:          accent,
          secondaryColor:     surface,
          tertiaryColor:      tertiary,
          background:         paper,
          mainBkg:            surface,
          nodeBorder:         border,
          clusterBkg:         tertiary,
          titleColor:         accent,
          edgeLabelBackground: surface,
          textColor:          textInk,
          labelTextColor:     textInk,
        },
      })
      mermaidInit = true
    }

    let cancelled = false
    mermaid.render(idRef.current, code)
      .then(({ svg: s }) => { if (!cancelled) setSvg(s) })
      .catch(() => { if (!cancelled) setError(true) })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <pre className="text-[var(--error)] text-xs p-3 my-2 bg-[var(--bg-tertiary)] rounded-xl
                      border border-[var(--error)]/20 font-mono overflow-x-auto leading-relaxed">
        {code}
      </pre>
    )
  }

  if (!svg) {
    return (
      <div className="h-24 my-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] skeleton" />
    )
  }

  return (
    <div
      className="rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)]
                 overflow-x-auto p-4 my-2 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
