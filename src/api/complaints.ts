import client from './client'
import type {
  AuditLogItem,
  Complaint,
  ComplaintFilters,
  ComplaintListResponse,
  ComplaintSeverity,
  ComplaintStatus,
  Department,
  Evidence,
  MapComplaint,
  RoadHealthOverviewResponse,
  RoadSegmentHealth,
  User,
  VerificationDecisionStatus,
  VisionComparisonResult,
} from '../types'

export async function getComplaints(
  filters: ComplaintFilters = {}
): Promise<ComplaintListResponse> {
  const limit = filters.page_size ?? 50
  const skip = ((filters.page ?? 1) - 1) * limit

  const params: Record<string, string | number> = {
    skip,
    limit,
  }
  if (filters.status) params.status = filters.status
  if (filters.category) params.category = filters.category
  if (filters.severity) params.severity = filters.severity
  if (filters.department || filters.department_name) {
    params.department = (filters.department || filters.department_name) as string
  }
  if (filters.source) params.source = filters.source
  if (filters.bus_id) params.bus_id = filters.bus_id
  if (filters.search) params.search = filters.search

  const { data } = await client.get('/complaints', { params })
  if (Array.isArray(data)) {
    return { items: data, total: data.length }
  }
  return {
    items: data?.items ?? [],
    total: data?.total ?? (data?.items?.length ?? 0),
  }
}

export async function getComplaint(id: string | number): Promise<Complaint> {
  const { data } = await client.get(`/complaints/${encodeURIComponent(String(id))}`)
  return data
}

export async function createComplaint(payload: Partial<Complaint>): Promise<Complaint> {
  const { data } = await client.post('/complaints', payload)
  return data
}

export async function updateComplaintStatus(
  id: string | number,
  status: ComplaintStatus,
  notes?: string
): Promise<Complaint> {
  const { data } = await client.put(`/complaints/${encodeURIComponent(String(id))}/status`, {
    status,
    notes,
  })
  return data
}

export async function updateComplaintPriority(
  id: string | number,
  severity: ComplaintSeverity,
  notes?: string
): Promise<Complaint> {
  const { data } = await client.put(`/complaints/${encodeURIComponent(String(id))}/priority`, {
    severity,
    notes,
  })
  return data
}

export async function assignComplaint(
  id: string | number,
  payload: {
    department_id?: number
    department_name?: string
    assigned_to?: number
    assigned_to_id?: number
    assigned_to_name?: string
    severity?: ComplaintSeverity
    notes?: string
  }
): Promise<Complaint> {
  const { data } = await client.put(`/complaints/${encodeURIComponent(String(id))}/assign`, {
    department_id: payload.department_id,
    assigned_to: payload.assigned_to ?? payload.assigned_to_id,
    severity: payload.severity,
    notes: payload.notes,
  })
  return data
}

export async function uploadComplaintEvidence(
  id: string | number,
  options:
    | File
    | {
        file?: File
        image_data?: string
        stage?: 'before' | 'after'
        notes?: string
      },
  imageType: 'detection' | 'citizen' | 'resolution' = 'resolution',
  notes?: string
): Promise<{ evidence: Evidence; complaint: Complaint }> {
  const form = new FormData()
  if (options instanceof File) {
    form.append('file', options)
    form.append('image_type', imageType)
    if (notes) form.append('notes', notes)
  } else {
    if (options.file) {
      form.append('file', options.file)
    } else if (options.image_data) {
      const svgText = decodeURIComponent(
        options.image_data.replace(/^data:image\/svg\+xml;utf8,/, '')
      )
      const blob = new Blob([svgText], { type: 'image/png' })
      const syntheticFile = new File([blob], `evidence-${Date.now()}.png`, {
        type: 'image/png',
      })
      form.append('file', syntheticFile)
    }
    form.append('image_type', options.stage === 'before' ? 'detection' : 'resolution')
    if (options.notes) form.append('notes', options.notes)
  }

  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(id))}/evidence`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  )
  const updatedComplaint = await getComplaint(id)
  return { evidence: data, complaint: updatedComplaint }
}

export async function getMapComplaints(filters?: {
  category?: string
  status?: string
  severity?: string
  source?: string
}): Promise<MapComplaint[]> {
  const { data } = await client.get('/map/complaints', { params: filters })
  return Array.isArray(data) ? data : []
}

export async function getHeatmapPoints(): Promise<
  { lat: number; lng: number; weight: number }[]
> {
  const { data } = await client.get('/map/heatmap')
  return Array.isArray(data) ? data : []
}

export async function getDepartments(): Promise<Department[]> {
  const { data } = await client.get('/departments')
  return Array.isArray(data) ? data : []
}

export async function getOfficers(): Promise<User[]> {
  const { data } = await client.get('/officers')
  return Array.isArray(data) ? data : []
}

export const getStaffUsers = getOfficers

export async function getAuditLogs(limit = 50): Promise<AuditLogItem[]> {
  const { data } = await client.get('/audit-logs', { params: { limit } })
  const list = Array.isArray(data) ? data : []
  return list.slice(0, limit).map((item: any) => ({
    ...item,
    complaint_id: item.entity_type === 'complaint' ? item.entity_id : item.complaint_id,
    created_at: item.created_at || item.timestamp,
  }))
}

export async function mergeDuplicateComplaint(
  primaryId: number | string,
  duplicateId: number | string
): Promise<Complaint> {
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(primaryId))}/merge`,
    { duplicate_id: duplicateId }
  )
  return data
}

