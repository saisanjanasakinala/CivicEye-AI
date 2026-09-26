import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import ComplaintTable from '../components/Complaints/ComplaintTable'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getComplaints } from '../api/complaints'
import type { Complaint, ComplaintCategory, ComplaintStatus, ComplaintSeverity } from '../types'
import { categoryLabel } from '../utils/categoryHelpers'

const PAGE_SIZE = 15

const CATEGORIES: ComplaintCategory[] = [
  'pothole', 'garbage', 'dustbin', 'fallen_tree', 'waterlogging', 'streetlight', 'other',
]
const STATUSES: ComplaintStatus[] = ['new', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'closed']
const SEVERITIES: ComplaintSeverity[] = ['low', 'medium', 'high', 'critical']
const DEPARTMENTS = ['Roads', 'Sanitation', 'Parks', 'Drainage', 'Electrical']

export default function ComplaintsPage() {
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<ComplaintCategory | ''>('')
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | ''>('')
  const [filterSeverity, setFilterSeverity] = useState<ComplaintSeverity | ''>('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getComplaints({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        category: filterCategory || undefined,
        status: filterStatus || undefined,
        severity: filterSeverity || undefined,
        department: filterDepartment || undefined,
      })
      setComplaints(data.items ?? [])
      setTotal(data.total)
      setTotalPages(Math.ceil(data.total / PAGE_SIZE))
    } catch (err) {
      console.error('Failed to load complaints', err)
    } finally {
      setIsLoading(false)
    }
  }, [page, search, filterCategory, filterStatus, filterSeverity, filterDepartment])

  useEffect(() => {
    load()
  }, [load])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [search, filterCategory, filterStatus, filterSeverity, filterDepartment])

  const activeFilters = [filterCategory, filterStatus, filterSeverity, filterDepartment].filter(Boolean).length

  const clearFilters = () => {
    setFilterCategory('')
    setFilterStatus('')
    setFilterSeverity('')
    setFilterDepartment('')
    setSearch('')
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Complaints</h1>
            <p className="text-slate-400 text-sm mt-0.5">{total.toLocaleString()} total complaints</p>
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search complaints…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 focus:border-teal-500 rounded-lg pl-9 pr-4 py-2 text-white placeholder-slate-500 outline-none text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
              showFilters || activeFilters > 0
                ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Filter size={14} />
            Filters
            {activeFilters > 0 && (
              <span className="bg-teal-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as ComplaintCategory | '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ComplaintStatus | '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Severity</label>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value as ComplaintSeverity | '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Severities</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Department</label>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            {activeFilters > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/30">
                <button
                  onClick={clearFilters}
                  className="text-slate-400 hover:text-white text-xs transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <ComplaintTable
              complaints={complaints}
              onRowClick={(id) => navigate(`/dashboard/complaints/${id}`)}
            />
          )}
        </div>

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-400">
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
