import client from './client'
import type { Notification, NotificationListResponse } from '../types'

export async function getNotifications(): Promise<NotificationListResponse> {
  const { data } = await client.get<NotificationListResponse>('/notifications/')
  return data ?? { notifications: [], unread_count: 0 }
}

export async function markNotificationRead(id: number): Promise<void> {
  await client.put(`/notifications/${id}/read`)
}

export async function markAllRead(): Promise<void> {
  await client.put('/notifications/read-all')
}

export async function getUnreadCount(): Promise<number> {
  const data = await getNotifications()
  return data.unread_count
}
