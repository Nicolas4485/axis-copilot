'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { FitScore } from '@/lib/api'

interface FitScoreRadarProps {
  scores: Pick<FitScore, 'businessQuality' | 'financialQuality' | 'managementStrength' | 'marketDynamics' | 'dealStructure'>
  size?: number
}

const AXIS_LABELS: Record<keyof FitScoreRadarProps['scores'], string> = {
  businessQuality:    'Business',
  financialQuality:   'Financials',
  managementStrength: 'Management',
  marketDynamics:     'Market',
  dealStructure:      'Deal',
}

export function FitScoreRadar({ scores, size = 300 }: FitScoreRadarProps) {
  const data = (Object.keys(AXIS_LABELS) as Array<keyof typeof AXIS_LABELS>).map((key) => ({
    axis: AXIS_LABELS[key],
    value: scores[key],
    fullMark: 100,
  }))

  const overall = Math.round(
    Object.values(scores).reduce((sum, v) => sum + v, 0) / Object.keys(scores).length
  )

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 32 }}>
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }}
          />
          <Radar
            name="Fit Score"
            dataKey="value"
            stroke="#1E3A8A"
            fill="#1E3A8A"
            fillOpacity={0.35}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: '#0D1B3E',
              border: '1px solid #1E3A8A',
              borderRadius: '8px',
              color: '#F8FAFC',
              fontSize: '12px',
            }}
            formatter={(value) => [`${value ?? 0}/100`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Overall score overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#1E3A8A]">{overall}</div>
          <div className="text-xs text-[#64748B] font-medium tracking-wide uppercase">Overall</div>
        </div>
      </div>
    </div>
  )
}
