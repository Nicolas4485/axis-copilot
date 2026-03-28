'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Image as ImageIcon, File } from 'lucide-react'

export interface UploadedFile {
  name: string
  type: string
  size: number
  base64: string
  preview?: string
}

interface FileUploadZoneProps {
  onFile: (file: UploadedFile) => void
  onClear: () => void
  currentFile: UploadedFile | null
  disabled?: boolean
  accept?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={16} className="text-[var(--gold)]" />
  if (mimeType === 'application/pdf') return <FileText size={16} className="text-[var(--error)]" />
  if (mimeType.includes('document') || mimeType.includes('word')) return <FileText size={16} className="text-[var(--gold)]" />
  return <File size={16} className="text-[var(--text-muted)]" />
}

export function FileUploadZone({
  onFile,
  onClear,
  currentFile,
  disabled = false,
  accept = 'image/*,.pdf,.doc,.docx,.txt,.md',
}: FileUploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      const uploaded: UploadedFile = {
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
        ...(file.type.startsWith('image/') ? { preview: result } : {}),
      }
      onFile(uploaded)
    }
    reader.readAsDataURL(file)
  }, [onFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [disabled, processFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback(() => setDragging(false), [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [processFile])

  // Compact display when file already selected
  if (currentFile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border)]">
        {currentFile.preview ? (
          <img
            src={currentFile.preview}
            alt={currentFile.name}
            className="h-8 w-8 object-cover rounded-lg border border-[var(--border)] shrink-0"
          />
        ) : (
          <div className="h-8 w-8 flex items-center justify-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] shrink-0">
            <FileIcon mimeType={currentFile.type} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--text-primary)] truncate">{currentFile.name}</p>
          <p className="text-xs text-[var(--text-muted)]">{formatBytes(currentFile.size)}</p>
        </div>
        <button
          onClick={onClear}
          disabled={disabled}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 shrink-0"
          title="Remove file"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
        dragging
          ? 'border-[var(--gold)] bg-[var(--gold)]/5'
          : disabled
          ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
          : 'border-[var(--border)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Upload size={18} className={dragging ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'} />
      <div className="text-center">
        <p className="text-xs text-[var(--text-secondary)]">
          {dragging ? 'Drop to upload' : 'Drop a file or click to browse'}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Images, PDFs, Word docs, text files
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
    </div>
  )
}
