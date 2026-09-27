import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  CheckCircle2,
  Activity,
  Radio,
  MapPin,
  Bus as BusIcon,
  User,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatCard from '../components/UI/StatCard'
import StatusBadge from '../components/Complaints/StatusBadge'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getComplaints } from '../api/complaints'
import { getBuses } from '../api/buses'
import { categoryEmoji, categoryLabel } from '../utils/categoryHelpers'
import { safeFormatDistanceToNow } from '../utils/dateHelpers'
import type { Complaint, Bus } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [stats, setStats] = useState({
    pending: 0,
    resolved: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [compData, busList] = await Promise.all([
        getComplaints({ page_size: 25 }),
        getBuses().catch(() => [] as Bus[]),
      ])
      setComplaints(compData?.items ?? [])
      setBuses(busList)

      const [newData, assignedData, inProgData, awaitingData, resolvedData, closedData] =
        await Promise.all([
          getComplaints({ status: 'new', page_size: 1 }).catch(() => ({ total: 0 })),
          getComplaints({ status: 'assigned', page_size: 1 }).catch(() => ({ total: 0 })),
          getComplaints({ status: 'in_progress', page_size: 1 }).catch(() => ({ total: 0 })),
          getComplaints({ status: 'awaiting_verification', page_size: 1 }).catch(() => ({
            total: 0,
          })),
          getComplaints({ status: 'resolved', page_size: 1 }).catch(() => ({ total: 0 })),
          getComplaints({ status: 'closed', page_size: 1 }).catch(() => ({ total: 0 })),
        ])

      setStats({
        pending:
          (newData?.total ?? 0) +
          (assignedData?.total ?? 0) +
          (inProgData?.total ?? 0) +
          (awaitingData?.total ?? 0),
        resolved: (resolvedData?.total ?? 0) + (closedData?.total ?? 0),
      })
    } catch (err) {
      console.error('Failed to load Command Center overview', err)
      setError('Unable to load Command Center overview data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const activeBusesCount = buses.filter((b) => b.is_active).length
  const liveGpsBusesCount = buses.filter((b) => b.is_active && b.gps_status === 'live').length
  const simulatedBusesCount = buses.filter(
    (b) => b.is_active && b.gps_status === 'simulated'
  ).length

  const totalAiDetections = buses.reduce(
    (sum, b) => sum + (b.detections_count ?? b.total_detections ?? b.complaints_count ?? 0),
    0
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Clean Page Header (No redundant top-right navigation buttons) */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F4F7F7]">
            Overview
          </h1>
          <p className="text-xs sm:text-sm text-[#AABDC2] mt-0.5">
            Monitor buses, manage complaints and track resolutions.
          </p>
        </div>

        {error && (
          <div className="bg-red-950/60 border border-red-700/60 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-200 text-sm">{error}</p>
            <button
              onClick={load}
              className="text-xs bg-red-600 text-[#F4F7F7] px-3 py-1.5 rounded-lg font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Four Compact Summary Cards */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Buses"
              value={activeBusesCount}
              icon={<Radio size={18} />}
              color="teal"
              subtitle={
                simulatedBusesCount > 0
                  ? `${liveGpsBusesCount} live GPS · ${simulatedBusesCount} demo`
                  : `${buses.length} registered buses`
              }
            />
            <StatCard
              title="AI Detections"
              value={totalAiDetections}
              icon={<Activity size={18} />}
              color="purple"
              subtitle="Recorded bus camera events"
            />
            <StatCard
              title="Pending Complaints"
              value={stats.pending}
              icon={<Clock size={18} />}
              color="amber"
              subtitle="Open & in progress"
            />
            <StatCard
              title="Resolved Complaints"
              value={stats.resolved}
              icon={<CheckCircle2 size={18} />}
              color="emerald"
              subtitle="Verified & closed"
            />
          </div>
        )}

        {/* Compact Recent Activity Section */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2A444E] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-[#F4F7F7] text-base">
                Recent Activity
              </h2>
              <p className="text-xs text-[#AABDC2]">
                Latest detection and complaint events with verification and resolution status.
              </p>
            </div>
            <span className="text-xs text-[#AABDC2] font-mono">
              Showing {Math.min(complaints.length, 8)} latest events
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : complaints.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#AABDC2]">
              No recent detection or complaint events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#2A444E]">
              {complaints.slice(0, 8).map((item) => {
                const isBusSource = item.source === 'bus_camera' || Boolean(item.bus_id)
                const isDemoItem = Boolean(item.is_simulated)
                const deptDisplay =
                  typeof item.department === 'object' && item.department !== null
                    ? (item.department as any).name
                    : item.department || item.department_name || 'Unassigned'

                return (
                  <div
                    key={item.id}
                    onClick={() =>
                      navigate(`/dashboard/complaints/${item.complaint_id || item.id}`)
                    }
                    className="px-5 py-3.5 hover:bg-[#233B44]/60 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#101C23] border border-[#2A444E] flex items-center justify-center text-base shrink-0 mt-0.5">
                        {categoryEmoji(item.category)}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#91C8BD]">
                            {item.complaint_id}
                          </span>
                          <span className="text-sm font-semibold text-[#F4F7F7]">
                            {categoryLabel(item.category)}
                          </span>

                          {/* Explicit Source & Demo vs Genuine Label */}
                          {isBusSource ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#101C23] border border-[#2A444E] text-[#91C8BD]">
                              <BusIcon size={11} />
                              {item.bus_number || `Bus #${item.bus_id}`}
                              {isDemoItem ? ' · Demo' : ' · AI Detection'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#101C23] border border-[#2A444E] text-[#AABDC2]">
                              <User size={11} />
                              Citizen Portal
                            </span>
                          )}

                          {isDemoItem && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Demo Data
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#AABDC2] line-clamp-1">
                          {item.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#7E969D]">
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {item.address
                              ? item.address.slice(0, 38) +
                                (item.address.length > 38 ? '…' : '')
                              : `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
                          </span>
                          <span>·</span>
                          <span>{deptDisplay}</span>
                          <span>·</span>
                          <span>{safeFormatDistanceToNow(item.first_detected_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:shrink-0 self-end sm:self-center">
                      <StatusBadge status={item.status} dot />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
