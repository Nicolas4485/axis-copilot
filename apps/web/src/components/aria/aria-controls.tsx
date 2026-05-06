'use client'

// AriaControls — mic, camera, screen share, and connection controls for live sessions

import { Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, PhoneOff, Wifi } from 'lucide-react'

interface AriaControlsProps {
  isConnected: boolean
  isMicOn: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  onConnect: () => void
  onDisconnect: () => void
  onToggleMic: () => void
  onToggleCamera: () => void
  onStartScreenShare: () => void
  onStopScreenShare: () => void
}

export function AriaControls({
  isConnected,
  isMicOn,
  isCameraOn,
  isScreenSharing,
  onConnect,
  onDisconnect,
  onToggleMic,
  onToggleCamera,
  onStartScreenShare,
  onStopScreenShare,
}: AriaControlsProps) {
  if (!isConnected) {
    return (
      <button
        onClick={onConnect}
        aria-label="Start live session with Aria"
        className="flex items-center gap-2 px-5 py-2 rounded-full
                   bg-[var(--gold)] text-[var(--bg-primary)] font-mono text-sm font-medium
                   hover:bg-[var(--gold-dim)] transition-all duration-200"
        style={{ boxShadow: '0 0 16px rgba(200,169,110,0.2)' }}
      >
        <Wifi className="w-3.5 h-3.5" />
        Connect
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Mic toggle */}
      <ControlButton
        onClick={onToggleMic}
        active={isMicOn}
        activeClass="bg-[var(--gold)] text-[var(--bg-primary)]"
        label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
      </ControlButton>

      {/* Camera toggle */}
      <ControlButton
        onClick={onToggleCamera}
        active={isCameraOn}
        activeClass="bg-blue-500/80 text-white"
        label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
      </ControlButton>

      {/* Screen share toggle */}
      <ControlButton
        onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
        active={isScreenSharing}
        activeClass="bg-emerald-500/80 text-white"
        label={isScreenSharing ? 'Stop screen share' : 'Share screen'}
      >
        {isScreenSharing ? <Monitor className="w-3.5 h-3.5" /> : <MonitorOff className="w-3.5 h-3.5" />}
      </ControlButton>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--border)]" />

      {/* Disconnect */}
      <button
        onClick={onDisconnect}
        aria-label="End live session"
        className="p-2 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
      >
        <PhoneOff className="w-3.5 h-3.5" />
      </button>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-full
                      bg-emerald-500/10 border border-emerald-500/20">
        <span className="live-dot" />
        <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">Live</span>
      </div>
    </div>
  )
}

/* ── Internal helpers ────────────────────────────────────────────────────── */

function ControlButton({
  children,
  onClick,
  active,
  activeClass,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  activeClass: string
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`p-2 rounded-full transition-all duration-200 ${
        active
          ? activeClass
          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {children}
    </button>
  )
}
