import type { ComplaintStatus } from '../../types'
import Badge from '../UI/Badge'
import { statusLabel, statusVariant } from '../../utils/categoryHelpers'

interface StatusBadgeProps {
  status: ComplaintStatus
  size?: 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
}

export default function StatusBadge({ status, size = 'sm', dot, pulse }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariant(status)} size={size} dot={dot} pulse={pulse && status === 'new'}>
      {statusLabel(status)}
    </Badge>
  )
}
