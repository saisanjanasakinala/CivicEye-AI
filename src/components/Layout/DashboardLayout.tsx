import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Eye,
  LayoutDashboard,
  Camera,
  Bus,
  Map,
  FileText,
  Building2,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Activity,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const allNavItems = [
    {
      label: 'Overview',
      to: '/dashboard',
      icon: <LayoutDashboard size={17} />,
    },
    {
      label: 'Live Bus Monitoring',
      to: '/dashboard/buses',
      icon: <Bus size={17} />,
    },
    {
      label: 'AI Camera Detection',
      to: '/dashboard/bus-camera',
      icon: <Camera size={17} />,
    },
    {
      label: 'All Complaints',
      to: '/dashboard/complaints',
      icon: <FileText size={17} />,
    },
    {
      label: 'Road Health Score',
      to: '/dashboard/road-health',
      icon: <Activity size={17} />,
    },
    {
      label: 'Map and Hotspots',
      to: '/dashboard/map',
      icon: <Map size={17} />,
    },
    {
      label: 'Department Assignments',
      to: '/dashboard/government',
      icon: <Building2 size={17} />,
    },
    {
      label: 'Analytics',
      to: '/dashboard/analytics',
      icon: <BarChart3 size={17} />,
    },
    {
      label: 'Settings',
      to: '/dashboard/settings',
      icon: <Settings size={17} />,
      adminOnly: true,
    },
  ]

  const navItems = allNavItems.filter((item) => !item.adminOnly || user?.role === 'admin')

  const currentNav =
    navItems.find((item) =>
      item.to === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(item.to)
    ) || { label: 'Command Center' }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#101C23] text-[#F4F7F7] flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#1C3038] border-r border-[#2A444E] text-[#F4F7F7] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="h-16 px-5 border-b border-[#2A444E] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-[#F4F7F7]">
            <Eye size={20} className="text-[#91C8BD]" />
            <span className="font-bold text-base tracking-tight text-[#F4F7F7]">
              CivicEye AI
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-[#AABDC2] hover:text-[#F4F7F7]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.to === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#367F77] text-[#F4F7F7] font-semibold'
                    : 'text-[#AABDC2] hover:bg-[#233B44] hover:text-[#F4F7F7]'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              </Link>
            )
          })}

          <div className="pt-4 mt-4 border-t border-[#2A444E]">
            <Link
              to="/citizen"
              className="flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium text-[#91C8BD] hover:bg-[#233B44] hover:text-[#F4F7F7] transition-colors"
            >
              <span>Public Citizen Portal</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </nav>

        {/* Authenticated Official Footer */}
        <div className="p-4 border-t border-[#2A444E] bg-[#101C23]/60">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#F4F7F7] truncate">
                {user?.full_name || user?.username || 'Municipal Official'}
              </p>
              <p className="text-[11px] text-[#AABDC2] truncate">
                {user?.role?.toUpperCase() || 'STAFF'}
                {user?.department ? ` · ${user.department}` : ''}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#233B44] transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left — Actions Right */}
        <header className="h-16 bg-[#1C3038] border-b border-[#2A444E] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#F4F7F7] hover:bg-[#233B44]"
            >
              <Menu size={20} />
            </button>
            <div className="text-xs sm:text-sm font-medium text-[#AABDC2]">
              <span>Government Command Center</span>
              <span className="mx-2 text-[#5E7A82]">/</span>
              <span className="font-bold text-[#F4F7F7]">{currentNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/notifications"
              className="relative p-2 rounded-lg text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#233B44] transition-colors"
              title="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#367F77] text-[#F4F7F7] text-[10px] font-bold font-mono rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-[#233B44] hover:bg-[#367F77] text-[#F4F7F7] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
