import type { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  iconBg?: string
  trend?: { value: number; label: string }
  color?: 'teal' | 'blue' | 'amber' | 'red' | 'emerald' | 'indigo' | 'purple'
  pulse?: boolean
}

const colorMap = {
  teal: 'bg-teal-500/20 text-teal-400',
  blue: 'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
  red: 'bg-red-500/20 text-red-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
  indigo: 'bg-indigo-500/20 text-indigo-400',
  purple: 'bg-purple-500/20 text-purple-400',
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'teal',
  trend,
  pulse,
}: StatCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{value}</span>
            {pulse && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-400 live-dot" />
                <span className="text-teal-400 text-xs">live</span>
              </span>
            )}
          </div>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
          {trend && (
            <p
              className={`text-xs mt-1 ${trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorMap[color]}`}>{icon}</div>
      </div>
    </div>
  )
}
