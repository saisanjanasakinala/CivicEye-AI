import client from './client'
import type {
  AnalyzeRequest,
  Bus,
  BusDetail,
  BusRoute,
  DetectionResult,
  GpsPoint,
  RouteWaypoint,
} from '../types'

export type { BusRoute, RouteWaypoint }

export interface AnalyzeResponse {
  detections: DetectionResult[]
  complaints_created: string[]
  complaints_updated: string[]
  ai_source?: 'gemini-3-flash-preview' | 'gemini-3.8-flash' | 'simulation' | 'unavailable'
  ai_error?: string | null
}

export async function getBuses(filters?: {
  search?: string
  status?: string
  gps_status?: string
}): Promise<Bus[]> {
  const { data } = await client.get('/buses', {
    params: {
      ...(filters?.search ? { search: filters.search } : {}),
      ...(filters?.status || filters?.gps_status
        ? { status: filters.status || filters.gps_status }
        : {}),
    },
  })
  return Array.isArray(data) ? data : []
}

export async function getBusDetail(busId: number | string): Promise<BusDetail> {
  const { data } = await client.get(`/buses/${encodeURIComponent(String(busId))}`)
  return data
}

export async function createBus(payload: Partial<Bus>): Promise<Bus> {
  const { data } = await client.post('/buses', payload)
  return data
}

export async function updateBus(busId: number, payload: Partial<Bus>): Promise<Bus> {
  const { data } = await client.put(`/buses/${busId}`, payload)
  return data
}

export async function deactivateBus(busId: number): Promise<Bus> {
  const { data } = await client.delete(`/buses/${busId}`)
  return data
}

export async function getBusRoute(busId: number): Promise<BusRoute> {
  const { data } = await client.get(`/buses/${busId}/route`)
  return data
}

export async function getBusRoutes(): Promise<BusRoute[]> {
  const buses = await getBuses()
  const routes = await Promise.all(
    buses.map((b) => getBusRoute(b.id).catch(() => null))
  )
  return routes.filter((r): r is BusRoute => r !== null)
}

export async function getBusHistory(busId: number): Promise<GpsPoint[]> {
  const { data } = await client.get(`/buses/${busId}/history`)
  return Array.isArray(data) ? data : []
}

export async function updateBusGps(
  busId: number,
  payload: {
    latitude: number
    longitude: number
    speed?: number
    source?: 'live' | 'simulated'
    is_simulated?: boolean
  }
) {
  const source = payload.source || (payload.is_simulated ? 'simulated' : 'live')
  const { data } = await client.post(`/buses/${busId}/gps`, {
    latitude: payload.latitude,
    longitude: payload.longitude,
    speed: payload.speed,
    source,
  })
  return data
}

export const pushBusGps = updateBusGps

export async function getBusDetections(busId: number): Promise<DetectionResult[]> {
  const { data } = await client.get(`/buses/${busId}/detections`)
  return Array.isArray(data) ? data : []
}

export async function getRecentDetections(
  limit = 15,
  busId?: number
): Promise<DetectionResult[]> {
  const { data } = await client.get('/detections', {
    params: { limit, ...(busId ? { bus_id: busId } : {}) },
  })
  return Array.isArray(data) ? data : []
}

export async function analyzeFrame(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const { data } = await client.post('/detections/analyze', payload)
  return data
}
