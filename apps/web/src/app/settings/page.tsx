'use client'

import { useState } from 'react'
import { ModelConfig } from '@/components/settings/model-config'
import { WorkspaceSettings } from '@/components/settings/workspace-settings'
import { ApiKeyManager } from '@/components/settings/api-keys'
import { TeamSettings } from '@/components/settings/team-settings'
import { AriaVoiceSettings } from '@/components/settings/aria-voice-settings'
import { PitchDeckTemplateSettings } from '@/components/settings/pitch-deck-template'
import { Cpu, Plug, Key, Users, Volume2, Presentation } from 'lucide-react'

type SettingsTab = 'model' | 'workspace' | 'api-keys' | 'team' | 'voice' | 'pitch-deck'

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'model',      label: 'Model',          icon: Cpu,          desc: 'Temperature, routing, caching' },
  { id: 'voice',      label: 'Aria Voice',     icon: Volume2,      desc: 'Pick your preferred voice' },
  { id: 'workspace',  label: 'Workspace',      icon: Plug,         desc: 'Google Drive & Gmail' },
  { id: 'pitch-deck', label: 'Pitch Deck',     icon: Presentation, desc: 'Upload your brand template' },
  { id: 'api-keys',   label: 'API Keys',       icon: Key,          desc: 'Programmatic access' },
  { id: 'team',       label: 'Organisation',   icon: Users,        desc: 'Team name & webhooks' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model')

  return (
    <div className="flex h-screen">
      {/* Settings sidebar */}
      <aside className="w-56 shrink-0 border-r border-[var(--border)] p-3">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider px-3 py-2">Settings</p>
        <nav className="space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{tab.label}</p>
                  <p className="text-xs text-[var(--text-muted)] leading-tight">{tab.desc}</p>
                </div>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          {activeTab === 'model' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">Model Configuration</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Control how AXIS routes tasks between local and cloud models.
              </p>
              <ModelConfig />
            </>
          )}

          {activeTab === 'voice' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">Aria Voice</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Choose the voice Aria uses in live sessions. Your preference is saved to your profile and applied automatically on every new session.
              </p>
              <AriaVoiceSettings />
            </>
          )}

          {activeTab === 'workspace' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">Google Workspace</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Connect Drive and Gmail to enable document ingestion and email analysis.
              </p>
              <WorkspaceSettings />
            </>
          )}

          {activeTab === 'api-keys' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">API Keys</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Create and manage keys for programmatic access to the AXIS API.
              </p>
              <ApiKeyManager />
            </>
          )}

          {activeTab === 'pitch-deck' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">Pitch Deck Template</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Upload a <strong>.pptx</strong> file to extract your brand colours and fonts. Every generated pitch deck will use your template&apos;s styling — no manual formatting required. PDF files cannot be used as templates.
              </p>
              <PitchDeckTemplateSettings />
            </>
          )}

          {activeTab === 'team' && (
            <>
              <h2 className="font-serif text-xl text-[var(--gold)] mb-1">Organisation</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Team name, branding, and outbound webhook configuration.
              </p>
              <TeamSettings />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
