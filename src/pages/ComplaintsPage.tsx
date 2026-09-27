import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search,
  Filter,
  RotateCcw,
  PlusCircle,
  Sparkles,
  ArrowUpDown,
  ShieldAlert,
  Edit3,
  Check,
  X,
  MapPin,
  Clock,
  Building2,
  Activity,
  Info,
  ExternalLink,
  History,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import {
  getComplaints,
  getDepartments,
  getSmartPriorityQueue,
  overrideSmartPriority,
} from '../api/complaints'
import type {
  Complaint,
  ComplaintFilters,
  ComplaintSeverity,
  ComplaintSource,
  ComplaintStatus,
  Department,
} from '../types'
import ComplaintTable from '../components/Complaints/ComplaintTable'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import StatusBadge from '../components/Complaints/StatusBadge'
import { useAuth } from '../contexts/AuthContext'

const statuses: ComplaintStatus[] = [
  'new',
  'awaiting_verification',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
]

const severities: ComplaintSeverity[] = ['low', 'medium', 'high', 'critical']

const categories = [
  'Pothole',
  'Garbage',
  'Waterlogging',
  'Road Damage',
  'Broken Streetlight',
  'Illegal Dumping',
  'Open Drain',
  'Fallen Tree',
]

const PRIORITY_BADGE_STYLES: Record<
  ComplaintSeverity,
  { bg: string; text: string; border: string; label: string }
> = {
  critical: {
    bg: 'bg-[#EF4444]/20',
    text: 'text-[#F87171]',
    border: 'border-[#EF4444]/40',
    label: 'CRITICAL',
  },
  high: {
    bg: 'bg-[#F97316]/20',
    text: 'text-[#FB923C]',
    border: 'border-[#F97316]/40',
    label: 'HIGH',
  },
  medium: {
    bg: 'bg-[#EAB308]/20',
    text: 'text-[#FACC15]',
    border: 'border-[#EAB308]/40',
    label: 'MEDIUM',
  },
  low: {
    bg: 'bg-[#1F9D68]/20',
    text: 'text-[#4ADE80]',
    border: 'border-[#1F9D68]/40',
    label: 'LOW',
  },
}

interface PriorityQueueState {
  items: Complaint[]
  total: number
  duplicates_consolidated_count: number
  algorithm_note: string
}

