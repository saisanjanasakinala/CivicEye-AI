import { useState, useEffect } from 'react'
import { BarChart2, MapPin, TrendingUp, Percent, Clock } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import AnalyticsCharts from '../components/Charts/AnalyticsCharts'
import StatCard from '../components/UI/StatCard'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getAnalytics } from '../api/analytics'
import type { AnalyticsData } from '../types'

const DAY_OPTIONS = [7, 14, 30, 90]

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [error, setError] = useState('')

  useEffect(() => {
    setIsLoading(true)
    setError('')
    getAnalytics(days)
      .then(setData)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [days])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Data-driven insights on civic infrastructure issues
            </p>
          </div>
          <div className="flex items-center gap-2">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  days === d
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : data ? (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                title="Total Complaints"
                value={data.summary.total_complaints.toLocaleString()}
                icon={<BarChart2 size={18} />}
                color="teal"
              />
              <StatCard
                title="Resolved"
                value={data.summary.resolved_complaints.toLocaleString()}
                icon={<TrendingUp size={18} />}
                color="emerald"
              />
              <StatCard
                title="Pending"
                value={data.summary.pending_complaints.toLocaleString()}
                icon={<Clock size={18} />}
                color="amber"
              />
              <StatCard
                title="Resolution Rate"
                value={`${data.summary.resolution_rate.toFixed(1)}%`}
                icon={<Percent size={18} />}
                color="blue"
              />
              <StatCard
                title="Avg Resolution"
                value={`${data.summary.avg_resolution_hours.toFixed(0)}h`}
                icon={<Clock size={18} />}
                color="indigo"
                subtitle="Average time to resolve"
              />
            </div>

            {/* Charts */}
            <AnalyticsCharts data={data} />

            {/* Hotspots table */}
            {data.hotspots && data.hotspots.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
                  <MapPin size={16} className="text-teal-400" />
                  <h2 className="font-semibold text-white text-sm">Complaint Hotspots</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/30 text-slate-400 text-xs uppercase tracking-wide">
                        <th className="px-5 py-3 text-left">#</th>
                        <th className="px-5 py-3 text-left">Location</th>
                        <th className="px-5 py-3 text-left">Coordinates</th>
                        <th className="px-5 py-3 text-left">Complaints</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hotspots.map((spot, idx) => (
                        <tr key={idx} className="border-b border-slate-700/20 table-row-hover">
                          <td className="px-5 py-3 text-slate-500">{idx + 1}</td>
                          <td className="px-5 py-3 text-slate-300">
                            {spot.address ?? 'Unknown location'}
                          </td>
                          <td className="px-5 py-3 text-slate-400 text-xs font-mono">
                            {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-1.5 bg-teal-400 rounded-full"
                                style={{
                                  width: `${(spot.count / data.hotspots[0].count) * 80}px`,
                                }}
                              />
                              <span className="text-white font-semibold">{spot.count}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
