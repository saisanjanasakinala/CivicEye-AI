import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsData } from '../../types'
import { categoryLabel } from '../../utils/categoryHelpers'

const COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#10b981', '#6366f1']

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6',
  assigned: '#6366f1',
  in_progress: '#f59e0b',
  awaiting_verification: '#a855f7',
  resolved: '#10b981',
  closed: '#64748b',
}

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
}

interface AnalyticsChartsProps {
  data: AnalyticsData
}

export default function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const categoryData = data.by_category.map((d) => ({
    name: categoryLabel(d.category),
    total: d.count,
    resolved: d.resolved,
    pending: d.pending,
  }))

  const statusData = data.by_status.map((d) => ({
    name: d.status.replace('_', ' '),
    value: d.count,
    color: STATUS_COLORS[d.status] ?? '#64748b',
  }))

  const departmentData = data.by_department.map((d) => ({
    name: d.department,
    total: d.count,
    resolved: d.resolved,
  }))

  const trendData = data.daily_trend.map((d) => ({
    date: d.date.slice(5), // MM-DD
    new: d.count,
    resolved: d.resolved,
  }))

  const severityData = data.by_severity.map((d) => ({
    name: d.severity.charAt(0).toUpperCase() + d.severity.slice(1),
    count: d.count,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Complaints by Category */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Complaints by Category</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            <Bar dataKey="total" name="Total" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Complaints by Status (Pie) */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Complaints by Status</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              outerRadius={90}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#475569' }}
            >
              {statusData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Trend */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 lg:col-span-2">
        <h3 className="text-white font-semibold mb-4 text-sm">Daily Complaint Trend (30 Days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            <Line type="monotone" dataKey="new" name="New" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* By Department */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Complaints by Department</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={departmentData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            <Bar dataKey="total" name="Total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By Severity */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Complaints by Severity</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={severityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
              {severityData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
