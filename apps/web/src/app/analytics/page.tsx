'use client'

import { AnalyticsDashboard } from '@/components/analytics-dashboard'

export default function AnalyticsPage() {
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="ax-page animate-fade-up">
        <AnalyticsDashboard />
      </div>
    </div>
  )
}
