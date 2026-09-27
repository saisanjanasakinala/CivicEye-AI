import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Clock,
  CheckCircle2,
  Activity,
  ChevronRight,
  ArrowRight,
  Shield,
  Building2,
  User,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatCard from '../components/UI/StatCard'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import StatusBadge from '../components/Complaints/StatusBadge'
import {
  getComplaints,
  updateComplaintStatus,
  getAuditLogs,
} from '../api/complaints'
import { getAnalytics } from '../api/analytics'
import { useAuth } from '../contexts/AuthContext'
import type {
  Complaint,
  AnalyticsData,
  ComplaintStatus,
  AuditLogItem,
} from '../types'
import { formatDistanceToNow } from 'date-fns'
import { safeFormat } from '../utils/dateHelpers'
import { categoryLabel } from '../utils/categoryHelpers'

const DEPARTMENTS = [
  {
    id: 1,
    key: 'Roads',
    label: 'Roads Department',
    routingRules: 'Potholes, Road Damage, Road Obstructions',
  },
  {
    id: 2,
    key: 'Sanitation',
    label: 'Sanitation Department',
    routingRules: 'Garbage Accumulation, Illegal Dumping, Stray Animals',
  },
  {
    id: 4,
    key: 'Drainage',
    label: 'Drainage Department',
    routingRules: 'Waterlogging, Open Drains, Flood Risks',
  },
  {
    id: 5,
    key: 'Electrical',
    label: 'Electrical Department',
    routingRules: 'Damaged Streetlights, Power Lines',
  },
  {
    id: 3,
    key: 'Parks',
    label: 'Parks Department',
    routingRules: 'Fallen Trees, Park Maintenance',
  },
]

const tooltipStyle = {
  backgroundColor: '#1C3038',
  border: '1px solid #2A4550',
  borderRadius: '8px',
  color: '#F4F7F7',
  fontSize: '12px',
}