const ComplaintsPage: React.FC = () => {
  const { user } = useAuth()
  const isOfficer = user?.role === 'officer'
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [total, setTotal] = useState(0)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Smart Repair Priority Queue state
  const [activeView, setActiveView] = useState<'priority_queue' | 'all_complaints'>(
    searchParams.get('view') === 'all' ? 'all_complaints' : 'priority_queue'
  )
  const [priorityData, setPriorityData] = useState<PriorityQueueState | null>(null)
  const [priorityLoading, setPriorityLoading] = useState(true)
  const [prioritySortBy, setPrioritySortBy] = useState<
    'score' | 'age' | 'severity' | 'road_health' | 'reports'
  >('score')
  const [prioritySortDir, setPrioritySortDir] = useState<'asc' | 'desc'>('desc')
  const [priorityFilterLevel, setPriorityFilterLevel] = useState<ComplaintSeverity | ''>('')
  const [priorityFilterDept, setPriorityFilterDept] = useState<string>(
    isOfficer && user?.department ? user.department : ''
  )

  // Override Modal State
  const [overrideTarget, setOverrideTarget] = useState<Complaint | null>(null)
  const [overrideLevel, setOverrideLevel] = useState<ComplaintSeverity>('high')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [expandedFactorsId, setExpandedFactorsId] = useState<number | null>(null)

  const [filters, setFilters] = useState<ComplaintFilters>({
    status: (searchParams.get('status') as ComplaintStatus) || undefined,
    severity: (searchParams.get('severity') as ComplaintSeverity) || undefined,
    category: searchParams.get('category') || undefined,
    department:
      isOfficer && user?.department
        ? user.department
        : searchParams.get('department') || undefined,
    source: (searchParams.get('source') as ComplaintSource) || undefined,
    search: searchParams.get('search') || undefined,
    page: Number(searchParams.get('page')) || 1,
    page_size: 20,
  })

  const [searchInput, setSearchInput] = useState(filters.search || '')

  useEffect(() => {
    if (!isOfficer) {
      getDepartments()
        .then(setDepartments)
        .catch(() => {})
    }
  }, [isOfficer])

  const loadComplaintsList = () => {
    setLoading(true)
    getComplaints(filters)
      .then((res) => {
        setComplaints(res.items)
        setTotal(res.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadPriorityQueue = () => {
    setPriorityLoading(true)
    getSmartPriorityQueue({
      sort_by: prioritySortBy,
      sort_dir: prioritySortDir,
      priority: priorityFilterLevel || undefined,
      department: priorityFilterDept || undefined,
    })
      .then((res) => {
        setPriorityData(res)
      })
      .catch(() => {})
      .finally(() => setPriorityLoading(false))
  }

  useEffect(() => {
    loadComplaintsList()

    const params: Record<string, string> = {}
    if (filters.status) params.status = filters.status
    if (filters.severity) params.severity = filters.severity
    if (filters.category) params.category = String(filters.category)
    if (filters.department) params.department = filters.department
    if (filters.source) params.source = filters.source
    if (filters.search) params.search = filters.search
    if (filters.page && filters.page > 1) params.page = String(filters.page)
    if (activeView === 'all_complaints') params.view = 'all'
    setSearchParams(params, { replace: true })
  }, [filters, activeView])

  useEffect(() => {
    loadPriorityQueue()
  }, [prioritySortBy, prioritySortDir, priorityFilterLevel, priorityFilterDept])

  const priorityCounts = useMemo(() => {
    const items = priorityData?.items || []
    return {
      critical: items.filter(
        (c) => (c.smart_priority?.effective_priority || c.severity) === 'critical'
      ).length,
      high: items.filter((c) => (c.smart_priority?.effective_priority || c.severity) === 'high')
        .length,
      medium: items.filter(
        (c) => (c.smart_priority?.effective_priority || c.severity) === 'medium'
      ).length,
      low: items.filter((c) => (c.smart_priority?.effective_priority || c.severity) === 'low')
        .length,
      overridden: items.filter((c) => c.smart_priority?.is_overridden).length,
    }
  }, [priorityData])

  const updateFilter = (key: keyof ComplaintFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }))
  }

  const resetFilters = () => {
    setSearchInput('')
    setFilters({
      page: 1,
      page_size: 20,
      department: isOfficer && user?.department ? user.department : undefined,
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', searchInput)
  }

  const openComplaintDetail = (item: Complaint | string | number, fromQueue = true) => {
    const rawId =
      typeof item === 'object' && item !== null
        ? item.complaint_id || item.id
        : item
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') return
    const cleanedId = String(rawId).trim().replace(/^#/, '')
    const fromParam = fromQueue ? 'priority_queue' : 'all_complaints'
    navigate(`/dashboard/complaints/${encodeURIComponent(cleanedId)}?from=${fromParam}`, {
      state: {
        fromPriorityQueue: fromQueue,
        complaintSnapshot: typeof item === 'object' ? item : undefined,
      },
    })
  }

  const openOverrideModal = (complaint: Complaint) => {
    setOverrideTarget(complaint)
    const currentEffective =
      complaint.smart_priority?.effective_priority || complaint.severity || 'high'
    setOverrideLevel(currentEffective)
    setOverrideReason(complaint.priority_override?.reason || '')
    setOverrideError(null)
  }

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideTarget) return
    if (!overrideReason.trim() || overrideReason.trim().length < 4) {
      setOverrideError('Please enter a brief justification for overriding the priority.')
      return
    }
    setOverrideSaving(true)
    setOverrideError(null)
    try {
      await overrideSmartPriority(overrideTarget.complaint_id, {
        priority: overrideLevel,
        reason: overrideReason.trim(),
      })
      setOverrideTarget(null)
      loadPriorityQueue()
      loadComplaintsList()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to save priority override.'
      setOverrideError(msg)
    } finally {
      setOverrideSaving(false)
    }
  }

  const toggleSort = (field: 'score' | 'age' | 'severity' | 'road_health' | 'reports') => {
    if (prioritySortBy === field) {
      setPrioritySortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setPrioritySortBy(field)
      setPrioritySortDir('desc')
    }
  }

  const totalPages = Math.ceil(total / (filters.page_size || 20))

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header + View Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              {isOfficer
                ? `${user?.department || 'Department'} Complaints & Smart Repair Priority`
                : 'All Complaints & Smart Repair Priority Queue'}
            </h2>
            <p className="text-sm text-[#8FA8AE] mt-0.5">
              {total} total complaints recorded • {priorityData?.total ?? 0} verified unresolved
              issues in Smart Priority Queue
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-xl bg-[#132329] p-1 border border-[#2A444E]">
              <button
                type="button"
                onClick={() => setActiveView('priority_queue')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeView === 'priority_queue'
                    ? 'bg-[#0F766E] text-white shadow'
                    : 'text-[#8FA8AE] hover:text-white'
                }`}
              >
                <Sparkles size={14} />
                <span>Smart Repair Priority Queue ({priorityData?.total ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('all_complaints')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeView === 'all_complaints'
                    ? 'bg-[#0F766E] text-white shadow'
                    : 'text-[#8FA8AE] hover:text-white'
                }`}
              >
                <Filter size={14} />
                <span>All Complaints Registry ({total})</span>
              </button>
            </div>

            {!isOfficer && (
              <Link
                to="/citizen"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-xl hover:bg-[#0D9488] transition-colors shadow-sm"
              >
                <PlusCircle size={15} />
                Report New Issue
              </Link>
            )}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* VIEW 1: SMART REPAIR PRIORITY QUEUE (Integrated into All Complaints)  */}
        {/* ===================================================================== */}
        {activeView === 'priority_queue' && (
          <div className="space-y-4">
            <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
                    <Sparkles size={12} />
                    SMART REPAIR PRIORITY ENGINE
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-[#E09F3E]/15 text-[#F3B65B] border border-[#E09F3E]/30">
                    <Info size={12} />
                    Decision Support Only — Never Auto-Resolves or Claims Scheduled Repairs
                  </span>
                </div>
                <p className="text-xs text-[#CFE0E4]">
                  Ranks verified unresolved complaints using 5 transparent factors:{' '}
                  <strong>Defect Severity</strong>, <strong>Unresolved Age</strong>,{' '}
                  <strong>Independent Corroborated Reports</strong> (excluding deduplicated bus
                  camera passes), <strong>Road Segment Health Score</strong>, and{' '}
                  <strong>Verified Proximity to Schools/Hospitals</strong>. Admins can review and
                  override any priority with full audit attribution.
                </p>
              </div>

              {priorityData && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="px-3 py-1.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 text-center">
                    <div className="text-[10px] font-bold text-[#F87171] uppercase">Critical</div>
                    <div className="text-sm font-extrabold text-white">
                      {priorityCounts.critical}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-[#F97316]/15 border border-[#F97316]/40 text-center">
                    <div className="text-[10px] font-bold text-[#FB923C] uppercase">High</div>
                    <div className="text-sm font-extrabold text-white">{priorityCounts.high}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-[#EAB308]/15 border border-[#EAB308]/40 text-center">
                    <div className="text-[10px] font-bold text-[#FACC15] uppercase">Medium</div>
                    <div className="text-sm font-extrabold text-white">{priorityCounts.medium}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-[#1F9D68]/15 border border-[#1F9D68]/40 text-center">
                    <div className="text-[10px] font-bold text-[#4ADE80] uppercase">Low</div>
                    <div className="text-sm font-extrabold text-white">{priorityCounts.low}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-[#00D1FF]/15 border border-[#00D1FF]/40 text-center">
                    <div className="text-[10px] font-bold text-[#00D1FF] uppercase">Overrides</div>
                    <div className="text-sm font-extrabold text-white">
                      {priorityCounts.overridden}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Priority Queue Controls */}
            <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-[#8FA8AE] flex items-center gap-1.5">
                  <ArrowUpDown size={14} className="text-[#00D1FF]" />
                  Sort Queue By:
                </span>
                {[
                  { key: 'score', label: 'Priority Score' },
                  { key: 'severity', label: 'Severity Level' },
                  { key: 'age', label: 'Unresolved Age' },
                  { key: 'road_health', label: 'Worst Road Health' },
                  { key: 'reports', label: 'Corroborated Reports' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      toggleSort(
                        opt.key as 'score' | 'age' | 'severity' | 'road_health' | 'reports'
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      prioritySortBy === opt.key
                        ? 'bg-[#00D1FF]/15 text-[#00D1FF] border-[#00D1FF]/40'
                        : 'bg-[#132329] text-[#CFE0E4] border-[#2A444E] hover:bg-[#243D47]'
                    }`}
                  >
                    {opt.label}{' '}
                    {prioritySortBy === opt.key && (prioritySortDir === 'desc' ? '↓' : '↑')}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={priorityFilterLevel}
                  onChange={(e) =>
                    setPriorityFilterLevel((e.target.value as ComplaintSeverity) || '')
                  }
                  className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white"
                >
                  <option value="">All Priority Levels</option>
                  <option value="critical">Critical Priority</option>
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>

                {!isOfficer && (
                  <select
                    value={priorityFilterDept}
                    onChange={(e) => setPriorityFilterDept(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Priority Queue Table */}
            {priorityLoading ? (
              <div className="py-16 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : !priorityData || priorityData.items.length === 0 ? (
              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-8 text-center text-sm text-[#8FA8AE]">
                No unresolved complaints match the current priority queue filters.
              </div>
            ) : (
              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#132329] border-b border-[#2A444E] text-[11px] font-semibold uppercase tracking-wider text-[#8FA8AE]">
                        <th className="py-3 px-3.5">Rank & ID</th>
                        <th className="py-3 px-3.5">Issue & Corridor Health</th>
                        <th className="py-3 px-3.5">Location & Proximity</th>
                        <th className="py-3 px-3.5">Department</th>
                        <th className="py-3 px-3.5">Smart Priority</th>
                        <th className="py-3 px-3.5">Priority Reason & Factors</th>
                        <th className="py-3 px-3.5">Status</th>
                        <th className="py-3 px-3.5 text-right">Admin Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A444E]/70 text-xs">
                      {priorityData.items.map((item: Complaint, idx: number) => {
                        const sp = item.smart_priority
                        const effectiveLevel: ComplaintSeverity =
                          sp?.effective_priority || item.severity || 'medium'
                        const badge = PRIORITY_BADGE_STYLES[effectiveLevel]
                        const isExpanded = expandedFactorsId === item.id
                        const targetComplaintId = String(item.complaint_id || item.id).trim()

                        return (
                          <React.Fragment key={item.id}>
                            <tr
                              role="button"
                              tabIndex={0}
                              aria-label={`Open details for complaint ${targetComplaintId}`}
                              onClick={() => openComplaintDetail(item, true)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  openComplaintDetail(item, true)
                                }
                              }}
                              className="hover:bg-[#243D47]/75 transition-colors cursor-pointer group"
                            >
                              <td className="py-3.5 px-3.5 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-[#132329] border border-[#2A444E] flex items-center justify-center text-[11px] font-bold text-[#00D1FF]">
                                    #{idx + 1}
                                  </span>
                                  <div>
                                    <Link
                                      to={`/dashboard/complaints/${encodeURIComponent(targetComplaintId)}?from=priority_queue`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="font-bold text-[#00D1FF] group-hover:underline flex items-center gap-1"
                                    >
                                      {item.complaint_id || `#${item.id}`}
                                      <ExternalLink size={11} />
                                    </Link>
                                    <span className="text-[10px] text-[#8FA8AE]">
                                      {sp?.age_days ?? 0}d unresolved
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-3.5 align-top max-w-[210px]">
                                <div className="font-semibold text-white group-hover:text-[#00D1FF] transition-colors">
                                  {item.category}
                                </div>
                                <p className="text-[11px] text-[#AABDC2] line-clamp-2 mt-0.5">
                                  {item.description}
                                </p>
                                {sp?.road_segment_name && (
                                  <Link
                                    to={`/dashboard/road-health?segment=${sp.road_segment_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded bg-[#132329] border border-[#2A444E] text-[10px] text-[#00D1FF] hover:border-[#00D1FF]"
                                  >
                                    <Activity size={10} />
                                    <span>
                                      {sp.road_segment_name}:{' '}
                                      {sp.road_health_score !== null
                                        ? `${sp.road_health_score}/100`
                                        : 'Insufficient Data'}
                                    </span>
                                  </Link>
                                )}
                              </td>

                              <td className="py-3.5 px-3.5 align-top max-w-[210px]">
                                <div className="flex items-start gap-1 text-[#CFE0E4]">
                                  <MapPin size={12} className="text-[#00D1FF] shrink-0 mt-0.5" />
                                  <span className="line-clamp-2">
                                    {item.address ||
                                      `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
                                  </span>
                                </div>
                                {sp?.nearest_sensitive_location && (
                                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E09F3E]/15 border border-[#E09F3E]/40 text-[10px] font-semibold text-[#F3B65B]">
                                    <ShieldAlert size={11} />
                                    <span>
                                      {sp.nearest_sensitive_location.distance_meters}m from{' '}
                                      {sp.nearest_sensitive_location.name}
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td className="py-3.5 px-3.5 align-top">
                                <div className="inline-flex items-center gap-1.5 text-white font-medium">
                                  <Building2 size={12} className="text-[#8FA8AE]" />
                                  <span>
                                    {item.department_info?.name ||
                                      item.department_name ||
                                      item.department ||
                                      item.suggested_department_name ||
                                      'Unassigned'}
                                  </span>
                                </div>
                              </td>

                              <td className="py-3.5 px-3.5 align-top">
                                <div className="space-y-1">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                                  >
                                    {badge.label}
                                  </span>
                                  <div className="text-[11px] text-[#CFE0E4] font-semibold">
                                    Score: {sp?.score ?? 0}/100
                                  </div>
                                  {sp?.is_overridden && sp.override_record && (
                                    <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
                                      Manual Override (Rec:{' '}
                                      {sp.recommended_priority.toUpperCase()})
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td className="py-3.5 px-3.5 align-top max-w-[290px]">
                                <p className="text-[11px] text-[#CFE0E4] leading-relaxed">
                                  {sp?.priority_reason}
                                </p>

                                {sp?.is_overridden && sp.override_record && (
                                  <div className="mt-1.5 p-2 rounded bg-[#132329] border border-[#00D1FF]/30 text-[10px] text-[#CFE0E4] space-y-0.5">
                                    <div className="font-semibold text-[#00D1FF] flex items-center gap-1">
                                      <History size={10} />
                                      Overridden by {sp.override_record.overridden_by_name}
                                    </div>
                                    <div>Reason: &ldquo;{sp.override_record.reason}&rdquo;</div>
                                    <div className="text-[#8FA8AE]">
                                      {new Date(
                                        sp.override_record.overridden_at
                                      ).toLocaleString()}
                                    </div>
                                  </div>
                                )}

                                <div className="mt-1.5 flex items-center gap-3 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setExpandedFactorsId(isExpanded ? null : item.id)
                                    }}
                                    className="text-[#00D1FF] hover:underline font-semibold"
                                  >
                                    {isExpanded
                                      ? 'Hide Factor Breakdown ▲'
                                      : `View ${sp?.factors.length ?? 0} Scoring Factors ▼`}
                                  </button>
                                  {(sp?.deduplicated_sightings_merged ?? 0) > 0 && (
                                    <span className="text-[#4ADE80]">
                                      ✓ {sp?.deduplicated_sightings_merged} camera dup(s) excluded
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3.5 px-3.5 align-top">
                                <StatusBadge status={item.status} />
                              </td>

                              <td className="py-3.5 px-3.5 align-top text-right">
                                <div className="flex flex-col items-end gap-1.5">
                                  <Link
                                    to={`/dashboard/complaints/${encodeURIComponent(targetComplaintId)}?from=priority_queue`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0F766E] hover:bg-[#0D9488] text-white transition-colors"
                                  >
                                    <span>Open Details</span>
                                    <ExternalLink size={11} />
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openOverrideModal(item)
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#132329] hover:bg-[#243D47] text-[#00D1FF] border border-[#00D1FF]/40 transition-colors"
                                  >
                                    <Edit3 size={11} />
                                    <span>Override Priority</span>
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {isExpanded && sp && (
                              <tr
                                className="bg-[#132329]/90 cursor-pointer"
                                onClick={() => openComplaintDetail(item, true)}
                              >
                                <td colSpan={8} className="px-6 py-3.5">
                                  <div className="space-y-2">
                                    <div className="text-xs font-bold text-white flex flex-wrap items-center justify-between gap-2">
                                      <span>
                                        Transparent Factor Breakdown for {item.complaint_id} (Total
                                        Score: {sp.score}/100 → Recommended:{' '}
                                        {sp.recommended_priority.toUpperCase()})
                                      </span>
                                      <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-normal text-[#8FA8AE]">
                                          Independent Reports: {sp.independent_reports_count} •
                                          Deduplicated Camera Detections Merged:{' '}
                                          {sp.deduplicated_sightings_merged}
                                        </span>
                                        <Link
                                          to={`/dashboard/complaints/${encodeURIComponent(targetComplaintId)}?from=priority_queue`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[11px] font-semibold text-[#00D1FF] hover:underline flex items-center gap-1"
                                        >
                                          <span>Inspect Full Complaint Page →</span>
                                        </Link>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                                      {sp.factors.map((f, fIdx) => (
                                        <div
                                          key={fIdx}
                                          className="bg-[#1B2F37] border border-[#2A444E] rounded-lg p-2.5 text-[11px]"
                                        >
                                          <div className="flex items-center justify-between font-semibold text-[#00D1FF] mb-1">
                                            <span>{f.label}</span>
                                            <span>+{f.points} pts</span>
                                          </div>
                                          <p className="text-[#CFE0E4] leading-snug">
                                            {f.explanation}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* VIEW 2: ORIGINAL ALL COMPLAINTS REGISTRY                              */}
        {/* ===================================================================== */}
        {activeView === 'all_complaints' && (
          <>
            <div className="bg-[#1B2F37] rounded-xl border border-[#2A444E] p-4 space-y-3">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8FA8AE]"
                  />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by ID, category, description, or address..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-[#2A444E] rounded-lg bg-[#132329] text-white placeholder-[#8FA8AE] focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0D9488] transition-colors"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-2 border border-[#2A444E] text-[#CFE0E4] text-sm rounded-lg hover:bg-[#243D47] transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-[#8FA8AE]">
                  <Filter size={13} /> Filters:
                </div>

                <select
                  value={filters.status || ''}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                >
                  <option value="">All Statuses</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.severity || ''}
                  onChange={(e) => updateFilter('severity', e.target.value)}
                  className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                >
                  <option value="">All Severities</option>
                  {severities.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.category || ''}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {!isOfficer && (
                  <select
                    value={filters.department || ''}
                    onChange={(e) => updateFilter('department', e.target.value || undefined)}
                    className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={filters.source || ''}
                  onChange={(e) => updateFilter('source', e.target.value)}
                  className="px-3 py-1.5 text-xs border border-[#2A444E] rounded-lg bg-[#132329] text-white focus:outline-none focus:ring-2 focus:ring-[#00D1FF]"
                >
                  <option value="">All Sources</option>
                  <option value="bus_camera">Bus AI Camera</option>
                  <option value="citizen_portal">Citizen Report</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <>
                <ComplaintTable
                  complaints={complaints}
                  onRowClick={(idOrRef) => openComplaintDetail(idOrRef, false)}
                />
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-3">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setFilters((prev) => ({ ...prev, page: p }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          (filters.page || 1) === p
                            ? 'bg-[#0F766E] text-white'
                            : 'bg-[#1B2F37] text-[#8FA8AE] border border-[#2A444E]'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ===================================================================== */}
        {/* MANUAL PRIORITY OVERRIDE MODAL                                        */}
        {/* ===================================================================== */}
        {overrideTarget && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[#1B2F37] border border-[#2A444E] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-[#2A444E] pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#00D1FF]">
                    Manual Priority Override & Assignment
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    {overrideTarget.complaint_id} — {overrideTarget.category}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="text-[#8FA8AE] hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {overrideTarget.smart_priority && (
                <div className="bg-[#132329] border border-[#2A444E] rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8FA8AE]">Algorithm Recommendation:</span>
                    <span className="font-bold text-[#00D1FF] uppercase">
                      {overrideTarget.smart_priority.recommended_priority} (Score:{' '}
                      {overrideTarget.smart_priority.score}/100)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#CFE0E4]">
                    {overrideTarget.smart_priority.priority_reason}
                  </p>
                </div>
              )}

              <form onSubmit={handleSaveOverride} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#CFE0E4] mb-1.5">
                    Select Assigned Repair Priority Level
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['critical', 'high', 'medium', 'low'] as ComplaintSeverity[]).map((lvl) => {
                      const style = PRIORITY_BADGE_STYLES[lvl]
                      const selected = overrideLevel === lvl
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setOverrideLevel(lvl)}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            selected
                              ? `${style.bg} ${style.text} ${style.border} ring-2 ring-[#00D1FF]`
                              : 'bg-[#132329] text-[#8FA8AE] border-[#2A444E] hover:text-white'
                          }`}
                        >
                          {style.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CFE0E4] mb-1.5">
                    Override Justification (Recorded in Audit History)
                  </label>
                  <textarea
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Explain why you are overriding or manually assigning this repair priority (e.g., field engineer inspection report, arterial traffic impact)..."
                    className="w-full px-3 py-2 bg-[#132329] border border-[#2A444E] rounded-lg text-xs text-white placeholder-[#8FA8AE] focus:outline-none focus:border-[#00D1FF]"
                  />
                </div>

                <div className="bg-[#132329] border border-[#2A444E] rounded-lg p-2.5 text-[11px] text-[#8FA8AE] flex items-center gap-2">
                  <Clock size={14} className="text-[#00D1FF] shrink-0" />
                  <span>
                    Change will be logged under{' '}
                    <strong className="text-white">
                      {user?.full_name || user?.username || 'Government Admin'}
                    </strong>{' '}
                    with current server timestamp. Overriding priority never automatically marks the
                    complaint resolved.
                  </span>
                </div>

                {overrideError && (
                  <div className="text-xs text-[#F87171] bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-lg px-3 py-2">
                    {overrideError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setOverrideTarget(null)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold border border-[#2A444E] text-[#CFE0E4] hover:bg-[#243D47]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={overrideSaving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] hover:bg-[#0D9488] text-white disabled:opacity-50"
                  >
                    <Check size={14} />
                    <span>{overrideSaving ? 'Saving Override...' : 'Save Priority Override'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default ComplaintsPage
