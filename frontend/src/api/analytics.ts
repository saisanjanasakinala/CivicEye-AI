import client from './client'
import type { AnalyticsData } from '../types'

export async function getAnalytics(days = 30): Promise<AnalyticsData> {
  const [summaryRes, categoryRes, deptRes, severityRes, timelineRes, hotspotsRes] =
    await Promise.all([
      client.get('/analytics/summary'),
      client.get('/analytics/by-category'),
      client.get('/analytics/by-department'),
      client.get('/analytics/by-severity'),
      client.get(`/analytics/timeline?days=${days}`),
      client.get('/analytics/hotspots'),
    ])

  const summary = summaryRes.data ?? {}
  const byCategory = categoryRes.data ?? []
  const byDept = deptRes.data ?? []
  const bySeverity = severityRes.data ?? []
  const timeline = timelineRes.data ?? []
  const hotspots = hotspotsRes.data ?? []

  return {
    summary: {
      total_complaints: summary.total ?? 0,
      resolved_complaints: (summary.resolved ?? 0) + (summary.closed ?? 0),
      pending_complaints: (summary.new ?? 0) + (summary.assigned ?? 0),
      in_progress_complaints: summary.in_progress ?? 0,
      resolution_rate: summary.resolution_rate_pct ?? 0,
      avg_resolution_hours: summary.avg_resolution_hours ?? 0,
    },
    by_category: byCategory.map((c: { category: string; count: number; resolved: number; pending: number }) => ({
      category: c.category as import('../types').ComplaintCategory,
      count: c.count,
      resolved: c.resolved,
      pending: c.pending,
    })),
    by_status: [
      { status: 'new' as const, count: summary.new ?? 0 },
      { status: 'assigned' as const, count: summary.assigned ?? 0 },
      { status: 'in_progress' as const, count: summary.in_progress ?? 0 },
      { status: 'awaiting_verification' as const, count: summary.awaiting_verification ?? 0 },
      { status: 'resolved' as const, count: summary.resolved ?? 0 },
      { status: 'closed' as const, count: summary.closed ?? 0 },
    ],
    by_department: byDept.map((d: { department: string; count: number; resolved: number }) => ({
      department: d.department,
      count: d.count,
      resolved: d.resolved,
    })),
    daily_trend: timeline.map((t: { date: string; count: number }) => ({
      date: t.date,
      count: t.count,
      resolved: 0,
    })),
    by_severity: bySeverity.map((s: { severity: string; count: number }) => ({
      severity: s.severity as import('../types').ComplaintSeverity,
      count: s.count,
    })),
    hotspots: hotspots.map((h: { latitude: number; longitude: number; count: number; category?: string }) => ({
      latitude: h.latitude,
      longitude: h.longitude,
      count: h.count,
    })),
  }
}
