import { useState, useEffect } from 'react'
import { Filter, Layers } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import CityMap from '../components/Map/CityMap'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getMapComplaints } from '../api/complaints'
import type { MapComplaint, ComplaintCategory, ComplaintStatus, ComplaintSeverity } from '../types'
import { categoryLabel } from '../utils/categoryHelpers'

const CATEGORIES: ComplaintCategory[] = [
  'pothole', 'garbage', 'dustbin', 'fallen_tree', 'waterlogging', 'streetlight',
]
const STATUSES: ComplaintStatus[] = ['new', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'closed']
const SEVERITIES: ComplaintSeverity[] = ['low', 'medium', 'high', 'critical']

export default function CityMapPage() {
  const [complaints, setComplaints] = useState<MapComplaint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<Set<ComplaintCategory>>(new Set())
  const [selectedStatus, setSelectedStatus] = useState<ComplaintStatus | ''>('')
  const [selectedSeverity, setSelectedSeverity] = useState<ComplaintSeverity | ''>('')

  const toggleCategory = (cat: ComplaintCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const data = await getMapComplaints({
          status: selectedStatus || undefined,
          severity: selectedSeverity || undefined,
        })
        const filtered =
          selectedCategories.size > 0
            ? data.filter((c) => selectedCategories.has(c.category))
            : data
        setComplaints(filtered)
      } catch (err) {
        console.error('Failed to load map complaints', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [selectedCategories, selectedStatus, selectedSeverity])

  const clearFilters = () => {
    setSelectedCategories(new Set())
    setSelectedStatus('')
    setSelectedSeverity('')
  }

  const activeFilterCount =
    selectedCategories.size + (selectedStatus ? 1 : 0) + (selectedSeverity ? 1 : 0)

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Live City Map</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {complaints.length} complaints displayed across Pune
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                filterOpen || activeFilterCount > 0
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Filter size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-teal-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {filterOpen && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Categories */}
              <div>
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Layers size={12} />
                  Category
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        selectedCategories.has(cat)
                          ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                          : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {categoryLabel(cat)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  Status
                </h4>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as ComplaintStatus | '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Severity */}
              <div>
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  Severity
                </h4>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value as ComplaintSeverity | '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  <option value="">All Severities</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
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

        {/* Map legend */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400">
          {[
            { color: 'bg-red-500', label: 'Critical' },
            { color: 'bg-orange-500', label: 'High' },
            { color: 'bg-amber-500', label: 'Medium' },
            { color: 'bg-emerald-500', label: 'Resolved' },
            { color: 'bg-slate-400', label: 'Closed' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${l.color}`} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Map */}
        <div className="rounded-xl overflow-hidden border border-slate-700/50">
          {isLoading ? (
            <div className="flex items-center justify-center h-[500px] bg-slate-800/50">
              <div className="text-center">
                <LoadingSpinner className="mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Loading map data…</p>
              </div>
            </div>
          ) : (
            <CityMap complaints={complaints} height="calc(100vh - 280px)" />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
