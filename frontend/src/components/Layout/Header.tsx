import { Link, useLocation } from 'react-router-dom'
import { Bell, Menu, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/bus-camera': 'Bus Camera',
  '/dashboard/map': 'Live Map',
  '/dashboard/complaints': 'Complaints',
  '/dashboard/government': 'Government Dashboard',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/citizen': 'Citizen Portal',
  '/dashboard/notifications': 'Notifications',
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  officer: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  citizen: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth()
  const { unreadCount } = useNotifications()
  const location = useLocation()

  const currentLabel = routeLabels[location.pathname] ?? 'Dashboard'
  const breadcrumbs = location.pathname
    .split('/')
    .filter(Boolean)
    .map((seg, idx, arr) => ({
      label: routeLabels['/' + arr.slice(0, idx + 1).join('/')] ?? seg,
      to: '/' + arr.slice(0, idx + 1).join('/'),
    }))

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-700/50 flex items-center px-4 gap-4 flex-shrink-0">
      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-slate-400 hover:text-white p-1 rounded"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-1">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.to} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-slate-600" />}
            {i === breadcrumbs.length - 1 ? (
              <span className="text-white font-medium">{crumb.label}</span>
            ) : (
              <Link to={crumb.to} className="text-slate-400 hover:text-white transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Role badge */}
        {user && (
          <span
            className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${
              roleColors[user.role] ?? 'bg-slate-700 text-slate-300'
            }`}
          >
            {user.role}
          </span>
        )}

        {/* Notification bell */}
        <Link
          to="/dashboard/notifications"
          className="relative text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User avatar */}
        {user && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
            {user.full_name?.charAt(0) ?? user.username?.charAt(0) ?? 'U'}
          </div>
        )}
      </div>
    </header>
  )
}
