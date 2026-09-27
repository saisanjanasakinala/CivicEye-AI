import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color?: 'teal' | 'amber' | 'blue' | 'emerald' | 'red' | 'purple' | 'indigo'
  subtitle?: string
  pulse?: boolean
}

const colorMap = {
  teal: 'text-[#91C8BD] bg-[#367F77]/20 border-[#367F77]/40',
  amber: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  blue: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
  emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  red: 'text-red-300 bg-red-500/15 border-red-500/30',
  purple: 'text-[#91C8BD] bg-[#367F77]/20 border-[#367F77]/40',
  indigo: 'text-[#91C8BD] bg-[#367F77]/20 border-[#367F77]/40',
}

export default function StatCard({
  title,
  value,
  icon,
  color = 'teal',
  subtitle,
}: StatCardProps) {
  return (
    <div className="bg-[#1C3038] border border-[#2A444E] rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[#AABDC2] text-xs font-semibold">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#F4F7F7] mt-1">
            {value}
          </p>
          {subtitle && <p className="text-[#AABDC2] text-xs mt-1">{subtitle}</p>}
        </div>
        <div
          className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${
            colorMap[color] ?? colorMap.teal
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
