import client from './client'
import type { DetectionResult } from '../types'

interface AnalyzePayload {
  bus_id: number
  bus_number?: string
  latitude: number
  longitude: number
  image_base64?: string
}

interface AnalyzeResponse {
  detections: DetectionResult[]
  complaints_created: string[]
  complaints_updated: string[]
}

export async function analyzeFrame(req: AnalyzePayload): Promise<DetectionResult[]> {
  const payload = {
    bus_id: req.bus_id,
    latitude: req.latitude,
    longitude: req.longitude,
    image_base64: req.image_base64 ?? null,
    auto_create_complaints: true,
  }
  const { data } = await client.post<AnalyzeResponse>('/detections/analyze', payload)
  // data is already unwrapped from {success, data, message} by interceptor
  if (data && typeof data === 'object' && 'detections' in data) {
    return (data as AnalyzeResponse).detections ?? []
  }
  return Array.isArray(data) ? data : []
}

export async function getRecentDetections(busId?: number, limit = 10): Promise<DetectionResult[]> {
  const params = new URLSearchParams()
  if (busId) params.set('bus_id', String(busId))
  params.set('limit', String(limit))
  const { data } = await client.get<DetectionResult[]>(`/detections?${params}`)
  return Array.isArray(data) ? data : []
}
