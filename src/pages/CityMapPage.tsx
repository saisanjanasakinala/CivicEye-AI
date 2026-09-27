import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Map, Layers, Bus as BusIcon, Filter, Wifi, Clock } from 'lucide-react'
import { MapContainer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import DashboardLayout from '../components/Layout/DashboardLayout'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import StatusBadge from '../components/Complaints/StatusBadge'
import {
  SafeTileLayer,
  MapInvalidator,
  MapOverlayToolbar,
  MapInteractiveController,
  MapSearchBox,
  type GeocodeResult,
} from '../components/Map/InteractiveMap'
import { getMapComplaints } from '../api/complaints'
import { getBuses } from '../api/buses'
import type { Bus, MapComplaint } from '../types'
import { categoryEmoji, categoryLabel } from '../utils/categoryHelpers'
import { safeFormat } from '../utils/dateHelpers'

const PUNE_CENTER: [number, number] = [18.5204, 73.8567]

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
}

const BUS_GPS_COLORS: Record<string, string> = {
  live: '#10b981',
  stale: '#f59e0b',
  offline: '#64748b',
  simulated: '#a855f7',
}

export default function CityMapPage() {
  const navigate = useNavigate()
  const [markers, setMarkers] = useState<MapComplaint[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [showBuses, setShowBuses] = useState<boolean>(true)
  const [liveGpsOnly, setLiveGpsOnly] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [flyTarget, setFlyTarget] = useState<{
    lat: number
    lng: number
    zoom?: number
    seq: number
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [mapData, busData] = await Promise.all([
          getMapComplaints({
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(severityFilter ? { severity: severityFilter } : {}),
          }),
          getBuses().catch(() => [] as Bus[]),
        ])
        setMarkers(mapData)
        setBuses(busData)
      } catch (err) {
        console.error('Failed to load map data', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [statusFilter, severityFilter])

  const displayedBuses = buses.filter((b) =>
    liveGpsOnly ? b.gps_status === 'live' : true
  )

  const handleSearchSelect = (res: GeocodeResult) => {
    setFlyTarget({ lat: res.lat, lng: res.lng, zoom: 15, seq: Date.now() })
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#F4F7F7] flex items-center gap-2">
              <Map size={22} className="text-[#91C8BD]" />
              Map and Hotspots
            </h1>
            <p className="text-[#AABDC2] text-xs sm:text-sm mt-0.5">
              {markers.length} complaints and {displayedBuses.length} buses across the city.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-[#AABDC2]">
              <Filter size={13} /> Filters:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#1C3038] border border-[#2A444E] rounded-lg px-3 py-1.5 text-[#F4F7F7] outline-none"
            >
              <option value="">All Statuses</option>
              <option value="new">Submitted</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="awaiting_verification">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-[#1C3038] border border-[#2A444E] rounded-lg px-3 py-1.5 text-[#F4F7F7] outline-none"
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <button
              onClick={() => setShowBuses((s) => !s)}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                showBuses
                  ? 'bg-[#367F77]/25 border-[#367F77] text-[#91C8BD]'
                  : 'bg-[#1C3038] border-[#2A444E] text-[#AABDC2]'
              }`}
            >
              <BusIcon size={13} />
              Buses ({displayedBuses.length})
            </button>

            {showBuses && (
              <button
                onClick={() => setLiveGpsOnly((v) => !v)}
                className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                  liveGpsOnly
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-[#1C3038] border-[#2A444E] text-[#AABDC2]'
                }`}
                title="Show only buses with genuine live GPS updates"
              >
                <Wifi size={13} />
                Live GPS Only
              </button>
            )}
          </div>
        </div>

        {/* Landmark & Ward Search Box */}
        <div className="max-w-xl">
          <MapSearchBox
            onSelectLocation={handleSearchSelect}
            placeholder="Search ward, landmark or street to focus map…"
          />
        </div>

        {/* Map Container */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl overflow-hidden h-[500px] relative">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <MapContainer
              center={PUNE_CENTER}
              zoom={12}
              scrollWheelZoom={false}
              touchZoom={true}
              dragging={true}
              zoomControl={false}
              style={{ height: '100%', width: '100%' }}
            >
              <SafeTileLayer />
              <MapInvalidator trigger={`${markers.length}-${displayedBuses.length}`} />
              <MapInteractiveController flyTarget={flyTarget} />
              <MapOverlayToolbar
                fallbackLat={flyTarget?.lat ?? markers[0]?.latitude ?? PUNE_CENTER[0]}
                fallbackLng={flyTarget?.lng ?? markers[0]?.longitude ?? PUNE_CENTER[1]}
              />

              {/* Complaint Markers */}
              {markers.map((m) => (
                <CircleMarker
                  key={m.id}
                  center={[m.latitude, m.longitude]}
                  radius={8}
                  pathOptions={{
                    color: SEVERITY_COLORS[m.severity] || '#14b8a6',
                    fillColor: SEVERITY_COLORS[m.severity] || '#14b8a6',
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-slate-900 space-y-1.5 min-w-[190px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-xs">{m.complaint_id}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="font-semibold text-sm">
                        {categoryEmoji(m.category)} {categoryLabel(m.category)}
                      </p>
                      {m.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">{m.description}</p>
                      )}
                      <button
                        onClick={() =>
                          navigate(`/dashboard/complaints/${m.complaint_id || m.id}`)
                        }
                        className="text-xs text-teal-700 font-semibold hover:underline block pt-1"
                      >
                        Open Details →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {/* Registered Buses */}
              {showBuses &&
                displayedBuses.map((b) =>
                  b.current_latitude && b.current_longitude ? (
                    <CircleMarker
                      key={`bus-${b.id}`}
                      center={[b.current_latitude, b.current_longitude]}
                      radius={11}
                      pathOptions={{
                        color: BUS_GPS_COLORS[b.gps_status || 'offline'] || '#0d9488',
                        fillColor: BUS_GPS_COLORS[b.gps_status || 'offline'] || '#2dd4bf',
                        fillOpacity: 0.95,
                        weight: 3,
                      }}
                    >
                      <Popup>
                        <div className="text-slate-900 space-y-1 text-xs min-w-[200px]">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm">🚌 {b.bus_number}</p>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 font-semibold uppercase text-[10px]">
                              {b.gps_status === 'simulated'
                                ? 'Simulated Demo'
                                : `${b.gps_status} GPS`}
                            </span>
                          </div>
                          <p className="font-medium text-slate-700">{b.route_name}</p>
                          <p className="text-slate-600 font-mono">
                            {b.current_latitude.toFixed(4)}°N, {b.current_longitude.toFixed(4)}°E
                          </p>
                          <p className="text-slate-500 flex items-center gap-1">
                            <Clock size={11} />
                            {b.last_updated
                              ? safeFormat(b.last_updated, 'dd MMM HH:mm:ss')
                              : 'No recent ping'}
                          </p>
                          <button
                            onClick={() => navigate(`/dashboard/buses/${b.id}`)}
                            className="text-teal-700 font-bold hover:underline block pt-1"
                          >
                            Bus Details →
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ) : null
                )}
            </MapContainer>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 text-xs text-[#AABDC2] bg-[#1C3038] border border-[#2A444E] rounded-xl px-4 py-3">
          <span className="font-semibold text-[#F4F7F7] flex items-center gap-1.5">
            <Layers size={14} className="text-[#91C8BD]" />
            Priority:
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Critical
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500" /> High
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-500" /> Medium
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Low
          </span>
          <span className="font-semibold text-[#F4F7F7] ml-auto">Bus Telemetry:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Live GPS
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-500" /> Simulated Demo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> Stale
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-500" /> Offline
          </span>
        </div>
      </div>
    </DashboardLayout>
  )
}
