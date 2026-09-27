import React, { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  SafeTileLayer,
  MapInvalidator,
} from '../components/Map/InteractiveMap'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import { getRoadHealthOverview } from '../api/complaints'
import type {
  RoadHealthBand,
  RoadHealthIssueDeduction,
  RoadHealthOverviewResponse,
  RoadSegmentHealth,
} from '../types'
import StatusBadge from '../components/Complaints/StatusBadge'
import Badge from '../components/UI/Badge'
import { severityLabel, severityVariant } from '../utils/categoryHelpers'

const BAND_CONFIG: Record<
  RoadHealthBand,
  {
    label: string
    range: string
    strokeColor: string
    badgeBg: string
    badgeText: string
    badgeBorder: string
    dotClass: string
  }
> = {
  green: {
    label: 'Good (Green)',
    range: '80–100',
    strokeColor: '#1F9D68',
    badgeBg: 'bg-[#1F9D68]/15',
    badgeText: 'text-[#4ADE80]',
    badgeBorder: 'border-[#1F9D68]/40',
    dotClass: 'bg-[#1F9D68]',
  },
  yellow: {
    label: 'Fair (Yellow)',
    range: '60–79',
    strokeColor: '#EAB308',
    badgeBg: 'bg-[#EAB308]/15',
    badgeText: 'text-[#FACC15]',
    badgeBorder: 'border-[#EAB308]/40',
    dotClass: 'bg-[#EAB308]',
  },
  orange: {
    label: 'Poor (Orange)',
    range: '40–59',
    strokeColor: '#F97316',
    badgeBg: 'bg-[#F97316]/15',
    badgeText: 'text-[#FB923C]',
    badgeBorder: 'border-[#F97316]/40',
    dotClass: 'bg-[#F97316]',
  },
  red: {
    label: 'Critical (Red)',
    range: '0–39',
    strokeColor: '#EF4444',
    badgeBg: 'bg-[#EF4444]/15',
    badgeText: 'text-[#F87171]',
    badgeBorder: 'border-[#EF4444]/40',
    dotClass: 'bg-[#EF4444]',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    range: 'N/A',
    strokeColor: '#64748B',
    badgeBg: 'bg-[#64748B]/20',
    badgeText: 'text-[#CBD5E1]',
    badgeBorder: 'border-[#64748B]/40',
    dotClass: 'bg-[#64748B]',
  },
}

function MapFlyToSegment({ segment }: { segment: RoadSegmentHealth | null }) {
  const map = useMap()
  useEffect(() => {
    if (segment && segment.center && segment.center.length === 2) {
      map.flyTo([segment.center[0], segment.center[1]], 14, {
        duration: 0.8,
      })
    }
  }, [segment, map])
  return null
}

const RoadHealthPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<RoadHealthOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    searchParams.get('segment')
  )
  const [bandFilter, setBandFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFormulaModal, setShowFormulaModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'deductions' | 'active' | 'history'>('deductions')

  const fetchRoadHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getRoadHealthOverview()
      setData(res)
      if (!selectedSegmentId && res.segments.length > 0) {
        const paramSeg = searchParams.get('segment')
        const found = paramSeg
          ? res.segments.find((s) => s.segment_id === paramSeg)
          : null
        setSelectedSegmentId(found ? found.segment_id : res.segments[0].segment_id)
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to load Road Health Score data.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRoadHealth()
  }, [])

  const filteredSegments = useMemo(() => {
    if (!data) return []
    return data.segments.filter((seg) => {
      if (bandFilter !== 'all' && seg.band !== bandFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = seg.name.toLowerCase().includes(q)
        const matchCorridor = seg.corridor_road.toLowerCase().includes(q)
        const matchWard = seg.ward_name.toLowerCase().includes(q)
        const matchId = seg.segment_id.toLowerCase().includes(q)
        if (!matchName && !matchCorridor && !matchWard && !matchId) return false
      }
      return true
    })
  }, [data, bandFilter, searchQuery])

  const bandCounts = useMemo(() => {
    const segs = data?.segments || []
    return {
      green: segs.filter((s) => s.band === 'green').length,
      yellow: segs.filter((s) => s.band === 'yellow').length,
      orange: segs.filter((s) => s.band === 'orange').length,
      red: segs.filter((s) => s.band === 'red').length,
      insufficient_data: segs.filter((s) => s.band === 'insufficient_data').length,
    }
  }, [data])

  const selectedSegment = useMemo(() => {
    if (!data || !selectedSegmentId) return null
    return data.segments.find((s) => s.segment_id === selectedSegmentId) || null
  }, [data, selectedSegmentId])

  const handleSelectSegment = (segId: string) => {
    setSelectedSegmentId(segId)
    setSearchParams({ segment: segId }, { replace: true })
  }

  if (loading && !data) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[420px]">
          <div className="flex items-center gap-3 text-[#CFE0E4]">
            <RefreshCw size={20} className="animate-spin text-[#00D1FF]" />
            <span className="text-sm font-medium">
              Calculating Road Health Scores from verified GPS complaints...
            </span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-[#D9534F]/15 border border-[#D9534F]/40 rounded-xl p-5 text-[#F87171]">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle size={18} />
              <span>Error Loading Road Health Data</span>
            </div>
            <p className="text-sm text-[#CFE0E4] mb-3">{error}</p>
            <button
              onClick={fetchRoadHealth}
              className="px-3.5 py-1.5 bg-[#1B2F37] hover:bg-[#243D47] text-white rounded-lg text-xs font-medium border border-[#2A444E]"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!data) return null

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header Banner */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#1B2F37] border border-[#2A444E] rounded-xl p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
                <Activity size={13} />
                TRANSPARENT RULE-BASED SCORING ENGINE
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-[#E09F3E]/15 text-[#F3B65B] border border-[#E09F3E]/30">
                <Info size={12} />
                Not an ML Prediction — Deterministic Civic Engineering Formula
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Road Health Score & Corridor Diagnostics
            </h1>
            <p className="text-xs sm:text-sm text-[#AABDC2] mt-1 max-w-3xl">
              Evaluates each municipal road corridor on a transparent 0–100 scale using GPS-grouped
              verified potholes, road damage, waterlogging, issue severity, and unresolved age.
              Duplicate detections of the same physical defect are automatically excluded.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowFormulaModal(!showFormulaModal)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#132329] hover:bg-[#243D47] text-[#00D1FF] border border-[#00D1FF]/40 transition-colors"
            >
              <HelpCircle size={15} />
              <span>{showFormulaModal ? 'Hide Scoring Formula' : 'How Score is Calculated'}</span>
            </button>
            <button
              onClick={fetchRoadHealth}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0F766E] hover:bg-[#0D9488] text-white transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Scores</span>
            </button>
          </div>
        </div>

        {/* Collapsible Formula Explanation Card */}
        {showFormulaModal && (
          <div className="bg-[#132329] border border-[#00D1FF]/40 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-[#00D1FF]" />
                  Transparent 0–100 Road Health Scoring Methodology
                </h2>
                <p className="text-xs text-[#AABDC2] mt-1">{data.scoring_algorithm_note}</p>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="text-xs text-[#8FA8AE] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-lg p-3.5">
                <div className="font-semibold text-[#00D1FF] mb-1">
                  1. Base Deduction (Starts at 100)
                </div>
                <ul className="space-y-1 text-[#CFE0E4]">
                  <li>
                    • Pothole Defect: <strong>-5 to -22 pts</strong>
                  </li>
                  <li>
                    • Structural Road Damage: <strong>-4 to -18 pts</strong>
                  </li>
                  <li>
                    • Waterlogging / Drain: <strong>-4 to -16 pts</strong>
                  </li>
                  <li>
                    • Other Surface Hazard: <strong>-2 to -10 pts</strong>
                  </li>
                </ul>
              </div>

              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-lg p-3.5">
                <div className="font-semibold text-[#00D1FF] mb-1">
                  2. Severity & Unresolved Age
                </div>
                <ul className="space-y-1 text-[#CFE0E4]">
                  <li>• Scaled by verified issue severity (Low, Medium, High, Critical)</li>
                  <li>
                    • Age Factor: <strong>+1 pt per 3 unresolved days</strong> (capped at +6 pts per
                    issue)
                  </li>
                </ul>
              </div>

              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-lg p-3.5">
                <div className="font-semibold text-[#00D1FF] mb-1">3. Deduplication Protection</div>
                <p className="text-[#CFE0E4] leading-relaxed">
                  Multiple bus camera passes or citizen complaints within 50m for the same physical
                  defect are grouped into <strong>1 unique issue</strong>. Duplicate detections
                  never reduce a road segment&apos;s score twice.
                </p>
              </div>

              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-lg p-3.5">
                <div className="font-semibold text-[#00D1FF] mb-1">4. Insufficient Data Guard</div>
                <p className="text-[#CFE0E4] leading-relaxed">
                  If a corridor has neither recent bus telemetry nor verified GPS inspection
                  records, CivicEye displays <strong>&quot;Insufficient Data&quot;</strong> rather
                  than inventing a synthetic score.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA8AE]">
              Avg City Road Score
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {data.city_average_score !== null ? `${data.city_average_score}/100` : 'N/A'}
              </span>
            </div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">
              Across {data.evaluated_segments_count} scored corridors
            </div>
          </div>

          <div className="bg-[#1B2F37] border border-[#1F9D68]/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4ADE80]">
                Green (80–100)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#1F9D68]" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">{bandCounts.green}</div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">Good surface condition</div>
          </div>

          <div className="bg-[#1B2F37] border border-[#EAB308]/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FACC15]">
                Yellow (60–79)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">{bandCounts.yellow}</div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">Preventive maintenance</div>
          </div>

          <div className="bg-[#1B2F37] border border-[#F97316]/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FB923C]">
                Orange (40–59)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">{bandCounts.orange}</div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">Degraded — schedule repair</div>
          </div>

          <div className="bg-[#1B2F37] border border-[#EF4444]/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#F87171]">
                Red (0–39)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">{bandCounts.red}</div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">Critical structural defects</div>
          </div>

          <div className="bg-[#1B2F37] border border-[#64748B]/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#CBD5E1]">
                Insufficient Data
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#64748B]" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">
              {data.insufficient_data_segments_count}
            </div>
            <div className="text-[11px] text-[#8FA8AE] mt-1">
              {data.total_duplicates_prevented} duplicates excluded
            </div>
          </div>
        </div>

        {/* Map + Selected Segment Detail Split Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left: Interactive Road Segment Map & Segment List (7 cols) */}
          <div className="xl:col-span-7 space-y-4">
            <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A444E] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-[#00D1FF]" />
                  <h2 className="text-sm font-bold text-white">
                    Interactive Road Health Segment Map
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#CFE0E4]">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-1.5 rounded bg-[#1F9D68]" /> Green (80–100)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-1.5 rounded bg-[#EAB308]" /> Yellow (60–79)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-1.5 rounded bg-[#F97316]" /> Orange (40–59)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-1.5 rounded bg-[#EF4444]" /> Red (0–39)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-1.5 rounded bg-[#64748B]" /> Insufficient Data
                  </span>
                </div>
              </div>

              <div className="h-[390px] w-full relative">
                <MapContainer
                  center={[18.5204, 73.8567]}
                  zoom={12}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <SafeTileLayer />
                  <MapInvalidator trigger={selectedSegmentId} />
                  <MapFlyToSegment segment={selectedSegment} />

                  {data.segments.map((seg) => {
                    const isSelected = seg.segment_id === selectedSegmentId
                    const cfg = BAND_CONFIG[seg.band]
                    return (
                      <React.Fragment key={seg.segment_id}>
                        {isSelected && (
                          <Polyline
                            positions={seg.waypoints}
                            pathOptions={{
                              color: '#00D1FF',
                              weight: 12,
                              opacity: 0.35,
                            }}
                          />
                        )}
                        <Polyline
                          positions={seg.waypoints}
                          pathOptions={{
                            color: cfg.strokeColor,
                            weight: isSelected ? 8 : 6,
                            opacity: 0.92,
                            dashArray: seg.band === 'insufficient_data' ? '8, 8' : undefined,
                          }}
                          eventHandlers={{
                            click: () => handleSelectSegment(seg.segment_id),
                          }}
                        >
                          <Popup>
                            <div className="text-xs space-y-1 min-w-[190px]">
                              <div className="font-bold text-slate-900">{seg.name}</div>
                              <div className="text-slate-600">{seg.ward_name}</div>
                              <div className="font-semibold">
                                Score:{' '}
                                {seg.insufficient_data ? (
                                  <span className="text-slate-600">Insufficient Data</span>
                                ) : (
                                  <span>
                                    {seg.score}/100 ({seg.status_label})
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-600">
                                Active Unique Issues: {seg.active_unique_issues_count}
                              </div>
                            </div>
                          </Popup>
                        </Polyline>

                        <CircleMarker
                          center={[seg.center[0], seg.center[1]]}
                          radius={isSelected ? 9 : 6}
                          pathOptions={{
                            fillColor: cfg.strokeColor,
                            color: isSelected ? '#FFFFFF' : '#0F1E23',
                            weight: isSelected ? 2.5 : 1.5,
                            fillOpacity: 1,
                          }}
                          eventHandlers={{
                            click: () => handleSelectSegment(seg.segment_id),
                          }}
                        />
                      </React.Fragment>
                    )
                  })}
                </MapContainer>
              </div>
            </div>

            {/* Filter & Road Segments Table */}
            <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8FA8AE]"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search road segment, corridor name, or ward..."
                    className="w-full pl-9 pr-3 py-2 bg-[#132329] border border-[#2A444E] rounded-lg text-xs text-white placeholder-[#8FA8AE] focus:outline-none focus:border-[#00D1FF]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-[#8FA8AE]" />
                  <select
                    value={bandFilter}
                    onChange={(e) => setBandFilter(e.target.value)}
                    className="bg-[#132329] border border-[#2A444E] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D1FF]"
                  >
                    <option value="all">All Health Bands ({data.segments.length})</option>
                    <option value="red">Critical — Red (0–39)</option>
                    <option value="orange">Poor — Orange (40–59)</option>
                    <option value="yellow">Fair — Yellow (60–79)</option>
                    <option value="green">Good — Green (80–100)</option>
                    <option value="insufficient_data">Insufficient Data</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#2A444E] text-[11px] font-semibold uppercase tracking-wider text-[#8FA8AE]">
                      <th className="py-2.5 px-3">Road Segment</th>
                      <th className="py-2.5 px-3">Health Score</th>
                      <th className="py-2.5 px-3">Condition</th>
                      <th className="py-2.5 px-3">Unique Issues</th>
                      <th className="py-2.5 px-3">Deduped Ignored</th>
                      <th className="py-2.5 px-3">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A444E]/60 text-xs">
                    {filteredSegments.map((seg) => {
                      const cfg = BAND_CONFIG[seg.band]
                      const isSelected = seg.segment_id === selectedSegmentId
                      return (
                        <tr
                          key={seg.segment_id}
                          onClick={() => handleSelectSegment(seg.segment_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#00D1FF]/12 border-l-2 border-l-[#00D1FF]'
                              : 'hover:bg-[#243D47]/60'
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{seg.name}</div>
                            <div className="text-[11px] text-[#8FA8AE]">
                              {seg.ward_name} • {seg.length_km} km
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {seg.insufficient_data ? (
                              <span className="text-xs font-semibold text-[#94A3B8]">
                                Insufficient Data
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-white">{seg.score}</span>
                                <span className="text-[11px] text-[#8FA8AE]">/ 100</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                              {seg.status_label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-white font-medium">
                            {seg.active_unique_issues_count} active
                          </td>
                          <td className="py-3 px-3 text-[#8FA8AE]">
                            {seg.duplicate_sightings_ignored > 0 ? (
                              <span className="text-[#00D1FF]">
                                {seg.duplicate_sightings_ignored} excluded
                              </span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="py-3 px-3 text-[#8FA8AE]">
                            {new Date(seg.last_updated_at).toLocaleDateString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Selected Road Segment Inspector Panel (5 cols) */}
          <div className="xl:col-span-5">
            {selectedSegment ? (
              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-5 space-y-5 sticky top-4">
                <div className="flex items-start justify-between gap-4 border-b border-[#2A444E] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-[#132329] text-[#00D1FF] border border-[#2A444E]">
                        {selectedSegment.segment_id}
                      </span>
                      <span className="text-xs text-[#8FA8AE]">{selectedSegment.ward_name}</span>
                    </div>
                    <h2 className="text-lg font-bold text-white mt-1.5">{selectedSegment.name}</h2>
                    <p className="text-xs text-[#CFE0E4] mt-0.5">{selectedSegment.corridor_road}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#8FA8AE] mt-1.5">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} className="text-[#00D1FF]" />
                        {selectedSegment.center[0].toFixed(4)},{' '}
                        {selectedSegment.center[1].toFixed(4)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} className="text-[#00D1FF]" />
                        Updated {new Date(selectedSegment.last_updated_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {selectedSegment.insufficient_data ? (
                      <div className="px-3 py-2 rounded-xl bg-[#64748B]/20 border border-[#64748B]/40 text-center">
                        <div className="text-xs font-bold text-[#CBD5E1]">INSUFFICIENT</div>
                        <div className="text-[10px] text-[#94A3B8]">DATA</div>
                      </div>
                    ) : (
                      <div
                        className={`px-4 py-2.5 rounded-xl border text-center ${
                          BAND_CONFIG[selectedSegment.band].badgeBg
                        } ${BAND_CONFIG[selectedSegment.band].badgeBorder}`}
                      >
                        <div
                          className={`text-2xl font-extrabold ${
                            BAND_CONFIG[selectedSegment.band].badgeText
                          }`}
                        >
                          {selectedSegment.score}
                          <span className="text-xs font-normal text-[#CFE0E4]">/100</span>
                        </div>
                        <div className="text-[11px] font-semibold text-white">
                          {selectedSegment.status_label}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Calculation Summary Box */}
                <div className="bg-[#132329] border border-[#2A444E] rounded-lg p-3.5 space-y-2">
                  <div className="text-xs font-semibold text-[#00D1FF] flex items-center justify-between">
                    <span>Score Calculation Explanation</span>
                    {!selectedSegment.insufficient_data && (
                      <span className="text-[#F87171]">
                        Total Penalty: -{selectedSegment.total_deduction} pts
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#CFE0E4] leading-relaxed">
                    {selectedSegment.insufficient_data
                      ? selectedSegment.insufficient_reason
                      : selectedSegment.formula_explanation}
                  </p>
                  {selectedSegment.duplicate_sightings_ignored > 0 && (
                    <div className="text-[11px] text-[#4ADE80] bg-[#1F9D68]/10 border border-[#1F9D68]/30 rounded px-2.5 py-1.5">
                      ✓ Deduplication Active: {selectedSegment.duplicate_sightings_ignored}{' '}
                      duplicate bus/citizen report(s) of the same physical defect were excluded from
                      lowering this score.
                    </div>
                  )}
                </div>

                {/* Inspector Tabs */}
                <div className="flex border-b border-[#2A444E] text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('deductions')}
                    className={`px-3.5 py-2 border-b-2 transition-colors ${
                      activeTab === 'deductions'
                        ? 'border-[#00D1FF] text-[#00D1FF]'
                        : 'border-transparent text-[#8FA8AE] hover:text-white'
                    }`}
                  >
                    Score Deductions ({selectedSegment.deduction_breakdown.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('active')}
                    className={`px-3.5 py-2 border-b-2 transition-colors ${
                      activeTab === 'active'
                        ? 'border-[#00D1FF] text-[#00D1FF]'
                        : 'border-transparent text-[#8FA8AE] hover:text-white'
                    }`}
                  >
                    Active Issues ({selectedSegment.active_issues.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-3.5 py-2 border-b-2 transition-colors ${
                      activeTab === 'history'
                        ? 'border-[#00D1FF] text-[#00D1FF]'
                        : 'border-transparent text-[#8FA8AE] hover:text-white'
                    }`}
                  >
                    Complaint History ({selectedSegment.complaint_history.length})
                  </button>
                </div>

                {/* Tab Content */}
                <div className="max-h-[400px] overflow-y-auto space-y-2.5 pr-1">
                  {activeTab === 'deductions' && (
                    <>
                      {selectedSegment.insufficient_data ? (
                        <div className="text-center py-8 text-xs text-[#8FA8AE]">
                          <ShieldAlert size={28} className="mx-auto mb-2 text-[#64748B]" />
                          <p className="font-semibold text-white">
                            Insufficient Corridor Telemetry
                          </p>
                          <p className="mt-1">
                            No verified GPS complaints or recent bus inspection passes recorded on
                            this segment. Score is withheld rather than estimated.
                          </p>
                        </div>
                      ) : selectedSegment.deduction_breakdown.length === 0 ? (
                        <div className="text-center py-8 text-xs text-[#8FA8AE]">
                          <CheckCircle2 size={28} className="mx-auto mb-2 text-[#1F9D68]" />
                          <p className="font-semibold text-white">
                            No Active Structural Deductions (100/100)
                          </p>
                          <p className="mt-1">
                            All verified potholes, road damage, and waterlogging issues on this
                            corridor are resolved.
                          </p>
                        </div>
                      ) : (
                        selectedSegment.deduction_breakdown.map(
                          (ded: RoadHealthIssueDeduction) => (
                            <div
                              key={ded.id}
                              className="bg-[#132329] border border-[#2A444E] rounded-lg p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Link
                                    to={`/dashboard/complaints/${ded.complaint_id}`}
                                    className="text-xs font-bold text-[#00D1FF] hover:underline flex items-center gap-1"
                                  >
                                    {ded.complaint_id}
                                    <ExternalLink size={11} />
                                  </Link>
                                  <span className="text-xs font-semibold text-white">
                                    {ded.category}
                                  </span>
                                  <Badge variant={severityVariant(ded.severity)} size="sm">
                                    {severityLabel(ded.severity)}
                                  </Badge>
                                </div>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#F87171]">
                                  <TrendingDown size={13} />-{ded.total_deduction} pts
                                </span>
                              </div>
                              <p className="text-[11px] text-[#CFE0E4]">{ded.description}</p>
                              <div className="flex items-center justify-between text-[10px] text-[#8FA8AE]">
                                <span>
                                  Base: -{ded.base_deduction} pts • Age ({ded.age_days}d): -
                                  {ded.age_deduction} pts
                                </span>
                                {ded.observation_count > 1 && (
                                  <span className="text-[#4ADE80]">
                                    {ded.observation_count} sightings consolidated (counted once)
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        )
                      )}
                    </>
                  )}

                  {activeTab === 'active' && (
                    <>
                      {selectedSegment.active_issues.length === 0 ? (
                        <div className="text-center py-8 text-xs text-[#8FA8AE]">
                          No active unresolved issues on this road segment.
                        </div>
                      ) : (
                        selectedSegment.active_issues.map((issue) => (
                          <div
                            key={issue.id}
                            className="bg-[#132329] border border-[#2A444E] rounded-lg p-3 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <Link
                                to={`/dashboard/complaints/${issue.complaint_id}`}
                                className="text-xs font-bold text-[#00D1FF] hover:underline flex items-center gap-1"
                              >
                                {issue.complaint_id}
                                <ExternalLink size={11} />
                              </Link>
                              <div className="flex items-center gap-1.5">
                                <Badge variant={severityVariant(issue.severity)} size="sm">
                                  {severityLabel(issue.severity)}
                                </Badge>
                                <StatusBadge status={issue.status} />
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-white">{issue.category}</div>
                            <p className="text-[11px] text-[#AABDC2] line-clamp-2">
                              {issue.description}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-[#8FA8AE] pt-1">
                              <span>
                                Reported: {new Date(issue.first_detected_at).toLocaleDateString()}
                              </span>
                              <span>
                                {(issue.observation_count || 1) > 1
                                  ? `${issue.observation_count} consolidated sightings`
                                  : 'Unique report'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {activeTab === 'history' && (
                    <>
                      {selectedSegment.complaint_history.length === 0 ? (
                        <div className="text-center py-8 text-xs text-[#8FA8AE]">
                          No historical complaints recorded for this road segment.
                        </div>
                      ) : (
                        selectedSegment.complaint_history.map((item) => (
                          <div
                            key={item.id}
                            className="bg-[#132329] border border-[#2A444E] rounded-lg p-3 flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/dashboard/complaints/${item.complaint_id}`}
                                  className="text-xs font-bold text-[#00D1FF] hover:underline"
                                >
                                  {item.complaint_id}
                                </Link>
                                <span className="text-xs text-white font-medium">
                                  {item.category}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#8FA8AE] mt-0.5">
                                {new Date(item.first_detected_at).toLocaleDateString()} •{' '}
                                {item.observation_count} sighting(s)
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={severityVariant(item.severity)} size="sm">
                                {severityLabel(item.severity)}
                              </Badge>
                              <StatusBadge status={item.status} />
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#1B2F37] border border-[#2A444E] rounded-xl p-6 text-center text-sm text-[#8FA8AE]">
                Select a road segment on the map or table to inspect its health score and active
                issues.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default RoadHealthPage
