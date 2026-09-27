import React from 'react'

export type BadgeVariant =
  | 'info'
  | 'indigo'
  | 'warning'
  | 'purple'
  | 'success'
  | 'gray'
  | 'error'
  | 'default'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  indigo: 'bg-[#367F77]/20 text-[#91C8BD] border-[#367F77]/40',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  gray: 'bg-[#233B44] text-[#AABDC2] border-[#2A444E]',
  error: 'bg-red-500/15 text-red-300 border-red-500/30',
  default: 'bg-[#367F77]/20 text-[#91C8BD] border-[#367F77]/40',
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-0.5',
  lg: 'text-sm px-3 py-1',
}

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-md border ${
        variantClasses[variant] ?? variantClasses.default
      } ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  )
}
