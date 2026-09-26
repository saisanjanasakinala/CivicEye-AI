import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  FileText,
  Activity,
  UserCheck,
  CheckCircle2,
  Info,
  Circle,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { useNotifications } from '../contexts/NotificationContext'
import type { NotificationType } from '../types'
import { safeFormatDistanceToNow } from '../utils/dateHelpers'

const typeIcons: Record<string, React.ReactNode> = {
  complaint_created: <FileText size={16} />,
  status_changed: <Activity size={16} />,
  complaint_assigned: <UserCheck size={16} />,
  complaint_resolved: <CheckCircle2 size={16} />,
  system: <Info size={16} />,
  info: <Info size={16} />,
  warning: <Activity size={16} />,
  success: <CheckCircle2 size={16} />,
  error: <Circle size={16} />,
}

const typeColors: Record<string, string> = {
  complaint_created: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  status_changed: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  complaint_assigned: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  complaint_resolved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  system: 'text-slate-400 bg-slate-700/50 border-slate-600/30',
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, refresh, markRead, markAllAsRead } =
    useNotifications()

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Bell size={20} className="text-teal-400" />
              Notifications
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {notifications.length} notifications · {unreadCount} unread
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <Bell size={40} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No notifications yet</p>
            <p className="text-slate-600 text-sm mt-1">
              You'll see alerts here when complaints are created or updated
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => !notification.is_read && markRead(notification.id)}
                className={`flex gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  notification.is_read
                    ? 'bg-slate-800/30 border-slate-700/30 opacity-70'
                    : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    typeColors[notification.type]
                  }`}
                >
                  {typeIcons[notification.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${notification.is_read ? 'text-slate-400' : 'text-white'}`}>
                      {notification.title}
                    </p>
                    <span className="text-slate-600 text-xs flex-shrink-0">
                      {safeFormatDistanceToNow(notification.created_at)}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">
                    {notification.message}
                  </p>
                  {notification.complaint_id && (
                    <Link
                      to={`/dashboard/complaints/${notification.complaint_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-teal-400 hover:text-teal-300 text-xs mt-1.5 inline-flex items-center gap-1 transition-colors"
                    >
                      <FileText size={11} />
                      View Complaint #{notification.complaint_id}
                    </Link>
                  )}
                </div>

                {/* Unread dot */}
                {!notification.is_read && (
                  <div className="flex-shrink-0 mt-1">
                    <Circle size={8} className="text-teal-400 fill-teal-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
