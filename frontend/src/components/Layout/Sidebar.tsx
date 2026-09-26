import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Camera,
  Map,
  FileText,
  Building2,
  BarChart3,
  Users,
  Bell,
  Eye,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  roles?: string[]
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/dashboard/bus-camera', icon: <Camera size={18} />, label: 'Bus Camera' },
  { to: '/dashboard/map', icon: <Map size={18} />, label: 'Live Map' },
  { to: '/dashboard/complaints', icon: <FileText size={18} />, label: 'Complaints' },
  {
    to: '/dashboard/government',
    icon: <Building2 size={18} />,
    label: 'Gov Dashboard',
    roles: ['admin', 'officer'],
  },
  { to: '/dashboard/analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
  { to: '/dashboard/citizen', icon: <Users size={18} />, label: 'Citizen Portal' },
  { to: '/dashboard/notifications', icon: <Bell size={18} />, label: 'Notifications' },
]

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const filteredItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  const sidebarContent = (
    <div className={`flex flex-col h-full bg-slate-900 border-r border-slate-700/50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Eye size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold text-white text-sm leading-tight">CivicEye AI</div>
              <div className="text-teal-400 text-xs">Smart City Inspector</div>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex text-slate-400 hover:text-white p-1 rounded transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <button
          onClick={onMobileClose}
          className="lg:hidden text-slate-400 hover:text-white p-1 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group ${
                isActive
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
            {item.to === '/dashboard/notifications' && unreadCount > 0 && (
              <span
                className={`${collapsed ? 'absolute top-1 right-1' : 'ml-auto'} bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-slate-600">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-slate-700/50">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0) ?? user?.username?.charAt(0) ?? 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.full_name || user?.username}</div>
              <div className="text-slate-400 text-xs capitalize">{user?.role}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            className="mt-2 w-full flex justify-center text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">{sidebarContent}</div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={onMobileClose} />
          <div className="relative z-10 flex sidebar-transition">{sidebarContent}</div>
        </div>
      )}
    </>
  )
}
