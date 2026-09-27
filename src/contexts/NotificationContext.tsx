import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'
import type { Notification } from '../types'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  refresh: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    setIsLoading(true)
    try {
      const { data } = await client.get('/notifications')
      const list = data?.notifications ?? (Array.isArray(data) ? data : [])
      setNotifications(list)
      setUnreadCount(
        typeof data?.unread_count === 'number'
          ? data.unread_count
          : list.filter((n: Notification) => !n.is_read).length
      )
    } catch {
      // Keep existing state on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const markRead = useCallback(async (id: number) => {
    try {
      await client.put(`/notifications/${id}/read`)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // ignore
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await client.put('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        refresh,
        markRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return ctx
}
