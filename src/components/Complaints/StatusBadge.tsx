import type { ComplaintStatus } from '../../types'
import { statusLabel, statusVariant } from '../../utils/categoryHelpers'
import Badge from '../UI/Badge'

interface StatusBadgeProps {
  status: ComplaintStatus | string
  size?: 'sm' | 'md'
  dot?: boolean
}

const dotColors: Record<string, string> = {
  new: 'bg-blue-400',
  assigned: 'bg-indigo-400',
  in_progress: 'bg-amber-400',
  awaiting_verification: 'bg-purple-400',
  resolved: 'bg-emerald-400',
  closed: 'bg-slate-400',
}

export default function StatusBadge({ status, size = 'sm', dot = false }: StatusBadgeProps) {
  const normalized = (status || 'new') as ComplaintStatus
  const variant = statusVariant(normalized)
  const label = statusLabel(normalized)

  return (
    <Badge variant={variant} size={size}>
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColors[normalized] ?? 'bg-slate-400'}`}
        />
      )}
      {label}
    </Badge>
  )
}
