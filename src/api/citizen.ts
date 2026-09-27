import client from './client'
import type { Complaint, ComplaintSeverity } from '../types'

export interface AIClassificationResult {
  category: string
  confidence: number | null
  low_confidence?: boolean
  confidence_warning?: string | null
  severity: ComplaintSeverity
  department_id: number
  department_name: string
  suggested_description: string
  detected_features: string[]
  media_type: 'image' | 'video' | string
  ai_model?: string
  is_simulated?: boolean
}

export type AiClassifyResult = AIClassificationResult
export type AIClassificationResponse = AIClassificationResult

export interface PotentialDuplicateWarningItem {
  id: number
  complaint_id: string
  category: string
  description: string
  status: string
  severity: ComplaintSeverity
  department_name: string
  address?: string | null
  latitude: number
  longitude: number
  distance_meters: number | null
  description_similarity: number
  match_score: number
  match_reasons: string[]
  observation_count: number
  first_detected_at: string
  before_image_url?: string | null
}

export interface DuplicateCheckResponse {
  has_duplicates: boolean
  duplicates: PotentialDuplicateWarningItem[]
}

export interface CitizenUserSession {
  access_token: string
  token_type: string
  user: {
    id: number
    username: string
    full_name: string
    email: string
    role: 'citizen'
    is_active: boolean
    created_at: string
  }
}

export interface UploadedMediaResult {
  url: string
  filename: string
  media_type: 'image' | 'video'
  size_bytes: number
}

export async function uploadCitizenMedia(file: File): Promise<UploadedMediaResult> {
  const form = new FormData()
  form.append('media', file)
  const { data } = await client.post('/citizen/upload-media', form, {
    headers: { 'Content-Type': undefined as unknown as string },
  })
  return data
}

export async function classifyCivicIssue(payload: {
  text?: string
  media_name?: string
  media_type?: string
  media_url?: string
  image_base64?: string
}): Promise<AIClassificationResult> {
  const { data } = await client.post('/citizen/ai-classify', payload)
  return data
}

export const classifyCitizenIssue = classifyCivicIssue
export const classifyCitizenReport = classifyCivicIssue

export async function submitCitizenComplaint(payload: {
  category: string
  description: string
  latitude: number
  longitude: number
  address?: string
  severity?: ComplaintSeverity
  department_id?: number
  media_url?: string | null
  media_type?: 'image' | 'video' | null
  image_base64?: string | null
  is_anonymous?: boolean
  contact_name?: string
  contact_phone?: string
  honeypot?: string
  force_new?: boolean
  corroborate_complaint_id?: string | number
}): Promise<Complaint> {
  const { data } = await client.post('/complaints', payload)
  return data
}

export const createPublicComplaint = submitCitizenComplaint

export async function checkCitizenDuplicates(payload: {
  category: string
  description?: string
  latitude?: number | null
  longitude?: number | null
}): Promise<DuplicateCheckResponse> {
  const { data } = await client.post('/citizen/check-duplicates', payload)
  return data
}

export async function confirmCitizenDuplicate(
  complaintId: string | number,
  payload?: {
    notes?: string
    media_url?: string | null
  }
): Promise<Complaint> {
  const { data } = await client.post(
    `/complaints/${encodeURIComponent(String(complaintId))}/confirm-duplicate`,
    payload || {}
  )
  return data
}

export async function registerCitizenAccount(payload: {
  full_name: string
  email: string
  password: string
}): Promise<CitizenUserSession> {
  const { data } = await client.post('/citizen/register', payload)
  return data
}

export async function loginCitizenAccount(payload: {
  username: string
  password: string
}): Promise<CitizenUserSession> {
  const { data } = await client.post('/citizen/login', payload)
  return data
}

export async function getCitizenMyComplaints(
  trackingIds: string[] = [],
  citizenToken?: string | null
): Promise<Complaint[]> {
  const { data } = await client.get('/citizen/my-complaints', {
    params: trackingIds.length > 0 ? { ids: trackingIds.join(',') } : undefined,
    headers: citizenToken ? { Authorization: `Bearer ${citizenToken}` } : undefined,
  })
  return Array.isArray(data) ? data : []
}

export async function trackComplaintPublic(trackingId: string): Promise<Complaint> {
  const { data } = await client.get(`/complaints/public/track/${encodeURIComponent(trackingId.trim())}`)
  return data
}

export const trackPublicComplaint = trackComplaintPublic

