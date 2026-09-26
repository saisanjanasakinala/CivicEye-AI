import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  Bus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader,
  User,
  Image as ImageIcon,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatusBadge from '../components/Complaints/StatusBadge'
import Badge from '../components/UI/Badge'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getComplaint, updateComplaintStatus } from '../api/complaints'
import type { Complaint, ComplaintStatus } from '../types'
import { categoryLabel, categoryEmoji, severityVariant, severityLabel } from '../utils/categoryHelpers'
import { safeFormat } from '../utils/dateHelpers'
import { format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'

const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  new: ['assigned', 'in_progress'],
  assigned: ['in_progress'],
  in_progress: ['awaiting_verification', 'resolved'],
  awaiting_verification: ['resolved', 'new'],
  resolved: ['closed'],
  closed: [],
}

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getComplaint(id)
      .then(setComplaint)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Failed to load complaint'))
      .finally(() => setIsLoading(false))
  }, [id])

  const handleStatusUpdate = async (status: ComplaintStatus) => {
    if (!complaint) return
    setIsUpdating(true)
    try {
      const updated = await updateComplaintStatus(complaint.complaint_id, status, note || undefined)
      setComplaint(updated)
      setNote('')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? 'Update failed')
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !complaint) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold">{error || 'Complaint not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-teal-400 hover:text-teal-300 text-sm"
          >
            ← Go back
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const nextStatuses = STATUS_TRANSITIONS[complaint.status] ?? []
  const canUpdate = user?.role === 'admin' || user?.role === 'officer'

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Complaints
        </button>

        {/* Header card */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0">{categoryEmoji(complaint.category)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-slate-400 text-sm font-mono">#{complaint.id}</span>
                <StatusBadge status={complaint.status} size="md" dot />
                <Badge variant={severityVariant(complaint.severity)} size="md">
                  {severityLabel(complaint.severity)}
                </Badge>
                {complaint.is_simulated && (
                  <Badge variant="warning" size="sm">
                    🔬 SIMULATED DETECTION
                  </Badge>
                )}
              </div>
              <h1 className="text-xl font-bold text-white mb-1">{categoryLabel(complaint.category)}</h1>
              <p className="text-slate-300 text-sm leading-relaxed">{complaint.description}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 pt-5 border-t border-slate-700/50">
            <div>
              <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><MapPin size={11} />Location</p>
              <p className="text-slate-300 text-sm">
                {complaint.address || `${complaint.latitude.toFixed(4)}, ${complaint.longitude.toFixed(4)}`}
              </p>
            </div>
            {complaint.bus_id && (
              <div>
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Bus size={11} />Bus</p>
                <p className="text-slate-300 text-sm">{complaint.bus_id}</p>
              </div>
            )}
            {complaint.confidence !== undefined && (
              <div>
                <p className="text-slate-500 text-xs mb-1">AI Confidence</p>
                <p className="text-slate-300 text-sm">{(complaint.confidence * 100).toFixed(0)}%</p>
              </div>
            )}
            {(complaint.department || (complaint as any).department_name) && (
              <div>
                <p className="text-slate-500 text-xs mb-1">Department</p>
                <p className="text-slate-300 text-sm">
                  {typeof complaint.department === 'object' && complaint.department !== null
                    ? (complaint.department as any).name
                    : (complaint.department || (complaint as any).department_name)}
                </p>
              </div>
            )}
            {complaint.assigned_to_name && (
              <div>
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><User size={11} />Assigned To</p>
                <p className="text-slate-300 text-sm">{complaint.assigned_to_name}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Clock size={11} />Detected</p>
              <p className="text-slate-300 text-sm">
                {safeFormat(complaint.first_detected_at, 'dd MMM yyyy, HH:mm')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Evidence images */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <ImageIcon size={16} className="text-teal-400" />
              Evidence
            </h2>
            {complaint.before_image_url || complaint.image_url ? (
              <div className="space-y-3">
                {complaint.image_url && (
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Detection Image</p>
                    <img src={complaint.image_url} alt="Detection" className="w-full rounded-lg border border-slate-700" />
                  </div>
                )}
                {complaint.before_image_url && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-slate-500 text-xs mb-1">Before</p>
                      <img src={complaint.before_image_url} alt="Before" className="w-full rounded-lg border border-slate-700" />
                    </div>
                    {complaint.after_image_url && (
                      <div>
                        <p className="text-slate-500 text-xs mb-1">After</p>
                        <img src={complaint.after_image_url} alt="After" className="w-full rounded-lg border border-slate-700" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600">
                <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No images available</p>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Clock size={16} className="text-teal-400" />
              Status History
            </h2>
            {complaint.status_history && complaint.status_history.length > 0 ? (
              <div className="space-y-4 relative">
                <div className="timeline-line" />
                {complaint.status_history.map((entry, idx) => (
                  <div key={entry.id} className="flex gap-3 relative">
                    <div className="w-5 h-5 rounded-full bg-slate-700 border-2 border-teal-500 flex-shrink-0 z-10 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusBadge status={entry.new_status} />
                        {idx === 0 && <span className="text-teal-400 text-xs">Latest</span>}
                      </div>
                      {entry.notes && (
                        <p className="text-slate-400 text-xs mt-1">{entry.notes}</p>
                      )}
                      <p className="text-slate-600 text-xs mt-1">
                        {entry.changed_by_name && `By ${entry.changed_by_name} · `}
                        {safeFormat(entry.changed_at, 'dd MMM, HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No history yet</p>
            )}
          </div>
        </div>

        {/* Action panel */}
        {canUpdate && nextStatuses.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Update Status</h2>

            {complaint.status === 'awaiting_verification' && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <p className="text-purple-300 text-sm">
                  This complaint is awaiting verification. Review the before/after images and confirm resolution.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note about this status change…"
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg px-3 py-2 text-white placeholder-slate-500 outline-none text-sm resize-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((status) => {
                const isResolve = status === 'resolved'
                const isReopen = status === 'new'
                const isClose = status === 'closed'
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusUpdate(status)}
                    disabled={isUpdating}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
                      isResolve
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : isReopen
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : isClose
                        ? 'bg-slate-600 hover:bg-slate-500 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isUpdating ? <Loader size={14} className="animate-spin" /> : null}
                    {isResolve ? <CheckCircle2 size={14} /> : null}
                    {isReopen ? <RotateCcw size={14} /> : null}
                    {isClose ? <XCircle size={14} /> : null}
                    {status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                )
              })}
            </div>

            {error && (
              <p className="text-red-400 text-sm mt-3">{error}</p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
