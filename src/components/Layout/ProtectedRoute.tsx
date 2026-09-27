import React from 'react'
import { Navigate, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, FileText } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import type { UserRole } from '../../types'
import DashboardLayout from './DashboardLayout'
import LoadingSpinner from '../UI/LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserRole[]
}

export default function ProtectedRoute({
  children,
  roles = ['admin', 'officer'],
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#101C23] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto my-12 bg-[#1C3038] border border-red-700/60 rounded-2xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-700/60 flex items-center justify-center text-red-400 mx-auto">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1">
            <span className="inline-block px-2.5 py-0.5 rounded bg-red-950/80 border border-red-700/60 text-red-300 font-mono text-xs font-bold">
              HTTP 403 FORBIDDEN
            </span>
            <h1 className="text-xl font-bold text-[#F4F7F7]">
              Access Restricted to Municipal Administrator
            </h1>
            <p className="text-xs sm:text-sm text-[#AABDC2]">
              You are signed in as <strong className="text-[#F4F7F7]">{user.full_name || user.username}</strong> (
              <span className="text-[#91C8BD]">
                Department Officer · {user.department || 'Assigned Department'}
              </span>
              ). Department Officers can only view and update complaints assigned to their own department and cannot access Admin-only settings, staff management, bus fleet management, or cross-department routing.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dashboard/complaints"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs font-semibold transition-colors"
            >
              <FileText size={14} />
              <span>Open {user.department || 'Department'} Complaints</span>
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#101C23] hover:bg-[#233B44] border border-[#2A444E] text-[#AABDC2] hover:text-[#F4F7F7] text-xs font-semibold transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Return to Overview</span>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return <>{children}</>
}
