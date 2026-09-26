import client from './client'
import type { Bus } from '../types'

interface BusRouteResponse {
  id: number
  bus_id: number
  name: string
  waypoints: Array<{ lat: number; lng: number; name: string }>
}

export async function getBuses(): Promise<Bus[]> {
  const { data } = await client.get<Bus[]>('/buses')
  return Array.isArray(data) ? data : []
}

export async function getBusRoute(id: number): Promise<BusRouteResponse | null> {
  const { data } = await client.get<BusRouteResponse>(`/buses/${id}/route`)
  return data
}

export async function recordGPS(busId: number, lat: number, lng: number, speed = 0): Promise<void> {
  await client.post(`/buses/${busId}/gps`, { latitude: lat, longitude: lng, speed })
}
