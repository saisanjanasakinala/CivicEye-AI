import client from './client'
import type { Complaint } from '../types'

export interface AIClassificationResult {
  category: string
  confidence: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  department_id: number
  department_name: string
  suggested_description: string
  detected_features: string[]
  media_type?: string
}

export async function classifyCivicIssue(params: {
  text?: string
  media_name?: string
  media_type?: string
}): Promise<AIClassificationResult> {
  const { data } = await client.post('/citizen/ai-classify', params)
  return data
}

export async function uploadCitizenMedia(file: File): Promise<{
  url: string
  filename: string
  media_type: 'image' | 'video'
  size_bytes: number
}> {
  const formData = new FormData()
  formData.append('media', file)
  const { data } = await client.post('/citizen/upload-media', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function submitCitizenComplaint(payload: {
  category: string
  description: string
  latitude: number
  longitude: number
  address?: string
  severity?: string
  media_url?: string
  media_type?: 'image' | 'video'
  is_anonymous: boolean
  contact_name?: string
  contact_phone?: string
}): Promise<Complaint> {
  const { data } = await client.post('/complaints', payload)
  return data
}

export async function trackComplaintPublic(trackingId: string): Promise<Complaint> {
  const cleanId = encodeURIComponent(trackingId.trim())
  const { data } = await client.get(`/complaints/public/track/${cleanId}`)
  return data
}
