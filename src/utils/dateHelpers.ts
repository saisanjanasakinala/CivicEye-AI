import { formatDistanceToNow, format } from 'date-fns'

export function safeFormatDistanceToNow(dateInput: any, options: { addSuffix?: boolean } = { addSuffix: true }): string {
  try {
    if (!dateInput) return 'Recently'
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return 'Recently'
    return formatDistanceToNow(d, options)
  } catch {
    return 'Recently'
  }
}

export function safeFormat(dateInput: any, formatStr: string, fallback = '—'): string {
  try {
    if (!dateInput) return fallback
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return fallback
    return format(d, formatStr)
  } catch {
    return fallback
  }
}