export default function GovernmentDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const officerDeptKey =
    DEPARTMENTS.find(
      (d) =>
        d.id === user?.department_id ||
        (user?.department &&
          user.department.toLowerCase().includes(d.key.toLowerCase()))
    )?.key || 'Roads'

  const [activeTab, setActiveTab] = useState(() =>
    user?.role === 'officer' ? officerDeptKey : 'Roads'
  )
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [deptComplaints, setDeptComplaints] = useState<Complaint[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState<number | null>(null)

  useEffect(() => {
    if (user?.role === 'officer') {
      setActiveTab(officerDeptKey)
    }
  }, [user?.role, officerDeptKey])

  const handleSelectDeptTab = (deptKey: string) => {
    if (!isAdmin && deptKey !== officerDeptKey) {
      return
    }
    setActiveTab(deptKey)
  }

  const loadDeptComplaints = useCallback(async (dept: string) => {
    try {
      const data = await getComplaints({ department_name: dept, page_size: 25 })
      setDeptComplaints(data.items ?? [])
    } catch {
      setDeptComplaints([])
    }
  }, [])

  const loadAudit = useCallback(async () => {
    try {
      const logs = await getAuditLogs(25)
      setAuditLogs(logs)
    } catch {
      setAuditLogs([])
    }
  }, [])

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true)
      try {
        const [complaintsData, analyticsData, logsData] = await Promise.all([
          getComplaints({ page_size: 10, status: 'new' }),
          getAnalytics(30),
          getAuditLogs(25),
        ])
        setComplaints(complaintsData.items ?? [])
        setAnalytics(analyticsData)
        setAuditLogs(logsData)
      } catch (err) {
        console.error('Failed to load gov dashboard', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadAll()
  }, [])

  useEffect(() => {
    loadDeptComplaints(activeTab)
  }, [activeTab, loadDeptComplaints])

  const handleQuickUpdate = async (
    complaintId: string,
    numericId: number,
    status: ComplaintStatus
  ) => {
    setIsUpdating(numericId)
    try {
      await updateComplaintStatus(complaintId, status)
      await Promise.all([loadDeptComplaints(activeTab), loadAudit()])
    } catch (err) {
      console.error('Status update failed', err)
    } finally {
      setIsUpdating(null)
    }
  }

  const trendData =
    analytics?.daily_trend.slice(-30).map((d) => ({
      date: d.date.slice(5),
      new: d.count,
      resolved: d.resolved,
    })) ?? []

  const summary = analytics?.summary
  const activeDeptInfo = DEPARTMENTS.find((d) => d.key === activeTab) || DEPARTMENTS[0]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#F4F7F7] flex items-center gap-2.5">
              <Building2 size={22} className="text-[#91C8BD]" />
              Department Assignments & Automated Routing
            </h1>
            <p className="text-[#AABDC2] text-sm mt-0.5">
              Automated municipal department routing, assigned officers, priority triage, and resolution progress
            </p>
          </div>
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Complaints"
              value={summary?.total_complaints.toLocaleString() ?? '—'}
              icon={<FileText size={20} />}
              color="teal"
            />
            <StatCard
              title="Pending Triage"
              value={summary?.pending_complaints ?? '—'}
              icon={<Clock size={20} />}
              color="amber"
              subtitle="Awaiting department action"
            />
            <StatCard
              title="In Progress"
              value={summary?.in_progress_complaints ?? '—'}
              icon={<Activity size={20} />}
              color="blue"
              subtitle="Active field repairs"
            />
            <StatCard
              title="Resolved"
              value={summary?.resolved_complaints ?? '—'}
              icon={<CheckCircle2 size={20} />}
              color="emerald"
              subtitle={`${summary?.resolution_rate?.toFixed(1) ?? 0}% resolution rate`}
            />
          </div>
        )}

        {/* Automated Routing Rules Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {DEPARTMENTS.map((dept) => {
            const isSelected = activeTab === dept.key
            const isRestricted = !isAdmin && dept.key !== officerDeptKey
            return (
              <button
                key={dept.key}
                type="button"
                disabled={isRestricted}
                onClick={() => handleSelectDeptTab(dept.key)}
                title={
                  isRestricted
                    ? `Restricted: Department Officers can only access ${officerDeptKey} Department`
                    : dept.label
                }
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-[#1C3038] border-[#367F77] shadow-sm'
                    : isRestricted
                    ? 'bg-[#1C3038]/30 border-[#2A4550]/50 opacity-50 cursor-not-allowed'
                    : 'bg-[#1C3038]/60 border-[#2A4550] hover:border-[#367F77]/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[#F4F7F7]">{dept.label}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? 'bg-[#91C8BD]' : 'bg-[#2A4550]'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-[#AABDC2] leading-snug">
                  Auto-routes: {dept.routingRules}
                </p>
              </button>
            )
          })}
        </div>

        {/* Department tabs & queue */}
        <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl overflow-hidden">
          <div className="flex border-b border-[#2A4550] overflow-x-auto bg-[#101C23]/40">
            {DEPARTMENTS.map((dept) => {
              const isRestricted = !isAdmin && dept.key !== officerDeptKey
              return (
                <button
                  key={dept.key}
                  disabled={isRestricted}
                  onClick={() => handleSelectDeptTab(dept.key)}
                  title={
                    isRestricted
                      ? `Restricted: Department Officers can only access ${officerDeptKey} Department`
                      : dept.label
                  }
                  className={`px-5 py-3.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeTab === dept.key
                      ? 'border-b-2 border-[#91C8BD] text-[#91C8BD] bg-[#367F77]/15'
                      : isRestricted
                      ? 'text-[#AABDC2]/40 cursor-not-allowed'
                      : 'text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#1C3038]'
                  }`}
                >
                  {dept.label}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-[#F4F7F7] text-sm">
                  {activeDeptInfo.label} Work Queue · {deptComplaints.length} complaints
                </h3>
                <p className="text-xs text-[#AABDC2]">
                  Automated routing rules: {activeDeptInfo.routingRules}
                </p>
              </div>
            </div>

            {deptComplaints.length === 0 ? (
              <div className="text-center py-10 text-[#AABDC2]">
                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No complaints queued for {activeDeptInfo.label}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2A4550] text-[#AABDC2] text-xs uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left">Reference</th>
                      <th className="px-3 py-2.5 text-left">Category & Description</th>
                      <th className="px-3 py-2.5 text-left">Department & Officer</th>
                      <th className="px-3 py-2.5 text-left">Priority</th>
                      <th className="px-3 py-2.5 text-left">Status & Progress</th>
                      <th className="px-3 py-2.5 text-left">Reported</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A4550]/60">
                    {deptComplaints.map((c) => {
                      const progressPct =
                        c.status === 'resolved' || c.status === 'closed'
                          ? 100
                          : c.status === 'awaiting_verification'
                          ? 80
                          : c.status === 'in_progress'
                          ? 55
                          : c.status === 'assigned'
                          ? 30
                          : 15

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-[#101C23]/50 transition-colors"
                        >
                          <td className="px-3 py-3 font-mono text-[#91C8BD] text-xs font-bold">
                            {c.complaint_id}
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs font-semibold text-[#F4F7F7] block">
                              {categoryLabel(c.category)}
                            </span>
                            <p className="text-[#AABDC2] text-xs truncate max-w-[240px]">
                              {c.description}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <span className="text-[#F4F7F7] font-medium block">
                              {c.department_name || activeDeptInfo.label}
                            </span>
                            <span className="text-[11px] text-[#91C8BD] flex items-center gap-1 mt-0.5">
                              <User size={11} />
                              {c.assigned_to_name || 'Department Officer Queue'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                                c.severity === 'critical'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : c.severity === 'high'
                                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                  : c.severity === 'medium'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {c.severity}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-1.5 min-w-[130px]">
                              <StatusBadge status={c.status} />
                              <div className="w-full h-1.5 bg-[#101C23] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#367F77] rounded-full transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[#AABDC2] text-xs">
                            {(() => {
                              try {
                                return formatDistanceToNow(new Date(c.first_detected_at), {
                                  addSuffix: true,
                                })
                              } catch {
                                return 'recently'
                              }
                            })()}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {c.status === 'new' || c.status === 'assigned' ? (
                                <button
                                  onClick={() =>
                                    handleQuickUpdate(c.complaint_id, c.id, 'in_progress')
                                  }
                                  disabled={isUpdating === c.id}
                                  className="text-xs px-2.5 py-1 bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7] rounded-lg font-medium transition-colors disabled:opacity-60"
                                >
                                  Start Work
                                </button>
                              ) : c.status === 'in_progress' ? (
                                <button
                                  onClick={() =>
                                    handleQuickUpdate(
                                      c.complaint_id,
                                      c.id,
                                      'awaiting_verification'
                                    )
                                  }
                                  disabled={isUpdating === c.id}
                                  className="text-xs px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
                                >
                                  Mark Repaired
                                </button>
                              ) : c.status === 'awaiting_verification' ? (
                                <button
                                  onClick={() =>
                                    handleQuickUpdate(c.complaint_id, c.id, 'resolved')
                                  }
                                  disabled={isUpdating === c.id}
                                  className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
                                >
                                  Verify & Resolve
                                </button>
                              ) : null}
                              <button
                                onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                                className="px-2.5 py-1 rounded-lg bg-[#101C23] hover:bg-[#2A4550] text-[#91C8BD] text-xs font-medium flex items-center gap-1"
                                title="Confirm/Override Department or Assign Officer"
                              >
                                Manage
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Activity chart */}
        {trendData.length > 0 && (
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5">
            <h2 className="font-semibold text-[#F4F7F7] mb-4 flex items-center gap-2 text-sm">
              <Activity size={16} className="text-[#91C8BD]" />
              30-Day Municipal Complaint Inflow vs Resolution Trend
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A4550" />
                <XAxis dataKey="date" tick={{ fill: '#AABDC2', fontSize: 11 }} />
                <YAxis tick={{ fill: '#AABDC2', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#AABDC2' }} />
                <Line
                  type="monotone"
                  dataKey="new"
                  name="Reported"
                  stroke="#91C8BD"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#367F77"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent activity timeline */}
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5">
            <h2 className="font-semibold text-[#F4F7F7] mb-4 flex items-center gap-2 text-sm">
              <Activity size={16} className="text-[#91C8BD]" />
              Recent Incoming Complaints & Auto-Routing
            </h2>
            <div className="space-y-3">
              {complaints.slice(0, 7).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-[#101C23]/60 hover:bg-[#101C23] border border-[#2A4550]/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                >
                  <div className="w-2 h-2 rounded-full bg-[#91C8BD] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#F4F7F7] text-xs font-medium truncate">
                      <span className="font-mono text-[#91C8BD] font-bold">{c.complaint_id}</span> —{' '}
                      {(c.description ?? '').slice(0, 60)}
                    </p>
                    <p className="text-[#AABDC2] text-[11px]">
                      Routed to:{' '}
                      <strong className="text-[#F4F7F7]">
                        {typeof c.department === 'object' && c.department !== null
                          ? (c.department as any).name
                          : c.department || (c as any).department_name || 'Unassigned'}
                      </strong>{' '}
                      ·{' '}
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(c.first_detected_at), {
                            addSuffix: true,
                          })
                        } catch {
                          return 'recently'
                        }
                      })()}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                  <ArrowRight size={14} className="text-[#AABDC2] flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* System Audit Logs */}
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5">
            <h2 className="font-semibold text-[#F4F7F7] mb-4 flex items-center gap-2 text-sm">
              <Shield size={16} className="text-[#91C8BD]" />
              Administrative Audit Logs
            </h2>
            <div className="space-y-2.5 max-h-[310px] overflow-y-auto pr-1">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-[#AABDC2] py-6 text-center">
                  No administrative actions logged yet.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() =>
                      log.complaint_id && navigate(`/dashboard/complaints/${log.complaint_id}`)
                    }
                    className="p-2.5 rounded-xl bg-[#101C23] border border-[#2A4550] hover:border-[#367F77] cursor-pointer text-xs flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-[#367F77]/20 text-[#91C8BD] font-mono text-[10px] uppercase font-semibold">
                          {log.action}
                        </span>
                        <span className="font-mono text-[#91C8BD] font-semibold">
                          {log.complaint_id}
                        </span>
                      </div>
                      <p className="text-[#F4F7F7] mt-1">{log.details}</p>
                      <p className="text-[11px] text-[#AABDC2] mt-0.5">
                        {log.actor_name} ({log.actor_role})
                      </p>
                    </div>
                    <span className="text-[11px] text-[#AABDC2] whitespace-nowrap">
                      {safeFormat(log.created_at, 'dd MMM HH:mm')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