export async function getDeduplicationSettings(): Promise<{ threshold_meters: number }> {
  const { data } = await client.get('/settings/deduplication')
  return data
}

export async function updateDeduplicationSettings(
  thresholdMeters: number
): Promise<{ threshold_meters: number }> {
  const { data } = await client.put('/settings/deduplication', {
    threshold_meters: thresholdMeters,
  })
  return data
}

// ─── Feature 1: Road Health Score API ──────────────────────────────────────

export async function getRoadHealthOverview(): Promise<RoadHealthOverviewResponse> {
  const { data } = await client.get('/road-health')
  return data
}

export async function getRoadSegmentDetail(segmentId: string): Promise<RoadSegmentHealth> {
  const { data } = await client.get(`/road-health/${encodeURIComponent(segmentId)}`)
  return data
}

// ─── Feature 2: Smart Repair Priority API ──────────────────────────────────

export async function getSmartPriorityQueue(filters?: {
  department?: string
  priority?: ComplaintSeverity | ''
  sort_by?: 'score' | 'severity' | 'age' | 'road_health' | 'reports'
  sort_dir?: 'asc' | 'desc'
  search?: string
}): Promise<{
  items: Complaint[]
  total: number
  duplicates_consolidated_count: number
  algorithm_note: string
}> {
  const { data } = await client.get('/priority-queue', { params: filters })
  return data
}

export async function overrideSmartPriority(
  id: string | number,
  payload: {
    priority: ComplaintSeverity
    reason: string
    department_id?: number
    assigned_to?: number
  }
): Promise<Complaint> {
  const { data } = await client.put(`/complaints/${encodeURIComponent(String(id))}/priority`, {
    severity: payload.priority,
    notes: payload.reason,
    department_id: payload.department_id,
    assigned_to: payload.assigned_to,
    is_manual_override: true,
  })
  return data
}

export const overrideComplaintSmartPriority = overrideSmartPriority

// ─── Feature 3: Before & After Repair Verification API ─────────────────────

export async function uploadVerificationAfterPhoto(
  id: string | number,
  payload: {
    file?: File | null
    image_base64?: string
    image_data?: string
    notes?: string
    latitude?: number
    longitude?: number
    address?: string
    is_simulated?: boolean
  }
): Promise<Complaint> {
  const form = new FormData()
  if (payload.file) {
    form.append('file', payload.file)
  }
  const b64 = payload.image_base64 || payload.image_data
  if (b64) {
    form.append('image_base64', b64)
  }
  if (payload.notes) {
    form.append('notes', payload.notes)
  }
  if (payload.latitude !== undefined) {
    form.append('latitude', String(payload.latitude))
  }
  if (payload.longitude !== undefined) {
    form.append('longitude', String(payload.longitude))
  }
  if (payload.is_simulated !== undefined) {
    form.append('is_simulated', String(payload.is_simulated))
  }
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(id))}/verification/upload-after`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  )
  return data
}

export const uploadRepairVerificationAfterPhoto = uploadVerificationAfterPhoto

export async function submitRepairVerificationDecision(
  id: string | number,
  payload: {
    decision: VerificationDecisionStatus
    notes?: string
    public_summary?: string
    public_update_approved?: boolean
  }
): Promise<Complaint> {
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(id))}/verification/decision`,
    payload
  )
  return data
}

export async function runRepairVisionComparison(
  id: string | number
): Promise<{
  comparison: VisionComparisonResult
  complaint: Complaint
}> {
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(id))}/verification/compare`
  )
  return data
}

export const runRepairVerificationComparison = runRepairVisionComparison

export async function simulateReinspectionBusPass(payload: {
  bus_id?: number
  latitude: number
  longitude: number
  category: string
}): Promise<unknown> {
  const { data } = await client.post('/detections/analyze', {
    mode: 'simulation',
    bus_id: payload.bus_id || 1,
    latitude: payload.latitude,
    longitude: payload.longitude,
    gps_source: 'simulated_route',
    auto_create_complaints: true,
    override_category: payload.category,
  })
  return data
}

export async function resolveComplaintWithEvidence(
  id: string | number,
  payload: {
    file?: File | null
    image_data?: string
    image_base64?: string
    after_image_url?: string
    resolution_notes: string
    public_summary?: string
  }
): Promise<Complaint> {
  const form = new FormData()
  if (payload.file) {
    form.append('file', payload.file)
  }
  if (payload.image_data) {
    form.append('image_data', payload.image_data)
  }
  if (payload.image_base64) {
    form.append('image_base64', payload.image_base64)
  }
  if (payload.after_image_url) {
    form.append('after_image_url', payload.after_image_url)
  }
  form.append('resolution_notes', payload.resolution_notes)
  if (payload.public_summary) {
    form.append('public_summary', payload.public_summary)
  }
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(id))}/resolve`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  )
  return data.data ?? data.complaint ?? data
}



