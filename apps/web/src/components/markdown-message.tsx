'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { MermaidBlock } from './mermaid-block'

const HIGHLIGHT_STYLE: Record<string, React.CSSProperties> = {
  ...oneDark as Record<string, React.CSSProperties>,
}

const SX_CUSTOM: React.CSSProperties = {
  background:   'var(--bg-tertiary)',
  borderRadius: '10px',
  border:       '1px solid var(--border)',
  fontSize:     '12px',
  margin:       '0.5em 0',
  padding:      '12px 16px',
}

const components: Components = {
  // Unwrap the default <pre> — our code handler provides its own container
  pre({ node: _n, children }) {
    return <>{children}</>
  },

  code({ node: _n, className, children }) {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
    const code = String(children).replace(/\n$/, '')

    if (lang === 'mermaid') return <MermaidBlock code={code} />

    if (lang) {
      return (
        <SyntaxHighlighter
          language={lang}
          style={HIGHLIGHT_STYLE}
          customStyle={SX_CUSTOM}
          PreTag="div"
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      )
    }

    return <code className="inline-code">{children}</code>
  },

  a({ node: _n, href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },

  table({ node: _n, children }) {
    return (
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
    )
  },
}

interface MarkdownMessageProps {
  content:    string
  streaming?: boolean
}

export function MarkdownMessage({ content, streaming }: MarkdownMessageProps) {
  return (
    <div className={`prose-axis${streaming ? ' streaming-cursor' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
