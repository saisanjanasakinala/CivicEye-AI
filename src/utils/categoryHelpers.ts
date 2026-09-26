import { formatDistanceToNow } from 'date-fns'
import type { ComplaintCategory, ComplaintStatus, ComplaintSeverity } from '../types'

// Maps both the frontend code-style keys AND backend display-string keys
const LABELS: Record<string, string> = {
  // Frontend code-style keys
  pothole: 'Pothole',
  garbage: 'Garbage Dump',
  dustbin: 'Overflowing Dustbin',
  fallen_tree: 'Fallen Tree',
  waterlogging: 'Waterlogging',
  streetlight: 'Broken Streetlight',
  other: 'Other Issue',
  // Backend / CV service display-string keys
  'Pothole': 'Pothole',
  'Garbage': 'Garbage Dump',
  'Dustbin': 'Overflowing Dustbin',
  'Fallen Tree': 'Fallen Tree',
  'Waterlogging': 'Waterlogging',
  'Broken Streetlight': 'Broken Streetlight',
  'Open Drain': 'Open Drain',
  'Illegal Dumping': 'Illegal Dumping',
  'Stray Animals': 'Stray Animals',
  'Road Damage': 'Road Damage',
}

const EMOJIS: Record<string, string> = {
  pothole: '🕳️',
  garbage: '🗑️',
  dustbin: '📦',
  fallen_tree: '🌳',
  waterlogging: '💧',
  streetlight: '💡',
  other: '⚠️',
  'Pothole': '🕳️',
  'Garbage': '🗑️',
  'Dustbin': '📦',
  'Fallen Tree': '🌳',
  'Waterlogging': '💧',
  'Broken Streetlight': '💡',
  'Open Drain': '🚿',
  'Illegal Dumping': '🗑️',
  'Stray Animals': '🐕',
  'Road Damage': '🛣️',
}

export function categoryLabel(category: ComplaintCategory | string): string {
  return LABELS[category] ?? category
}

export function categoryEmoji(category: ComplaintCategory | string): string {
  return EMOJIS[category] ?? '❓'
}

export function statusLabel(status: ComplaintStatus): string {
  const labels: Record<ComplaintStatus, string> = {
    new: 'New',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    awaiting_verification: 'Awaiting Verification',
    resolved: 'Resolved',
    closed: 'Closed',
  }
  return labels[status] ?? status
}

export function statusVariant(status: ComplaintStatus): 'info' | 'indigo' | 'warning' | 'purple' | 'success' | 'gray' {
  const variants: Record<ComplaintStatus, 'info' | 'indigo' | 'warning' | 'purple' | 'success' | 'gray'> = {
    new: 'info',
    assigned: 'indigo',
    in_progress: 'warning',
    awaiting_verification: 'purple',
    resolved: 'success',
    closed: 'gray',
  }
  return variants[status] ?? 'gray'
}

export function severityVariant(severity: ComplaintSeverity | string): 'success' | 'warning' | 'error' {
  const variants: Record<string, 'success' | 'warning' | 'error'> = {
    low: 'success',
    medium: 'warning',
    high: 'error',
    critical: 'error',
  }
  return variants[severity] ?? 'warning'
}

export function severityLabel(severity: ComplaintSeverity | string): string {
  return (severity ?? '').charAt(0).toUpperCase() + (severity ?? '').slice(1)
}

export function safeFormatDistance(
  dateInput: string | number | Date | null | undefined,
  options: { addSuffix?: boolean } = { addSuffix: true }
): string {
  if (!dateInput) return 'recently'
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return 'recently'
  try {
    return formatDistanceToNow(d, options)
  } catch {
    return 'recently'
  }
}

export function getDepartmentName(dept: any): string {
  if (!dept) return '—'
  if (typeof dept === 'string') return dept
  if (typeof dept === 'object' && dept !== null) {
    return dept.name || dept.code || '—'
  }
  return '—'
}
