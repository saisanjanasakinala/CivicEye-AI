import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Clock,
  CheckCircle2,
  Activity,
  ChevronRight,
  Play,
  X,
  ArrowRight,
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
import ComplaintTable from '../components/Complaints/ComplaintTable'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import StatusBadge from '../components/Complaints/StatusBadge'
import { getComplaints, updateComplaintStatus } from '../api/complaints'
import { getAnalytics } from '../api/analytics'
import type { Complaint, AnalyticsData, ComplaintStatus } from '../types'
import { format, formatDistanceToNow } from 'date-fns'

const DEPARTMENTS = [
  { key: 'Roads', label: 'Roads' },
  { key: 'Sanitation', label: 'Sanitation' },
  { key: 'Parks', label: 'Parks' },
  { key: 'Drainage', label: 'Drainage' },
  { key: 'Electrical', label: 'Electrical' },
]

const WALKTHROUGH_STEPS = [
  { title: 'Welcome to Gov Dashboard', desc: 'This is your command center for managing all civic complaints across Pune.' },
  { title: 'Summary Statistics', desc: 'At a glance, see total complaints, pending items, in-progress work, and resolution rate.' },
  { title: 'Activity Chart', desc: 'The 30-day trend shows new complaints vs. resolutions over time to track performance.' },
  { title: 'Department Tabs', desc: 'Switch between departments: Roads, Sanitation, Parks, Drainage, and Electrical.' },
  { title: 'Complaint Queue', desc: 'Each department shows its specific complaint queue, sorted by priority.' },
  { title: 'Quick Status Updates', desc: 'Click "Start Work" or "Mark Resolved" to update complaint status inline.' },
  { title: 'Activity Timeline', desc: 'See the most recent status changes across all departments in real time.' },
  { title: 'Ready to act!', desc: 'You are ready to use the Government Dashboard. Start resolving complaints!' },
]

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
}

