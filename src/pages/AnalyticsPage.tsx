import { useState, useEffect } from 'react'
import { BarChart3, CheckCircle2, Clock, FileText, MapPin } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import DashboardLayout from '../components/Layout/DashboardLayout'
import StatCard from '../components/UI/StatCard'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getAnalytics } from '../api/analytics'
import type { AnalyticsData } from '../types'

const COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981']

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getAnalytics(30)
      .then(setData)
      .catch((err) => console.error('Analytics load error:', err))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={22} className="text-teal-400" />
            Analytics
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Complaint trends, department response times, and city hotspots.
          </p>
        </div>

        {isLoading || !data ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Complaints"
                value={data.summary.total_complaints}
                icon={<FileText size={20} />}
                color="teal"
              />
              <StatCard
                title="Resolved"
                value={data.summary.resolved_complaints}
                icon={<CheckCircle2 size={20} />}
                color="emerald"
              />
              <StatCard
                title="Avg Resolution Time"
                value={`${data.summary.avg_resolution_hours}h`}
                icon={<Clock size={20} />}
                color="blue"
              />
              <StatCard
                title="Resolution Rate"
                value={`${data.summary.resolution_rate}%`}
                icon={<BarChart3 size={20} />}
                color="purple"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* By Category */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h2 className="font-semibold text-white text-sm mb-4">
                  Complaints by Issue Category
                </h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.by_category}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="count" name="Total" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Department Response Times Chart */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-1.5">
                  <Clock size={15} className="text-blue-400" />
                  Avg Response Time by Department (Hours)
                </h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.by_department} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis
                      dataKey="department"
                      type="category"
                      width={80}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar
                      dataKey="avg_response_hours"
                      name="Avg Response (hrs)"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* By Severity */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h2 className="font-semibold text-white text-sm mb-4">
                  Severity Breakdown
                </h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.by_severity}
                      dataKey="count"
                      nameKey="severity"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.severity}: ${entry.count}`}
                    >
                      {data.by_severity.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Workload & Hotspots */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h2 className="font-semibold text-white text-sm mb-4">
                  Departmental Resolution Rate & SLA Speed
                </h2>
                <div className="space-y-3">
                  {data.by_department.map((d) => {
                    const pct = d.count > 0 ? Math.round((d.resolved / d.count) * 100) : 0
                    return (
                      <div key={d.department} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium">{d.department}</span>
                          <span className="text-slate-400">
                            {d.resolved} / {d.count} resolved ({pct}%) · Avg{' '}
                            {d.avg_response_hours ?? 18}h
                          </span>
                        </div>
                        <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                  <MapPin size={16} className="text-teal-400" />
                  Recurring Geographic Hotspots
                </h2>
                <div className="space-y-2.5">
                  {data.hotspots.length === 0 ? (
                    <p className="text-slate-500 text-xs">No recurring hotspots detected</p>
                  ) : (
                    data.hotspots.slice(0, 6).map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-900/70 border border-slate-800 text-xs"
                      >
                        <div>
                          <p className="text-white font-medium">
                            {h.address || 'Civic Cluster'}
                          </p>
                          <p className="text-slate-500 font-mono text-[11px]">
                            {h.latitude.toFixed(4)}°N, {h.longitude.toFixed(4)}°E
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-semibold">
                          {h.count} incidents
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
