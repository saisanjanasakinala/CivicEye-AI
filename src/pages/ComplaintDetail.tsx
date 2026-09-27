import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
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
  Shield,
  Upload,
  Building2,
  Flag,
  GitMerge,
  Sparkles,
  Activity,
  History,
  Eye,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatusBadge from '../components/Complaints/StatusBadge'
import Badge from '../components/UI/Badge'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import {
  getComplaint,
  updateComplaintStatus,
  assignComplaint,
  updateComplaintPriority,
  uploadComplaintEvidence,
  getDepartments,
  getStaffUsers,
  mergeDuplicateComplaint,
  uploadRepairVerificationAfterPhoto,
  submitRepairVerificationDecision,
  runRepairVerificationComparison,
  simulateReinspectionBusPass,
  overrideComplaintSmartPriority,
  resolveComplaintWithEvidence,
} from '../api/complaints'
import type {
  Complaint,
  ComplaintSeverity,
  ComplaintStatus,
  Department,
  User as StaffUser,
} from '../types'
import {
  categoryLabel,
  categoryEmoji,
  severityVariant,
  severityLabel,
} from '../utils/categoryHelpers'
import { safeFormat } from '../utils/dateHelpers'
import { useAuth } from '../contexts/AuthContext'

const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  new: ['assigned', 'in_progress'],
  assigned: ['in_progress', 'resolved'],
  in_progress: ['awaiting_verification', 'resolved'],
  awaiting_verification: ['resolved', 'new'],
  resolved: ['closed', 'in_progress'],
  closed: [],
}

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const fromParam = searchParams.get('from')
  const cameFromAllComplaints = fromParam === 'all_complaints'

  const handleBackToPriorityQueue = () => {
    navigate('/dashboard/complaints')
  }

  const handleBackNavigation = () => {
    if (cameFromAllComplaints) {
      navigate('/dashboard/complaints?view=all')
    } else {
      navigate('/dashboard/complaints')
    }
  }
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isForbidden, setIsForbidden] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [mergingId, setMergingId] = useState<string | number | null>(null)
  const [manualMergeId, setManualMergeId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [actionToast, setActionToast] = useState('')

  // Assignment & Priority states
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('')
  const [selectedSeverity, setSelectedSeverity] = useState<ComplaintSeverity>('medium')

  // Resolution Evidence Upload state
  const [evidenceStage, setEvidenceStage] = useState<'before' | 'after'>('after')
  const [evidenceNotes, setEvidenceNotes] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false)

  // Before & After Repair Verification state
  const [afterPhotoFile, setAfterPhotoFile] = useState<File | null>(null)
  const [afterPhotoPreviewUrl, setAfterPhotoPreviewUrl] = useState<string | null>(null)
  const [afterPhotoValidationError, setAfterPhotoValidationError] = useState<string>('')
  const [afterPhotoNotes, setAfterPhotoNotes] = useState('')
  const [isUploadingAfterPhoto, setIsUploadingAfterPhoto] = useState(false)
  const [isResolvingDirectly, setIsResolvingDirectly] = useState(false)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [publicUpdateApproved, setPublicUpdateApproved] = useState(true)
  const [publicSummaryText, setPublicSummaryText] = useState('')
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false)
  const [isRunningComparison, setIsRunningComparison] = useState(false)
  const [isSimulatingBusPass, setIsSimulatingBusPass] = useState(false)

  // Smart Priority Override state
  const [overridePriorityLevel, setOverridePriorityLevel] = useState<ComplaintSeverity>('high')
  const [overridePriorityReason, setOverridePriorityReason] = useState('')
  const [isSavingPriorityOverride, setIsSavingPriorityOverride] = useState(false)

  const refreshComplaint = async () => {
    if (!id) return
    const comp = await getComplaint(id)
    setComplaint(comp)
    if (comp.smart_priority?.effective_priority) {
      setOverridePriorityLevel(comp.smart_priority.effective_priority)
    }
    if (comp.priority_override?.reason) {
      setOverridePriorityReason(comp.priority_override.reason)
    }
    if (comp.repair_verification?.decision_notes) {
      setVerificationNotes(comp.repair_verification.decision_notes)
    }
    if (comp.repair_verification?.public_summary) {
      setPublicSummaryText(comp.repair_verification.public_summary)
    }
  }

  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    setIsForbidden(false)
    setError('')
    Promise.all([
      getComplaint(id),
      getDepartments().catch(() => [] as Department[]),
      isAdmin ? getStaffUsers().catch(() => [] as StaffUser[]) : Promise.resolve([] as StaffUser[]),
    ])
      .then(([comp, depts, users]) => {
        setComplaint(comp)
        setDepartments(depts)
        setStaff(users)
        const deptName =
          comp.department_info?.name || comp.department || comp.department_name || ''
        setSelectedDept(deptName)
        setSelectedOfficerId(comp.assigned_to_id ? String(comp.assigned_to_id) : '')
        setSelectedSeverity(comp.severity)
        if (comp.smart_priority?.effective_priority) {
          setOverridePriorityLevel(comp.smart_priority.effective_priority)
        }
        if (comp.priority_override?.reason) {
          setOverridePriorityReason(comp.priority_override.reason)
        }
        if (comp.repair_verification?.decision_notes) {
          setVerificationNotes(comp.repair_verification.decision_notes)
        }
        if (comp.repair_verification?.public_summary) {
          setPublicSummaryText(comp.repair_verification.public_summary)
        }
      })
      .catch((e) => {
        if (e?.response?.status === 403) {
          setIsForbidden(true)
        }
        setError(
          e?.response?.data?.message ??
            e?.response?.data?.detail ??
            'Failed to load complaint'
        )
      })
      .finally(() => setIsLoading(false))
  }, [id, isAdmin])

  const showToast = (msg: string) => {
    setActionToast(msg)
    setTimeout(() => setActionToast(''), 4000)
  }

  const handleStatusUpdate = async (status: ComplaintStatus) => {
    if (!complaint) return
    setIsUpdating(true)
    setError('')
    try {
      const updated = await updateComplaintStatus(
        complaint.complaint_id,
        status,
        note || undefined
      )
      setComplaint(updated)
      setNote('')
      showToast(`Status updated to ${status.replace('_', ' ')}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Update failed')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAssignSubmit = async (e: React.FormEvent, overrideDeptName?: string) => {
    e.preventDefault()
    if (!complaint) return
    const targetDeptName = overrideDeptName ?? selectedDept
    setIsUpdating(true)
    setError('')
    try {
      const officer = staff.find((u) => String(u.id) === selectedOfficerId)
      const deptObj = departments.find((d) => d.name === targetDeptName)
      const updated = await assignComplaint(complaint.complaint_id, {
        department_id: deptObj?.id,
        department_name: targetDeptName || undefined,
        assigned_to_id: officer?.id,
        assigned_to_name: officer?.full_name || officer?.username,
        notes: `Confirmed routing to ${targetDeptName}${officer ? ` (Officer: ${officer.full_name})` : ''}`,
      })
      setComplaint(updated)
      setSelectedDept(targetDeptName)
      showToast(`Assigned to ${targetDeptName}${officer ? ` · ${officer.full_name}` : ''}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Assignment failed')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleMergeDuplicate = async (duplicateId: string | number) => {
    if (!complaint) return
    setMergingId(duplicateId)
    setError('')
    try {
      const updated = await mergeDuplicateComplaint(complaint.complaint_id, duplicateId)
      setComplaint(updated)
      setManualMergeId('')
      showToast(
        `Verified & merged duplicate ${duplicateId} into ${complaint.complaint_id} (preserving evidence & history).`
      )
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.response?.data?.detail ||
          'Failed to merge duplicate complaint.'
      )
    } finally {
      setMergingId(null)
    }
  }

  const handlePriorityChange = async (newSeverity: ComplaintSeverity) => {
    if (!complaint) return
    setSelectedSeverity(newSeverity)
    setIsUpdating(true)
    try {
      const updated = await updateComplaintPriority(
        complaint.complaint_id,
        newSeverity,
        `Priority updated to ${newSeverity}`
      )
      setComplaint(updated)
      showToast(`Priority updated to ${newSeverity.toUpperCase()}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Priority update failed')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complaint) return
    setIsUploadingEvidence(true)
    setError('')
    try {
      let imageDataUrl: string | undefined
      if (!evidenceFile) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#101C23"/><rect x="24" y="24" width="592" height="312" rx="16" fill="#1C3038" stroke="#367F77" stroke-width="3"/><text x="48" y="80" fill="#91C8BD" font-family="sans-serif" font-size="22" font-weight="bold">MUNICIPAL FIELD EVIDENCE (${evidenceStage.toUpperCase()})</text><text x="48" y="125" fill="#F4F7F7" font-family="monospace" font-size="16">Complaint: ${complaint.complaint_id} (${complaint.category})</text><text x="48" y="160" fill="#AABDC2" font-family="sans-serif" font-size="15">Notes: ${evidenceNotes || 'Field repair verified by municipal engineer'}</text><text x="48" y="200" fill="#91C8BD" font-family="monospace" font-size="14">GPS: ${complaint.latitude.toFixed(4)}N, ${complaint.longitude.toFixed(4)}E</text><text x="48" y="295" fill="#AABDC2" font-family="monospace" font-size="13">Timestamp: ${new Date().toISOString()}</text></svg>`
        imageDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      }
      const res = await uploadComplaintEvidence(complaint.complaint_id, {
        file: evidenceFile || undefined,
        image_data: imageDataUrl,
        stage: evidenceStage,
        notes: evidenceNotes || `${evidenceStage.toUpperCase()} field inspection photo`,
      })
      setComplaint(res.complaint)
      setEvidenceFile(null)
      setEvidenceNotes('')
      showToast(`Uploaded ${evidenceStage} resolution evidence.`)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Evidence upload failed')
    } finally {
      setIsUploadingEvidence(false)
    }
  }

  const handleSelectAfterPhotoFile = (file: File | null) => {
    setAfterPhotoValidationError('')
    if (!file) {
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      return
    }
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
    if (!allowedMime.includes(file.type.toLowerCase())) {
      setAfterPhotoValidationError('Unsupported image format. Please choose a JPG, PNG, or WebP photo.')
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      return
    }
    if (file.size <= 0) {
      setAfterPhotoValidationError('Selected image file is empty (0 bytes).')
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setAfterPhotoValidationError('Image file exceeds 10 MB limit. Please upload a smaller image.')
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      return
    }
    setAfterPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setAfterPhotoPreviewUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleUploadVerificationAfter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complaint) return
    setIsUploadingAfterPhoto(true)
    setError('')
    try {
      let dataUrl: string | undefined = afterPhotoPreviewUrl || undefined
      if (afterPhotoFile && !dataUrl) {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = reject
          reader.readAsDataURL(afterPhotoFile)
        })
      }
      await uploadRepairVerificationAfterPhoto(complaint.complaint_id, {
        image_data: dataUrl,
        notes:
          afterPhotoNotes.trim() ||
          `Field repair reported complete for ${complaint.complaint_id}. Submitted for Admin Before/After verification.`,
        latitude: complaint.latitude,
        longitude: complaint.longitude,
        address: complaint.address || undefined,
      })
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      setAfterPhotoNotes('')
      await refreshComplaint()
      showToast('Uploaded AFTER repair photo. Status set to Pending Admin Verification.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to upload AFTER repair photo.')
    } finally {
      setIsUploadingAfterPhoto(false)
    }
  }

  const handleDirectResolveWithEvidence = async () => {
    if (!complaint) return
    setIsResolvingDirectly(true)
    setError('')
    try {
      let dataUrl: string | undefined = afterPhotoPreviewUrl || undefined
      if (afterPhotoFile && !dataUrl) {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = reject
          reader.readAsDataURL(afterPhotoFile)
        })
      }
      if (!afterPhotoFile && !dataUrl && !complaint.after_image_url && !complaint.repair_verification?.after_image_url) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0B1419"/><rect x="24" y="24" width="592" height="312" rx="16" fill="#101C23" stroke="#10B981" stroke-width="3"/><text x="48" y="80" fill="#10B981" font-family="sans-serif" font-size="22" font-weight="bold">OFFICIAL AFTER-REPAIR RESOLUTION PROOF</text><text x="48" y="125" fill="#F4F7F7" font-family="monospace" font-size="16">Complaint: ${complaint.complaint_id} (${complaint.category})</text><text x="48" y="165" fill="#CFE0E4" font-family="sans-serif" font-size="15">Notes: ${afterPhotoNotes.trim() || verificationNotes.trim() || 'Field repair completed and verified by municipal crew'}</text><text x="48" y="205" fill="#91C8BD" font-family="monospace" font-size="14">GPS: ${complaint.latitude.toFixed(4)}N, ${complaint.longitude.toFixed(4)}E</text><text x="48" y="295" fill="#AABDC2" font-family="monospace" font-size="13">Resolved At: ${new Date().toISOString()}</text></svg>`
        dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      }
      const resNote =
        afterPhotoNotes.trim() ||
        verificationNotes.trim() ||
        `Field repair completed and verified for ${complaint.complaint_id}.`
      await resolveComplaintWithEvidence(complaint.complaint_id, {
        file: afterPhotoFile || undefined,
        image_data: dataUrl,
        resolution_notes: resNote,
        public_summary: publicSummaryText.trim() || resNote,
      })
      setAfterPhotoFile(null)
      setAfterPhotoPreviewUrl(null)
      setAfterPhotoNotes('')
      await refreshComplaint()
      showToast('After-repair evidence saved and complaint marked as RESOLVED.')
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          'Failed to resolve complaint with after-repair evidence.'
      )
    } finally {
      setIsResolvingDirectly(false)
    }
  }

  const handleRunComparison = async () => {
    if (!complaint) return
    setIsRunningComparison(true)
    setError('')
    try {
      await runRepairVerificationComparison(complaint.complaint_id)
      await refreshComplaint()
      showToast('Completed Before & After repair comparison.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to run Before & After comparison.')
    } finally {
      setIsRunningComparison(false)
    }
  }

  const handleVerificationDecision = async (
    decision: 'verified' | 'needs_reinspection' | 'rejected'
  ) => {
    if (!complaint) return
    setIsSubmittingVerification(true)
    setError('')
    try {
      await submitRepairVerificationDecision(complaint.complaint_id, {
        decision,
        notes:
          verificationNotes.trim() ||
          (decision === 'verified'
            ? 'Before and After visual evidence inspected and verified by Admin.'
            : decision === 'needs_reinspection'
            ? 'Repair evidence requires field reinspection.'
            : 'Submitted after-repair evidence rejected; defect remains visible.'),
        public_update_approved: publicUpdateApproved,
        public_summary: publicSummaryText.trim() || undefined,
      })
      await refreshComplaint()
      showToast(`Repair verification decision recorded: ${decision.toUpperCase()}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to record repair verification decision.')
    } finally {
      setIsSubmittingVerification(false)
    }
  }

  const handleSimulateReinspectionPass = async () => {
    if (!complaint) return
    setIsSimulatingBusPass(true)
    setError('')
    try {
      await simulateReinspectionBusPass({
        bus_id: complaint.bus_id || 1,
        latitude: complaint.latitude,
        longitude: complaint.longitude,
        category: complaint.category,
      })
      await refreshComplaint()
      showToast('Simulated bus camera reinspection pass linked at GPS coordinates.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to simulate bus camera reinspection pass.')
    } finally {
      setIsSimulatingBusPass(false)
    }
  }

  const handleSaveSmartPriorityOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complaint) return
    if (!overridePriorityReason.trim() || overridePriorityReason.trim().length < 4) {
      setError('Please enter a brief justification for overriding the repair priority.')
      return
    }
    setIsSavingPriorityOverride(true)
    setError('')
    try {
      await overrideComplaintSmartPriority(complaint.complaint_id, {
        priority: overridePriorityLevel,
        reason: overridePriorityReason.trim(),
      })
      await refreshComplaint()
      showToast(`Smart Repair Priority overridden to ${overridePriorityLevel.toUpperCase()}.`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to override Smart Repair Priority.')
    } finally {
      setIsSavingPriorityOverride(false)
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

  if (error && !complaint) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto py-16">
          <div className="bg-[#1C3038] border border-red-500/30 rounded-2xl p-6 text-center space-y-4">
            <AlertTriangle size={40} className="text-red-400 mx-auto" />
            {isForbidden ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-mono font-bold uppercase tracking-wider">
                HTTP 403 Forbidden · Restricted Department Complaint
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold uppercase tracking-wider">
                Complaint Record Unavailable · {id || 'Unknown ID'}
              </div>
            )}
            <h2 className="text-lg font-bold text-[#F4F7F7]">
              {isForbidden ? 'Access Restricted' : 'Complaint Not Found or Deleted'}
            </h2>
            <p className="text-sm text-[#AABDC2]">
              {error ||
                `Complaint '${id}' could not be found in the municipal database. It may have been deleted or the reference ID is invalid.`}
            </p>
            {isForbidden && user?.department && (
              <p className="text-xs text-[#AABDC2]">
                Your account (<strong className="text-[#F4F7F7]">{user.full_name || user.username}</strong>) is scoped to{' '}
                <strong className="text-[#91C8BD]">{user.department}</strong>. Department Officers cannot view or modify complaints belonging to other departments.
              </p>
            )}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleBackToPriorityQueue}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7] text-xs font-semibold transition-colors"
              >
                <ArrowLeft size={14} />
                Back to Smart Repair Priority Queue
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/complaints?view=all')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#101C23] hover:bg-[#233B44] border border-[#2A4550] text-[#AABDC2] hover:text-[#F4F7F7] text-xs font-semibold transition-colors"
              >
                View All Complaints Registry
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!complaint) return null

  const nextStatuses = STATUS_TRANSITIONS[complaint.status] ?? []
  const canUpdate = user?.role === 'admin' || user?.role === 'officer'
  const suggestedDept =
    complaint.suggested_department_name ||
    complaint.department_info?.name ||
    complaint.department ||
    'Roads & Infrastructure'
  const potentialDuplicates = complaint.potential_duplicates || []

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleBackNavigation}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1C3038] hover:bg-[#233B44] border border-[#2A4550] text-[#F4F7F7] text-xs sm:text-sm font-semibold transition-colors"
            >
              <ArrowLeft size={15} className="text-[#00D1FF]" />
              <span>
                {cameFromAllComplaints
                  ? 'Back to All Complaints'
                  : 'Back to Smart Repair Priority Queue'}
              </span>
            </button>
            {cameFromAllComplaints && (
              <button
                type="button"
                onClick={handleBackToPriorityQueue}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#101C23] hover:bg-[#1C3038] border border-[#2A4550] text-[#91C8BD] text-xs font-medium transition-colors"
              >
                <Sparkles size={13} />
                <span>Smart Priority Queue</span>
              </button>
            )}
          </div>

          {actionToast && (
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 size={14} />
              {actionToast}
            </div>
          )}
        </div>

        {/* Header card */}
        <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0">{categoryEmoji(complaint.category)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[#91C8BD] text-sm font-mono font-bold">
                  {complaint.complaint_id}
                </span>
                <span className="text-[#AABDC2] text-xs font-mono">(#{complaint.id})</span>
                <StatusBadge status={complaint.status} size="md" dot />
                <Badge
                  variant={severityVariant(
                    complaint.smart_priority?.effective_priority || complaint.severity
                  )}
                  size="md"
                >
                  Priority:{' '}
                  {severityLabel(
                    complaint.smart_priority?.effective_priority || complaint.severity
                  )}
                  {complaint.smart_priority ? ` (${complaint.smart_priority.score}/100)` : ''}
                </Badge>
                <span className="px-2.5 py-0.5 rounded bg-[#101C23] border border-[#2A4550] text-[#F4F7F7] text-xs font-medium">
                  Source:{' '}
                  {complaint.source === 'citizen' || complaint.source === 'citizen_portal'
                    ? 'Citizen Portal'
                    : 'Bus AI Camera'}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-[#367F77]/20 border border-[#367F77]/40 text-[#91C8BD] text-xs font-semibold">
                  Observations: {complaint.observation_count ?? 1}
                </span>
                {(complaint.duplicate_count ?? 0) > 0 && (
                  <span className="px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                    Geo-Deduplicated (+{complaint.duplicate_count} merged sightings)
                  </span>
                )}
                {complaint.is_simulated && (
                  <Badge variant="warning" size="sm">
                    DEMO / SIMULATED DETECTION
                  </Badge>
                )}
              </div>
              <h1 className="text-xl font-bold text-[#F4F7F7] mb-1">
                {categoryLabel(complaint.category)}
              </h1>
              <p className="text-[#AABDC2] text-sm leading-relaxed">{complaint.description}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4 pt-5 border-t border-[#2A4550]">
            <div>
              <p className="text-[#AABDC2] text-xs mb-1 flex items-center gap-1">
                <MapPin size={11} /> Location
              </p>
              <p className="text-[#F4F7F7] text-xs font-medium">
                {complaint.address ||
                  `${complaint.latitude.toFixed(4)}°N, ${complaint.longitude.toFixed(4)}°E`}
              </p>
              <p className="text-[11px] text-[#AABDC2] font-mono mt-0.5">
                {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
              </p>
            </div>

            {complaint.bus_id && (
              <div>
                <p className="text-[#AABDC2] text-xs mb-1 flex items-center gap-1">
                  <Bus size={11} /> Reporting Bus
                </p>
                <button
                  onClick={() => navigate(`/dashboard/buses/${complaint.bus_id}`)}
                  className="text-[#91C8BD] hover:underline text-sm font-mono font-semibold"
                >
                  {complaint.bus_number || `Bus #${complaint.bus_id}`} →
                </button>
              </div>
            )}

            {complaint.confidence !== undefined && complaint.confidence !== null && (
              <div>
                <p className="text-[#AABDC2] text-xs mb-1">AI Confidence</p>
                <p className="text-[#F4F7F7] text-sm font-mono font-semibold">
                  {(complaint.confidence * 100).toFixed(0)}%
                </p>
              </div>
            )}

            <div>
              <p className="text-[#AABDC2] text-xs mb-1 flex items-center gap-1">
                <Building2 size={11} /> Assigned Department
              </p>
              <p className="text-[#F4F7F7] text-sm font-medium">
                {complaint.department_info?.name ||
                  complaint.department ||
                  complaint.department_name ||
                  'Unassigned'}
              </p>
            </div>

            <div>
              <p className="text-[#AABDC2] text-xs mb-1 flex items-center gap-1">
                <Clock size={11} /> Reported At
              </p>
              <p className="text-[#F4F7F7] text-xs">
                {safeFormat(complaint.first_detected_at, 'dd MMM yyyy, HH:mm')}
              </p>
              {complaint.assigned_to_name && (
                <p className="text-[11px] text-[#91C8BD] mt-0.5 flex items-center gap-1">
                  <User size={10} /> {complaint.assigned_to_name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* SMART REPAIR PRIORITY & ROAD CORRIDOR HEALTH PANEL                */}
        {/* ================================================================= */}
        {complaint.smart_priority && (
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2A4550] pb-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
                    <Sparkles size={12} />
                    SMART REPAIR PRIORITY & CORRIDOR IMPACT
                  </span>
                  {complaint.smart_priority.road_segment_id && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/dashboard/road-health?segment=${complaint.smart_priority?.road_segment_id}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#101C23] text-[#91C8BD] border border-[#367F77]/50 hover:border-[#00D1FF]"
                    >
                      <Activity size={12} />
                      <span>
                        Corridor: {complaint.smart_priority.road_segment_name} (Score:{' '}
                        {complaint.smart_priority.road_health_score !== null
                          ? `${complaint.smart_priority.road_health_score}/100`
                          : 'Insufficient Data'}
                        ) →
                      </span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-[#CFE0E4] leading-relaxed">
                  <strong className="text-[#F4F7F7]">Priority Recommendation Explanation:</strong>{' '}
                  {complaint.smart_priority.priority_reason}. This{' '}
                  <strong className="text-[#00D1FF] uppercase">
                    {complaint.smart_priority.recommended_priority}
                  </strong>{' '}
                  recommendation ({complaint.smart_priority.score}/100 pts) is calculated
                  deterministically from verified complaint data (issue severity, unresolved age of{' '}
                  {complaint.smart_priority.age_days} day(s),{' '}
                  {complaint.smart_priority.independent_reports_count} independent report(s) with{' '}
                  {complaint.smart_priority.deduplicated_sightings_merged} duplicate camera pass(es)
                  excluded, road segment health score, and verified school/hospital proximity).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[#AABDC2]">
                    {complaint.smart_priority.is_overridden
                      ? `Effective Priority (Rec: ${complaint.smart_priority.recommended_priority.toUpperCase()})`
                      : 'Recommended & Effective Priority'}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-0.5">
                    <Badge
                      variant={severityVariant(complaint.smart_priority.effective_priority)}
                      size="sm"
                    >
                      {severityLabel(complaint.smart_priority.effective_priority)}
                    </Badge>
                    <span className="text-sm font-bold text-[#F4F7F7]">
                      {complaint.smart_priority.score}/100
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5-Factor Breakdown */}
            <div>
              <div className="text-xs font-semibold text-[#F4F7F7] mb-2 flex items-center justify-between">
                <span>Actual Factors Used to Calculate Priority</span>
                <span className="text-[11px] font-normal text-[#AABDC2]">
                  Rule-Based Decision Support (No Invented or Unverified Scores)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {complaint.smart_priority.factors.map((factor, idx) => {
                  const pct =
                    factor.max_points > 0
                      ? Math.min(100, Math.round((factor.points / factor.max_points) * 100))
                      : 0
                  return (
                    <div
                      key={idx}
                      className="bg-[#101C23] border border-[#2A4550] rounded-xl p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-[#91C8BD]">
                        <span>{factor.label}</span>
                        <span className="font-mono text-[#00D1FF]">
                          +{factor.points}/{factor.max_points} pts
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#1C3038] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00D1FF] rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#AABDC2] leading-snug">
                        {factor.explanation}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Manual Priority Override Controls & Attribution History */}
            {canUpdate && (
              <div className="pt-3 border-t border-[#2A4550] grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form onSubmit={handleSaveSmartPriorityOverride} className="space-y-2.5">
                  <div className="text-xs font-semibold text-[#F4F7F7] flex items-center gap-1.5">
                    <Flag size={13} className="text-[#00D1FF]" />
                    <span>Manual Priority Override (Records Admin & Timestamp)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['critical', 'high', 'medium', 'low'] as ComplaintSeverity[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setOverridePriorityLevel(lvl)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border transition-all ${
                          overridePriorityLevel === lvl
                            ? 'bg-[#00D1FF]/20 border-[#00D1FF] text-[#00D1FF]'
                            : 'bg-[#101C23] border-[#2A4550] text-[#AABDC2]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={overridePriorityReason}
                      onChange={(e) => setOverridePriorityReason(e.target.value)}
                      placeholder="Enter reason for manual priority assignment or override..."
                      className="flex-1 bg-[#101C23] border border-[#2A4550] rounded-lg px-3 py-1.5 text-xs text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none focus:border-[#00D1FF]"
                    />
                    <button
                      type="submit"
                      disabled={isSavingPriorityOverride}
                      className="px-3.5 py-1.5 rounded-lg bg-[#367F77] hover:bg-[#2b6660] text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {isSavingPriorityOverride ? 'Saving...' : 'Save Override'}
                    </button>
                  </div>
                </form>

                <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-[#91C8BD] flex items-center gap-1.5">
                    <History size={13} />
                    <span>Priority Change Attribution Log</span>
                  </div>
                  {complaint.priority_override ? (
                    <div className="space-y-1 text-[11px] text-[#F4F7F7]">
                      <div>
                        Assigned:{' '}
                        <strong className="uppercase text-[#00D1FF]">
                          {complaint.priority_override.priority}
                        </strong>{' '}
                        (Recommended:{' '}
                        <span className="uppercase">
                          {complaint.priority_override.recommended_priority}
                        </span>
                        )
                      </div>
                      <div>Reason: &ldquo;{complaint.priority_override.reason}&rdquo;</div>
                      <div className="text-[#AABDC2]">
                        Changed by{' '}
                        <strong className="text-white">
                          {complaint.priority_override.overridden_by_name}
                        </strong>{' '}
                        ({complaint.priority_override.overridden_by_role}) on{' '}
                        {safeFormat(
                          complaint.priority_override.overridden_at,
                          'dd MMM yyyy, HH:mm'
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#AABDC2]">
                      No manual priority override applied yet. Currently using transparent
                      rule-based priority recommendation.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* FEATURE 3: BEFORE & AFTER REPAIR VERIFICATION WORKFLOW            */}
        {/* ================================================================= */}
        <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2A4550] pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
                  <CheckCircle2 size={12} />
                  BEFORE & AFTER REPAIR VERIFICATION WORKFLOW
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                    complaint.repair_verification?.verification_status === 'verified'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : complaint.repair_verification?.verification_status ===
                        'needs_reinspection'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : complaint.repair_verification?.verification_status === 'rejected'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : complaint.repair_verification?.verification_status === 'pending_review'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-[#101C23] text-[#AABDC2] border-[#2A4550]'
                  }`}
                >
                  Verification Status:{' '}
                  {(
                    complaint.repair_verification?.verification_status || 'awaiting_after_photo'
                  )
                    .replace(/_/g, ' ')
                    .toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-[#F4F7F7]">
                Side-by-Side Visual Proof & Municipal Repair Verification
              </h2>
              <p className="text-xs text-[#AABDC2] mt-0.5">
                Uploading an AFTER photo never automatically closes a complaint. Admin must inspect
                side-by-side BEFORE and AFTER evidence and mark the repair as{' '}
                <strong>Verified</strong>, <strong>Needs Reinspection</strong>, or{' '}
                <strong>Rejected</strong>.
              </p>
            </div>

            {complaint.repair_verification?.public_approved && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-300">
                <Eye size={13} />
                Approved for Public Citizen Tracking
              </span>
            )}
          </div>

          {/* Side-by-Side BEFORE and AFTER Images with Timestamps & GPS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* BEFORE CARD */}
            <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold uppercase">
                  BEFORE REPAIR (INITIAL DETECTION)
                </span>
                <span className="text-[11px] text-[#AABDC2] font-mono">
                  {safeFormat(
                    complaint.repair_verification?.before_captured_at ||
                      complaint.first_detected_at,
                    'dd MMM yyyy, HH:mm'
                  )}
                </span>
              </div>

              <div className="h-52 w-full rounded-lg overflow-hidden border border-[#2A4550] bg-[#0B1419] flex items-center justify-center">
                {complaint.repair_verification?.before_image_url ||
                complaint.before_image_url ||
                complaint.image_url ? (
                  <img
                    src={
                      complaint.repair_verification?.before_image_url ||
                      complaint.before_image_url ||
                      complaint.image_url ||
                      undefined
                    }
                    alt="Before Repair Evidence"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-xs text-[#AABDC2] p-4">
                    No Before photo available
                  </div>
                )}
              </div>

              <div className="text-[11px] text-[#AABDC2] flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#2A4550]/60">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} className="text-[#00D1FF]" />
                  {complaint.repair_verification?.before_source_label ||
                    complaint.address ||
                    'Municipal Corridor'}
                </span>
                <span className="font-mono text-[#91C8BD]">
                  GPS: {complaint.latitude.toFixed(4)}, {complaint.longitude.toFixed(4)}
                </span>
              </div>
            </div>

            {/* AFTER CARD */}
            <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold uppercase">
                  AFTER REPAIR (COMPLETION PROOF)
                </span>
                <span className="text-[11px] text-[#AABDC2] font-mono">
                  {complaint.repair_verification?.after_uploaded_at
                    ? safeFormat(
                        complaint.repair_verification.after_uploaded_at,
                        'dd MMM yyyy, HH:mm'
                      )
                    : 'Not Uploaded Yet'}
                </span>
              </div>

              <div className="h-52 w-full rounded-lg overflow-hidden border border-[#2A4550] bg-[#0B1419] flex items-center justify-center">
                {complaint.repair_verification?.after_image_url || complaint.after_image_url ? (
                  <img
                    src={
                      complaint.repair_verification?.after_image_url ||
                      complaint.after_image_url ||
                      undefined
                    }
                    alt="After Repair Proof"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-xs text-[#AABDC2] p-6 space-y-1.5">
                    <Upload size={24} className="mx-auto text-[#8FA8AE] opacity-60" />
                    <div className="font-semibold text-white">No AFTER Repair Photo Uploaded</div>
                    <p className="text-[11px]">
                      Upload field completion photo below when repair work is reported complete.
                    </p>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-[#AABDC2] flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#2A4550]/60">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} className="text-emerald-400" />
                  {complaint.address || 'Same GPS Location'}
                </span>
                {complaint.repair_verification?.after_uploaded_by_name && (
                  <span className="text-emerald-300">
                    Uploaded by {complaint.repair_verification.after_uploaded_by_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 & 3: Upload AFTER Photo + Computer Vision / Demo Comparison */}
          {canUpdate && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
              {/* Upload AFTER Photo Form */}
              <form
                onSubmit={handleUploadVerificationAfter}
                className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-3 text-xs"
              >
                <div className="font-semibold text-[#F4F7F7] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Upload size={14} className="text-[#00D1FF]" />
                    Step 1: Upload AFTER Repair Photo
                  </span>
                  <span className="text-[10px] text-[#AABDC2]">
                    Sets status to Pending Admin Review
                  </span>
                </div>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  onChange={(e) => handleSelectAfterPhotoFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-[#AABDC2] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1C3038] file:text-[#00D1FF] hover:file:bg-[#2A4550]"
                />

                {afterPhotoValidationError && (
                  <div className="px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px]">
                    {afterPhotoValidationError}
                  </div>
                )}

                {afterPhotoPreviewUrl && (
                  <div className="rounded-lg border border-emerald-500/40 bg-[#0B1419] p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-300 font-semibold">
                        Selected After-Repair Photo Preview ({afterPhotoFile?.name})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectAfterPhotoFile(null)}
                        className="text-red-300 hover:underline text-[10px]"
                      >
                        Remove
                      </button>
                    </div>
                    <img
                      src={afterPhotoPreviewUrl}
                      alt="Selected After Repair Preview"
                      className="h-32 w-full object-cover rounded border border-[#2A4550]"
                    />
                  </div>
                )}

                <input
                  type="text"
                  value={afterPhotoNotes}
                  onChange={(e) => setAfterPhotoNotes(e.target.value)}
                  placeholder="Resolution / field completion note (required for resolution audit trail)..."
                  className="w-full bg-[#1C3038] border border-[#2A4550] rounded-lg px-3 py-2 text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none focus:border-[#00D1FF]"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={isUploadingAfterPhoto || isResolvingDirectly}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {isUploadingAfterPhoto
                      ? 'Uploading AFTER Photo...'
                      : afterPhotoFile
                      ? 'Upload AFTER Photo (Pending Review)'
                      : 'Upload / Generate Demo AFTER Photo'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDirectResolveWithEvidence}
                    disabled={isResolvingDirectly || isUploadingAfterPhoto}
                    className="py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={13} />
                    <span>
                      {isResolvingDirectly
                        ? 'Resolving...'
                        : 'Save Evidence & Mark Resolved'}
                    </span>
                  </button>

                  {(complaint.repair_verification?.after_image_url ||
                    complaint.after_image_url) && (
                    <button
                      type="button"
                      onClick={handleRunComparison}
                      disabled={isRunningComparison}
                      className="px-3.5 py-2 rounded-lg bg-[#1C3038] hover:bg-[#2A4550] border border-[#00D1FF]/40 text-[#00D1FF] font-semibold transition-colors disabled:opacity-50"
                    >
                      {isRunningComparison ? 'Comparing...' : 'Run Comparison'}
                    </button>
                  )}
                </div>
              </form>

              {/* Computer Vision / Demo Comparison Output Box */}
              <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#F4F7F7] flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[#00D1FF]" />
                    Before & After Comparison Analysis
                  </span>
                  {complaint.repair_verification?.vision_comparison && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        complaint.repair_verification.vision_comparison.is_demo_fallback
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {complaint.repair_verification.vision_comparison.is_demo_fallback
                        ? 'DEMO COMPARISON — MANUAL VERIFICATION REQUIRED'
                        : 'GEMINI VISION AI COMPARISON'}
                    </span>
                  )}
                </div>

                {complaint.repair_verification?.vision_comparison ? (
                  <div className="space-y-2">
                    <p className="text-[#CFE0E4] leading-relaxed">
                      {complaint.repair_verification.vision_comparison.summary}
                    </p>
                    <div className="p-2.5 rounded-lg bg-[#1C3038] border border-[#2A4550] text-[11px] text-[#AABDC2]">
                      <strong className="text-amber-300">Limitations:</strong>{' '}
                      {complaint.repair_verification.vision_comparison.limitations}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#AABDC2] text-[11px] leading-relaxed">
                    Once an AFTER photo is uploaded, click <strong>Run Comparison</strong> to compare
                    BEFORE and AFTER images. If a live vision API key is not configured, CivicEye
                    clearly labels the comparison as a simulated demo and requires manual Admin
                    verification.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Admin Verification Decision Controls */}
          {canUpdate && (
            <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-3.5 text-xs">
              <div className="font-semibold text-[#F4F7F7] flex items-center justify-between">
                <span>
                  Step 2: Official Admin Repair Verification Decision (Required to Resolve)
                </span>
                {complaint.repair_verification?.decision_by_name && (
                  <span className="text-[11px] text-[#91C8BD]">
                    Last decision by {complaint.repair_verification.decision_by_name} at{' '}
                    {safeFormat(complaint.repair_verification.decision_at, 'dd MMM HH:mm')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#AABDC2] mb-1">
                    Official Verification Findings / Notes
                  </label>
                  <input
                    type="text"
                    value={verificationNotes}
                    onChange={(e) => setVerificationNotes(e.target.value)}
                    placeholder="Enter inspection findings (e.g., asphalt patch flush, no standing water)..."
                    className="w-full bg-[#1C3038] border border-[#2A4550] rounded-lg px-3 py-2 text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none focus:border-[#00D1FF]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#AABDC2] mb-1">
                    Public Citizen Summary (Shown on Citizen Track My Complaint when approved)
                  </label>
                  <input
                    type="text"
                    value={publicSummaryText}
                    onChange={(e) => setPublicSummaryText(e.target.value)}
                    placeholder="Public summary for citizens (no private staff data exposed)..."
                    className="w-full bg-[#1C3038] border border-[#2A4550] rounded-lg px-3 py-2 text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none focus:border-[#00D1FF]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-[#CFE0E4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publicUpdateApproved}
                    onChange={(e) => setPublicUpdateApproved(e.target.checked)}
                    className="rounded border-[#2A4550] bg-[#1C3038] text-[#0F766E]"
                  />
                  <span>
                    Publish approved Before/After repair update to public Citizen Tracking portal
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSubmittingVerification}
                    onClick={() => handleVerificationDecision('verified')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    <span>Mark Repair Verified</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingVerification}
                    onClick={() => handleVerificationDecision('needs_reinspection')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    <span>Needs Reinspection</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingVerification}
                    onClick={() => handleVerificationDecision('rejected')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    <span>Reject Repair</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Bus Camera Reinspection Evidence Linking */}
          <div className="bg-[#101C23] border border-[#2A4550] rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-[#F4F7F7] flex items-center gap-1.5">
                  <Bus size={14} className="text-[#00D1FF]" />
                  <span>
                    Automated Bus Camera Reinspection Linking (GPS & Issue Category Match)
                  </span>
                </div>
                <p className="text-[11px] text-[#AABDC2] mt-0.5">
                  If a municipal bus camera later captures the same GPS location (within{' '}
                  {complaint.dedup_threshold_meters ?? 50}m) and issue category, CivicEye links the
                  new detection here as reinspection evidence.
                </p>
              </div>

              {canUpdate && (
                <button
                  type="button"
                  disabled={isSimulatingBusPass}
                  onClick={handleSimulateReinspectionPass}
                  className="px-3 py-1.5 rounded-lg bg-[#1C3038] hover:bg-[#2A4550] border border-[#00D1FF]/40 text-[#00D1FF] font-semibold transition-colors disabled:opacity-50"
                >
                  {isSimulatingBusPass
                    ? 'Simulating Bus Pass...'
                    : 'Simulate Bus Reinspection Pass (Demo)'}
                </button>
              )}
            </div>

            {complaint.repair_verification?.reinspection_detections &&
            complaint.repair_verification.reinspection_detections.length > 0 ? (
              <div className="space-y-2">
                {complaint.repair_verification.reinspection_detections.map((det) => (
                  <div
                    key={det.detection_id}
                    className="p-3 rounded-lg bg-[#1C3038] border border-amber-500/40 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-amber-300">
                          Bus {det.bus_number} Reinspection Capture
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                          {det.distance_meters}m from original GPS
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#101C23] text-[#00D1FF] font-mono text-[10px]">
                          Confidence: {(det.confidence * 100).toFixed(0)}%
                        </span>
                        {det.is_simulated && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-semibold">
                            SIMULATED DEMO PASS
                          </span>
                        )}
                      </div>
                      <p className="text-[#F4F7F7] text-[11px]">{det.description}</p>
                    </div>
                    <span className="text-[11px] text-[#AABDC2] font-mono">
                      {safeFormat(det.timestamp, 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-[#AABDC2] py-2">
                No subsequent bus camera reinspection detections recorded at this GPS location yet.
              </div>
            )}
          </div>
        </div>

        {/* Geo-Deduplication Verification Card */}
        {canUpdate && (
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#F4F7F7] text-sm flex items-center gap-2">
                  <GitMerge size={16} className="text-[#91C8BD]" />
                  Geo-Deduplication & Duplicate Verification
                </h2>
                <p className="text-xs text-[#AABDC2] mt-0.5">
                  Checks geographic proximity (active threshold:{' '}
                  <span className="font-mono text-[#91C8BD] font-semibold">
                    {complaint.dedup_threshold_meters ?? 50}m
                  </span>
                  ), matching issue category ({categoryLabel(complaint.category)}), and timestamps.
                  Unrelated categories are never merged.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (manualMergeId.trim()) handleMergeDuplicate(manualMergeId.trim())
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={manualMergeId}
                  onChange={(e) => setManualMergeId(e.target.value)}
                  placeholder="Merge ID (e.g. CE-202609-0002)"
                  className="bg-[#101C23] border border-[#2A4550] focus:border-[#367F77] rounded-lg px-3 py-1.5 text-xs text-[#F4F7F7] placeholder-[#AABDC2]/60 font-mono outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualMergeId.trim() || mergingId !== null}
                  className="px-3 py-1.5 rounded-lg bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7] text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  Merge Duplicate
                </button>
              </form>
            </div>

            {potentialDuplicates.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-[#101C23] border border-[#2A4550] flex items-center justify-between text-xs text-[#AABDC2]">
                <span>
                  No unmerged nearby open reports of category{' '}
                  <strong className="text-[#F4F7F7]">{categoryLabel(complaint.category)}</strong>{' '}
                  detected within proximity.
                </span>
                <span className="font-mono text-[#91C8BD]">
                  {complaint.observation_count ?? 1} total observation(s) recorded
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-amber-300">
                  Potential Nearby Duplicate Reports ({potentialDuplicates.length}) — Staff
                  Verification Required:
                </p>
                {potentialDuplicates.map((dup) => (
                  <div
                    key={dup.id}
                    className="p-3.5 rounded-xl bg-[#101C23] border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#91C8BD]">
                          {dup.complaint_id}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono font-semibold">
                          {dup.distance_meters}m away
                        </span>
                        <span className="text-[#AABDC2]">
                          Source: {dup.source === 'bus_camera' ? `Bus #${dup.bus_id}` : 'Citizen'}
                        </span>
                        <StatusBadge status={dup.status} />
                      </div>
                      <p className="text-[#F4F7F7]">{dup.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/complaints/${dup.complaint_id}`)}
                        className="px-3 py-1.5 rounded-lg bg-[#1C3038] hover:bg-[#2A4550] text-[#F4F7F7] font-medium transition-colors"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMergeDuplicate(dup.complaint_id)}
                        disabled={mergingId === dup.complaint_id}
                        className="px-3 py-1.5 rounded-lg bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <GitMerge size={13} />
                        {mergingId === dup.complaint_id
                          ? 'Merging…'
                          : 'Confirm & Merge Duplicate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin Assignment, Priority & Status Controls */}
        {canUpdate && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Assign & Prioritize */}
            <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-[#F4F7F7] text-sm flex items-center gap-2">
                <Flag size={16} className="text-[#91C8BD]" />
                {isAdmin
                  ? 'Automated Department Routing & Officer Assignment'
                  : 'Assigned Department & Priority Controls'}
              </h2>

              {/* Automated Department Suggestion Banner */}
              <div className="p-3 rounded-xl bg-[#101C23] border border-[#367F77]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#91C8BD] shrink-0" />
                  <div>
                    <span className="text-[#AABDC2] block">
                      {isAdmin
                        ? `Auto-Suggested Department for ${categoryLabel(complaint.category)}:`
                        : 'Assigned Municipal Department:'}
                    </span>
                    <span className="font-bold text-[#F4F7F7]">
                      {isAdmin
                        ? suggestedDept
                        : complaint.department_info?.name ||
                          complaint.department ||
                          user?.department}
                    </span>
                  </div>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={(e) => handleAssignSubmit(e as any, suggestedDept)}
                    className="px-3 py-1.5 rounded-lg bg-[#367F77]/25 hover:bg-[#367F77] text-[#91C8BD] hover:text-[#F4F7F7] border border-[#367F77]/50 font-semibold transition-colors"
                  >
                    Confirm Suggested Route
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded bg-[#1C3038] border border-[#2A4550] text-[#91C8BD] font-semibold">
                    Department Officer Scope
                  </span>
                )}
              </div>

              {/* Priority selector */}
              <div>
                <label className="block text-xs text-[#AABDC2] mb-1.5">
                  Complaint Priority / SLA Severity
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'critical'] as ComplaintSeverity[]).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => handlePriorityChange(sev)}
                      disabled={isUpdating}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold uppercase border transition-all ${
                        selectedSeverity === sev
                          ? sev === 'critical'
                            ? 'bg-red-500/20 border-red-500 text-red-300'
                            : sev === 'high'
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                            : sev === 'medium'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-[#101C23] border-[#2A4550] text-[#AABDC2] hover:text-[#F4F7F7]'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {isAdmin ? (
                <form
                  onSubmit={(e) => handleAssignSubmit(e)}
                  className="space-y-3 pt-2 border-t border-[#2A4550]"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#AABDC2] mb-1">
                        Confirm or Override Department
                      </label>
                      <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full bg-[#101C23] border border-[#2A4550] rounded-lg px-3 py-2 text-xs text-[#F4F7F7] outline-none focus:border-[#367F77]"
                      >
                        <option value="">Select Department…</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-[#AABDC2] mb-1">Assigned Officer</label>
                      <select
                        value={selectedOfficerId}
                        onChange={(e) => setSelectedOfficerId(e.target.value)}
                        className="w-full bg-[#101C23] border border-[#2A4550] rounded-lg px-3 py-2 text-xs text-[#F4F7F7] outline-none focus:border-[#367F77]"
                      >
                        <option value="">Unassigned / Department Queue</option>
                        {staff.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.full_name || u.username} ({u.department || u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="w-full py-2 rounded-lg bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7] font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    Save Department & Officer Assignment
                  </button>
                </form>
              ) : (
                <div className="pt-2 border-t border-[#2A4550] text-xs text-[#AABDC2]">
                  Cross-department routing is managed by Municipal Administrators. You can update priority, field notes, resolution status, and inspection evidence for your assigned department below.
                </div>
              )}
            </div>

            {/* Workflow Status Transition */}
            <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="font-semibold text-[#F4F7F7] text-sm mb-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#91C8BD]" />
                  Update Resolution Progress & Status
                </h2>

                <div className="mb-3">
                  <label className="block text-xs text-[#AABDC2] mb-1">
                    Official Resolution / Inspection Note
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter field inspection findings, work order number, or resolution details…"
                    rows={3}
                    className="w-full bg-[#101C23] border border-[#2A4550] focus:border-[#367F77] rounded-lg px-3 py-2 text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none text-xs resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {nextStatuses.length === 0 ? (
                  <p className="text-xs text-[#AABDC2]">
                    This complaint is closed. No further status transitions available.
                  </p>
                ) : (
                  nextStatuses.map((status) => {
                    const isResolve = status === 'resolved'
                    const isReopen = status === 'new'
                    const isClose = status === 'closed'
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusUpdate(status)}
                        disabled={isUpdating}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                          isResolve
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : isReopen
                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                            : isClose
                            ? 'bg-[#101C23] hover:bg-[#2A4550] border border-[#2A4550] text-[#F4F7F7]'
                            : 'bg-[#367F77] hover:bg-[#2b6660] text-[#F4F7F7]'
                        }`}
                      >
                        {isUpdating ? <Loader size={13} className="animate-spin" /> : null}
                        {isResolve ? <CheckCircle2 size={13} /> : null}
                        {isReopen ? <RotateCcw size={13} /> : null}
                        {isClose ? <XCircle size={13} /> : null}
                        Mark as {status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </button>
                    )
                  })
                )}
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          </div>
        )}

        {/* Evidence Gallery & Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-[#F4F7F7] text-sm flex items-center gap-2">
              <ImageIcon size={16} className="text-[#91C8BD]" />
              Inspection & Resolution Evidence
            </h2>

            {complaint.before_image_url || complaint.after_image_url || complaint.image_url ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(complaint.before_image_url || complaint.image_url) && (
                    <div>
                      <p className="text-[#AABDC2] text-xs mb-1 font-medium">
                        Before / Initial Detection
                      </p>
                      <img
                        src={complaint.before_image_url || complaint.image_url || undefined}
                        alt="Before"
                        className="w-full h-40 object-cover rounded-xl border border-[#2A4550]"
                      />
                    </div>
                  )}
                  {complaint.after_image_url && (
                    <div>
                      <p className="text-emerald-400 text-xs mb-1 font-medium">
                        After / Resolution Proof
                      </p>
                      <img
                        src={complaint.after_image_url}
                        alt="After"
                        className="w-full h-40 object-cover rounded-xl border border-emerald-500/40"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-[#AABDC2] border border-dashed border-[#2A4550] rounded-xl">
                <ImageIcon size={28} className="mx-auto mb-1.5 opacity-40" />
                <p className="text-xs">No visual evidence uploaded yet</p>
              </div>
            )}

            {/* Upload Resolution Evidence Form */}
            {canUpdate && (
              <form
                onSubmit={handleUploadEvidence}
                className="pt-3 border-t border-[#2A4550] space-y-3 text-xs"
              >
                <p className="font-semibold text-[#F4F7F7] flex items-center gap-1.5">
                  <Upload size={13} className="text-[#91C8BD]" />
                  Attach Field Resolution Evidence
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEvidenceStage('before')}
                    className={`py-1.5 rounded-lg border font-medium ${
                      evidenceStage === 'before'
                        ? 'bg-[#367F77]/20 border-[#367F77] text-[#91C8BD]'
                        : 'bg-[#101C23] border-[#2A4550] text-[#AABDC2]'
                    }`}
                  >
                    Before Repair Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvidenceStage('after')}
                    className={`py-1.5 rounded-lg border font-medium ${
                      evidenceStage === 'after'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#101C23] border-[#2A4550] text-[#AABDC2]'
                    }`}
                  >
                    After Resolution Proof
                  </button>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-[#AABDC2] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#101C23] file:text-[#91C8BD] hover:file:bg-[#2A4550]"
                />

                <input
                  type="text"
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="Inspection notes (or leave file blank to generate stamped field certificate)…"
                  className="w-full bg-[#101C23] border border-[#2A4550] rounded-lg px-3 py-2 text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none"
                />

                <button
                  type="submit"
                  disabled={isUploadingEvidence}
                  className="w-full py-2 rounded-lg bg-[#101C23] hover:bg-[#2A4550] border border-[#2A4550] text-[#91C8BD] font-semibold transition-colors"
                >
                  {isUploadingEvidence ? 'Uploading Evidence…' : 'Upload & Log Evidence'}
                </button>
              </form>
            )}
          </div>

          {/* Status History & Audit Logs */}
          <div className="bg-[#1C3038] border border-[#2A4550] rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-[#F4F7F7] text-sm mb-3 flex items-center gap-2">
                <Clock size={16} className="text-[#91C8BD]" />
                Status & Deduplication Timeline
              </h2>
              {complaint.status_history && complaint.status_history.length > 0 ? (
                <div className="space-y-3 relative">
                  {complaint.status_history.map((entry, idx) => (
                    <div key={entry.id} className="flex gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-[#101C23] border-2 border-[#367F77] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={entry.new_status} />
                          {idx === 0 && (
                            <span className="text-[#91C8BD] text-[11px] font-semibold">Latest</span>
                          )}
                        </div>
                        {entry.notes && (
                          <p className="text-[#F4F7F7] text-xs mt-1">{entry.notes}</p>
                        )}
                        <p className="text-[#AABDC2] text-[11px] mt-0.5">
                          {entry.changed_by_name && `By ${entry.changed_by_name} · `}
                          {safeFormat(entry.changed_at, 'dd MMM yyyy, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#AABDC2] text-xs">No status transitions recorded yet.</p>
              )}
            </div>

            {/* Immutable Audit Logs */}
            <div className="pt-4 border-t border-[#2A4550]">
              <h3 className="font-semibold text-[#F4F7F7] text-sm mb-3 flex items-center gap-2">
                <Shield size={15} className="text-[#91C8BD]" />
                Audit Trail ({complaint.audit_logs?.length ?? 0})
              </h3>
              {!complaint.audit_logs || complaint.audit_logs.length === 0 ? (
                <p className="text-[#AABDC2] text-xs">No administrative audit entries yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {complaint.audit_logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-[#101C23] border border-[#2A4550] text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#367F77]/20 text-[#91C8BD] font-semibold">
                          {log.action}
                        </span>
                        <p className="text-[#F4F7F7] mt-1">{log.details}</p>
                        <p className="text-[11px] text-[#AABDC2] mt-0.5">
                          Actor: {log.actor_name} ({log.actor_role})
                        </p>
                      </div>
                      <span className="text-[11px] text-[#AABDC2] whitespace-nowrap">
                        {safeFormat(log.created_at, 'dd MMM HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
