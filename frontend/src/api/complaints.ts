import client from './client'
import type { Complaint, ComplaintListResponse, ComplaintFilters, MapComplaint } from '../types'

export async function getComplaints(filters: ComplaintFilters = {}): Promise<ComplaintListResponse> {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.status) params.set('status', filters.status)
  if (filters.severity) params.set('severity', filters.severity)
  if (filters.page) params.set('skip', String((filters.page - 1) * (filters.page_size ?? 50)))
  if (filters.page_size) params.set('limit', String(filters.page_size))
  const { data } = await client.get<ComplaintListResponse>(`/complaints?${params}`)
  return data ?? { items: [], total: 0 }
}

export async function getComplaint(id: string): Promise<Complaint> {
  const { data } = await client.get<Complaint>(`/complaints/${id}`)
  return data
}

export async function createComplaint(payload: Record<string, unknown>): Promise<Complaint> {
  const { data } = await client.post<Complaint>('/complaints/', payload)
  return data
}

export async function updateComplaintStatus(
  complaintId: string,
  status: string,
  notes?: string
): Promise<Complaint> {
  const { data } = await client.put<Complaint>(`/complaints/${complaintId}/status`, { status, notes })
  return data
}

export async function assignComplaint(
  complaintId: string,
  payload: { department_id?: number; assigned_to?: number; notes?: string }
): Promise<Complaint> {
  const { data } = await client.put<Complaint>(`/complaints/${complaintId}/assign`, payload)
  return data
}

export async function getMapComplaints(filters?: {
  category?: string
  status?: string
  severity?: string
}): Promise<MapComplaint[]> {
  const params = new URLSearchParams()
  if (filters?.category) params.set('category', filters.category)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.severity) params.set('severity', filters.severity)
  const { data } = await client.get<MapComplaint[]>(`/map/complaints?${params}`)
  return Array.isArray(data) ? data : []
}

export async function uploadEvidence(
  complaintId: string,
  file: File,
  imageType = 'detection'
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  await client.post(`/complaints/${complaintId}/evidence?image_type=${imageType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
