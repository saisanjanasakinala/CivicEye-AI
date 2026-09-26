import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Clock, Loader, CheckCircle2, Camera, Map, AlertTriangle, Plus } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatCard from '../components/UI/StatCard'
import ComplaintTable from '../components/Complaints/ComplaintTable'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getComplaints } from '../api/complaints'
import type { Complaint } from '../types'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getComplaints({ page_size: 10 })
        setComplaints(data.items ?? [])
        setStats({
          total: data.total,
          pending: (data.items ?? []).filter((c) => c.status === 'new').length,
          inProgress: (data.items ?? []).filter((c) => c.status === 'in_progress').length,
          resolved: (data.items ?? []).filter((c) => c.status === 'resolved').length,
        })
        // Get real totals
        const [newData, inProgData, resolvedData] = await Promise.all([
          getComplaints({ status: 'new', page_size: 1 }),
          getComplaints({ status: 'in_progress', page_size: 1 }),
          getComplaints({ status: 'resolved', page_size: 1 }),
        ])
        setStats({
          total: data.total,
          pending: newData.total,
          inProgress: inProgData.total,
          resolved: resolvedData.total,
        })
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const QUICK_ACTIONS = [
    {
      label: 'Live Bus Camera',
      icon: <Camera size={18} />,
      to: '/dashboard/bus-camera',
      color: 'bg-teal-600 hover:bg-teal-500',
    },
    {
      label: 'View Map',
      icon: <Map size={18} />,
      to: '/dashboard/map',
      color: 'bg-blue-600 hover:bg-blue-500',
    },
    {
      label: 'All Complaints',
      icon: <FileText size={18} />,
      to: '/dashboard/complaints',
      color: 'bg-slate-700 hover:bg-slate-600',
    },
    ...(user?.role !== 'citizen'
      ? [
          {
            label: 'Gov Dashboard',
            icon: <AlertTriangle size={18} />,
            to: '/dashboard/government',
            color: 'bg-indigo-600 hover:bg-indigo-500',
          },
        ]
      : [
          {
            label: 'Submit Issue',
            icon: <Plus size={18} />,
            to: '/dashboard/citizen',
            color: 'bg-emerald-600 hover:bg-emerald-500',
          },
        ]),
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-xl font-bold text-white">
            Welcome back, {user?.full_name || user?.username}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Here's an overview of civic complaints across Pune
          </p>
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Complaints"
              value={stats.total.toLocaleString()}
              icon={<FileText size={20} />}
              color="teal"
              pulse
            />
            <StatCard
              title="Pending"
              value={stats.pending}
              icon={<Clock size={20} />}
              color="amber"
              subtitle="Awaiting action"
            />
            <StatCard
              title="In Progress"
              value={stats.inProgress}
              icon={<Loader size={20} />}
              color="blue"
              subtitle="Being addressed"
            />
            <StatCard
              title="Resolved"
              value={stats.resolved}
              icon={<CheckCircle2 size={20} />}
              color="emerald"
              subtitle="Completed"
            />
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.to)}
                className={`flex items-center gap-2 ${action.color} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent complaints */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="font-semibold text-white">Recent Complaints</h2>
            <button
              onClick={() => navigate('/dashboard/complaints')}
              className="text-teal-400 hover:text-teal-300 text-sm transition-colors"
            >
              View all →
            </button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <ComplaintTable
              complaints={complaints.slice(0, 8)}
              onRowClick={(id) => navigate(`/dashboard/complaints/${id}`)}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