export default function GovernmentDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Roads')
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [deptComplaints, setDeptComplaints] = useState<Complaint[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState<number | null>(null)

  // Walkthrough state
  const [walkthroughActive, setWalkthroughActive] = useState(false)
  const [walkthroughStep, setWalkthroughStep] = useState(0)

  const loadDeptComplaints = useCallback(async (dept: string) => {
    try {
      const data = await getComplaints({ page_size: 20 })
      setDeptComplaints(data.items ?? [])
    } catch {
      setDeptComplaints([])
    }
  }, [])

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true)
      try {
        const [complaintsData, analyticsData] = await Promise.all([
          getComplaints({ page_size: 10, status: 'new' }),
          getAnalytics(30),
        ])
        setComplaints(complaintsData.items ?? [])
        setAnalytics(analyticsData)
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

  const handleQuickUpdate = async (complaintId: string, numericId: number, status: ComplaintStatus) => {
    setIsUpdating(numericId)
    try {
      await updateComplaintStatus(complaintId, status)
      await loadDeptComplaints(activeTab)
    } catch (err) {
      console.error('Status update failed', err)
    } finally {
      setIsUpdating(null)
    }
  }

  // Walkthrough auto-advance
  useEffect(() => {
    if (!walkthroughActive) return
    if (walkthroughStep >= WALKTHROUGH_STEPS.length - 1) return
    const timer = setTimeout(() => setWalkthroughStep((s) => s + 1), 4000)
    return () => clearTimeout(timer)
  }, [walkthroughActive, walkthroughStep])

  const trendData = analytics?.daily_trend.slice(-30).map((d) => ({
    date: d.date.slice(5),
    new: d.count,
    resolved: d.resolved,
  })) ?? []

  const summary = analytics?.summary

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Government Dashboard</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Municipal complaint management and resolution tracking
            </p>
          </div>
          <button
            onClick={() => { setWalkthroughActive(true); setWalkthroughStep(0) }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={14} />
            Start Demo Walkthrough
          </button>
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
              title="Pending"
              value={summary?.pending_complaints ?? '—'}
              icon={<Clock size={20} />}
              color="amber"
              subtitle="Awaiting action"
            />
            <StatCard
              title="In Progress"
              value={summary?.in_progress_complaints ?? '—'}
              icon={<Activity size={20} />}
              color="blue"
              subtitle="Being addressed"
            />
            <StatCard
              title="Resolution Rate"
              value={`${summary?.resolution_rate?.toFixed(1) ?? '—'}%`}
              icon={<CheckCircle2 size={20} />}
              color="emerald"
              subtitle="Overall"
            />
          </div>
        )}

        {/* Activity chart */}
        {trendData.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={16} className="text-teal-400" />
              Activity Last 30 Days
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                <Line type="monotone" dataKey="new" name="New" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Department tabs */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-700/50 overflow-x-auto">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept.key}
                onClick={() => setActiveTab(dept.key)}
                className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === dept.key
                    ? 'border-b-2 border-teal-400 text-teal-400 bg-teal-500/5'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                }`}
              >
                {dept.label}
              </button>
            ))}
          </div>

          {/* Department complaint list */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-white text-sm">
                {activeTab} Department · {deptComplaints.length} complaints
              </h3>
            </div>

            {deptComplaints.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No complaints for this department</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Severity</th>
                      <th className="px-3 py-2 text-left">Age</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptComplaints.map((c) => (
                      <tr key={c.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                        <td className="px-3 py-2 font-mono text-slate-400 text-xs">#{c.id}</td>
                        <td className="px-3 py-2">
                          <p className="text-slate-300 text-xs truncate max-w-[200px]">{c.description}</p>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            c.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            c.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                            c.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {c.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {formatDistanceToNow(new Date(c.first_detected_at), { addSuffix: false })}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {c.status === 'new' || c.status === 'assigned' ? (
                              <button
                                onClick={() => handleQuickUpdate(c.complaint_id, c.id, 'in_progress')}
                                disabled={isUpdating === c.id}
                                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-60"
                              >
                                Start Work
                              </button>
                            ) : c.status === 'in_progress' ? (
                              <button
                                onClick={() => handleQuickUpdate(c.complaint_id, c.id, 'awaiting_verification')}
                                disabled={isUpdating === c.id}
                                className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors disabled:opacity-60"
                              >
                                Mark Repaired
                              </button>
                            ) : null}
                            <button
                              onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                              className="text-slate-400 hover:text-white p-1 rounded"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Recent activity timeline */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} className="text-teal-400" />
            Recent New Complaints
          </h2>
          <div className="space-y-3">
            {complaints.slice(0, 8).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
              >
                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-sm truncate">
                    #{c.id} — {(c.description ?? '').slice(0, 60)}{(c.description ?? '').length > 60 ? '…' : ''}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {c.department ?? 'Unassigned'} ·{' '}
                    {formatDistanceToNow(new Date(c.first_detected_at), { addSuffix: true })}
                  </p>
                </div>
                <StatusBadge status={c.status} />
                <ArrowRight size={14} className="text-slate-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Demo Walkthrough overlay */}
      {walkthroughActive && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 pointer-events-none">
          <div className="walkthrough-overlay" />
          <div className="relative z-50 pointer-events-all max-w-md w-full mx-4 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {WALKTHROUGH_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === walkthroughStep ? 'bg-teal-400' : i < walkthroughStep ? 'bg-teal-600' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setWalkthroughActive(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <h3 className="text-white font-semibold mb-2">
              Step {walkthroughStep + 1}: {WALKTHROUGH_STEPS[walkthroughStep].title}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              {WALKTHROUGH_STEPS[walkthroughStep].desc}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">
                {walkthroughStep + 1} / {WALKTHROUGH_STEPS.length}
              </span>
              <div className="flex gap-2">
                {walkthroughStep > 0 && (
                  <button
                    onClick={() => setWalkthroughStep((s) => s - 1)}
                    className="px-3 py-1.5 text-sm text-slate-300 hover:text-white border border-slate-600 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                )}
                {walkthroughStep < WALKTHROUGH_STEPS.length - 1 ? (
                  <button
                    onClick={() => setWalkthroughStep((s) => s + 1)}
                    className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => setWalkthroughActive(false)}
                    className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                  >
                    Done ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
