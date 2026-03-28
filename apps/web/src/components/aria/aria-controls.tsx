'use client'

// AriaControls — mic, camera, screen share, and connection controls

import { Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, PhoneOff, Wifi, WifiOff } from 'lucide-react'

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
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--gold)] text-black font-mono text-sm hover:opacity-90 transition-opacity"
      >
        <Wifi className="w-4 h-4" />
        Talk to Aria
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Mic toggle */}
      <button
        onClick={onToggleMic}
        className={`p-2 rounded-lg transition-colors ${
          isMicOn
            ? 'bg-[var(--gold)] text-black'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
      </button>

      {/* Camera toggle */}
      <button
        onClick={onToggleCamera}
        className={`p-2 rounded-lg transition-colors ${
          isCameraOn
            ? 'bg-blue-500 text-white'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
      </button>

      {/* Screen share toggle */}
      <button
        onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
        className={`p-2 rounded-lg transition-colors ${
          isScreenSharing
            ? 'bg-emerald-500 text-white'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
      >
        {isScreenSharing ? <Monitor className="w-4 h-4" /> : <MonitorOff className="w-4 h-4" />}
      </button>

      {/* Disconnect */}
      <button
        onClick={onDisconnect}
        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        title="End live session"
      >
        <PhoneOff className="w-4 h-4" />
      </button>

      {/* Connection indicator */}
      <div className="flex items-center gap-1 text-xs text-emerald-400 font-mono ml-2">
        <WifiOff className="w-3 h-3 hidden" />
        <Wifi className="w-3 h-3" />
        <span>Live</span>
      </div>
    </div>
  )
}
