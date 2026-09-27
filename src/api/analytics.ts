import client from './client'
import type { AnalyticsData, ComplaintCategory, ComplaintSeverity, ComplaintStatus } from '../types'

export async function getAnalytics(days = 30): Promise<AnalyticsData> {
  const [summaryRes, byCatRes, byDeptRes, bySevRes, timelineRes, hotspotsRes] = await Promise.all([
    client.get('/analytics/summary'),
    client.get('/analytics/by-category'),
    client.get('/analytics/by-department'),
    client.get('/analytics/by-severity'),
    client.get('/analytics/timeline', { params: { days } }),
    client.get('/analytics/hotspots'),
  ])

  const s = summaryRes.data || {}
  const totalComplaints = Number(s.total ?? 0)
  const resolvedComplaints = Number((s.resolved ?? 0) + (s.closed ?? 0))
  const pendingComplaints = Number((s.new ?? 0) + (s.assigned ?? 0))
  const inProgressComplaints = Number((s.in_progress ?? 0) + (s.awaiting_verification ?? 0))

  const byStatus: { status: ComplaintStatus; count: number }[] = [
    { status: 'new', count: Number(s.new ?? 0) },
    { status: 'assigned', count: Number(s.assigned ?? 0) },
    { status: 'in_progress', count: Number(s.in_progress ?? 0) },
    { status: 'awaiting_verification', count: Number(s.awaiting_verification ?? 0) },
    { status: 'resolved', count: Number(s.resolved ?? 0) },
    { status: 'closed', count: Number(s.closed ?? 0) },
  ]

  const byCategory = (Array.isArray(byCatRes.data) ? byCatRes.data : []).map((item: any) => ({
    category: (item.category || 'other') as ComplaintCategory,
    count: Number(item.count ?? 0),
    resolved: Number(item.resolved ?? 0),
    pending: Number(item.pending ?? (item.count ?? 0) - (item.resolved ?? 0)),
  }))

  const byDepartment = (Array.isArray(byDeptRes.data) ? byDeptRes.data : []).map((item: any) => ({
    department: String(item.department || 'Unassigned'),
    count: Number(item.count ?? 0),
    resolved: Number(item.resolved ?? 0),
    avg_response_hours: Number(item.avg_response_hours ?? 24),
  }))

  const bySeverity = (Array.isArray(bySevRes.data) ? bySevRes.data : []).map((item: any) => ({
    severity: (item.severity || 'medium') as ComplaintSeverity,
    count: Number(item.count ?? 0),
  }))

  const dailyTrend = (Array.isArray(timelineRes.data) ? timelineRes.data : []).map((item: any) => {
    const count = Number(item.count ?? 0)
    return {
      date: String(item.date || ''),
      count,
      resolved: item.resolved !== undefined ? Number(item.resolved) : 0,
    }
  })

  const hotspots = (Array.isArray(hotspotsRes.data) ? hotspotsRes.data : []).map((item: any) => ({
    latitude: Number(item.latitude ?? 18.5204),
    longitude: Number(item.longitude ?? 73.8567),
    count: Number(item.count ?? 1),
    category: item.category ? String(item.category) : undefined,
    address: item.category ? `${item.category} Hotspot Cluster` : undefined,
  }))

  return {
    summary: {
      total_complaints: totalComplaints,
      resolved_complaints: resolvedComplaints,
      pending_complaints: pendingComplaints,
      in_progress_complaints: inProgressComplaints,
      resolution_rate: Number(s.resolution_rate_pct ?? 0),
      avg_resolution_hours: Number(s.avg_resolution_hours ?? 0),
    },
    by_category: byCategory,
    by_status: byStatus,
    by_department: byDepartment,
    daily_trend: dailyTrend,
    by_severity: bySeverity,
    hotspots,
  }
}
