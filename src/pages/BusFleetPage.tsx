import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bus as BusIcon,
  Plus,
  Search,
  MapPin,
  Navigation,
  Radio,
  Edit3,
  Power,
  Eye,
  Clock,
  Activity,
  X,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  FlaskConical,
} from 'lucide-react'
import { MapContainer, CircleMarker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import DashboardLayout from '../components/Layout/DashboardLayout'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import {
  SafeTileLayer,
  MapInvalidator,
  MapOverlayToolbar,
} from '../components/Map/InteractiveMap'
import {
  getBuses,
  getBusRoutes,
  createBus,
  updateBus,
  deactivateBus,
  pushBusGps,
} from '../api/buses'
import { useAuth } from '../contexts/AuthContext'
import type { Bus, BusGpsStatus, BusRoute } from '../types'
import { formatDistanceToNow } from 'date-fns'

const PUNE_CENTER: [number, number] = [18.5204, 73.8567]

const GPS_STATUS_META: Record<
  BusGpsStatus,
  { label: string; color: string; badgeClass: string; dotColor: string }
> = {
  live: {
    label: 'Live GPS',
    color: '#10b981',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dotColor: 'bg-emerald-400 animate-pulse',
  },
  stale: {
    label: 'Stale GPS',
    color: '#f59e0b',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dotColor: 'bg-amber-400',
  },
  offline: {
    label: 'Offline',
    color: '#64748b',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    dotColor: 'bg-slate-500',
  },
  simulated: {
    label: 'Simulated Telemetry',
    color: '#a855f7',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
}

export default function BusFleetPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [buses, setBuses] = useState<Bus[]>([])
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [search, setSearch] = useState('')
  const [gpsFilter, setGpsFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modal state for Add / Edit Bus
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBus, setEditingBus] = useState<Bus | null>(null)
  const [formBusNumber, setFormBusNumber] = useState('')
  const [formRouteName, setFormRouteName] = useState('')
  const [formDriverId, setFormDriverId] = useState('')
  const [formDriverName, setFormDriverName] = useState('')
  const [formGpsStatus, setFormGpsStatus] = useState<BusGpsStatus>('offline')
  const [formLat, setFormLat] = useState('')
  const [formLng, setFormLng] = useState('')
  const [formSpeed, setFormSpeed] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const loadFleet = useCallback(async () => {
    setIsLoading(true)
    try {
      const [busData, routeData] = await Promise.all([
        getBuses({
          search: search || undefined,
          gps_status: gpsFilter || undefined,
          status: statusFilter || undefined,
        }),
        getBusRoutes(),
      ])
      setBuses(busData)
      setRoutes(routeData)
    } catch (err) {
      console.error('Failed to load fleet:', err)
      showToast('error', 'Failed to load registered buses.')
    } finally {
      setIsLoading(false)
    }
  }, [search, gpsFilter, statusFilter])

  useEffect(() => {
    loadFleet()
  }, [loadFleet])

  const openAddModal = () => {
    setEditingBus(null)
    setFormBusNumber('PMPML-208')
    setFormRouteName('Route 24 - Katraj to Shivajinagar')
    setFormDriverId('DRV-PMPML-109')
    setFormDriverName('Suresh Jadhav')
    setFormGpsStatus('offline')
    setFormLat('18.5195')
    setFormLng('73.8553')
    setFormSpeed('0')
    setModalOpen(true)
  }

  const openEditModal = (bus: Bus) => {
    setEditingBus(bus)
    setFormBusNumber(bus.bus_number)
    setFormRouteName(bus.route_name)
    setFormDriverId(bus.driver_id || '')
    setFormDriverName(bus.driver_name || '')
    setFormGpsStatus(bus.gps_status || 'offline')
    setFormLat(bus.current_latitude !== undefined && bus.current_latitude !== null ? String(bus.current_latitude) : '')
    setFormLng(bus.current_longitude !== undefined && bus.current_longitude !== null ? String(bus.current_longitude) : '')
    setFormSpeed(bus.current_speed !== undefined && bus.current_speed !== null ? String(bus.current_speed) : '')
    setModalOpen(true)
  }

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formBusNumber.trim() || !formRouteName.trim()) {
      showToast('error', 'Bus Number and Assigned Route are required.')
      return
    }
    setIsSaving(true)
    try {
      const payload: Partial<Bus> = {
        bus_number: formBusNumber.trim(),
        route_name: formRouteName.trim(),
        driver_id: formDriverId.trim() || undefined,
        driver_name: formDriverName.trim() || undefined,
        gps_status: formGpsStatus,
        current_latitude: formLat ? parseFloat(formLat) : undefined,
        current_longitude: formLng ? parseFloat(formLng) : undefined,
        current_speed: formSpeed ? parseFloat(formSpeed) : undefined,
      }
      if (editingBus) {
        await updateBus(editingBus.id, payload)
        showToast('success', `Updated bus ${formBusNumber}`)
      } else {
        await createBus(payload)
        showToast('success', `Registered new bus ${formBusNumber}`)
      }
      setModalOpen(false)
      await loadFleet()
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save bus')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (bus: Bus) => {
    try {
      if (bus.is_active) {
        await deactivateBus(bus.id)
        showToast('success', `Deactivated ${bus.bus_number}`)
      } else {
        await updateBus(bus.id, { is_active: true, status: 'active' })
        showToast('success', `Reactivated ${bus.bus_number}`)
      }
      await loadFleet()
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to update bus status')
    }
  }

  const handlePingRealGps = (bus: Bus) => {
    if (!navigator.geolocation) {
      showToast('error', 'Browser Geolocation is not available.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await pushBusGps(bus.id, {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 26,
            is_simulated: false,
          })
          showToast('success', `Live GPS ping recorded for ${bus.bus_number}`)
          await loadFleet()
        } catch {
          showToast('error', 'Failed to send GPS telemetry')
        }
      },
      async () => {
        // If browser geolocation permission denied, allow simulated waypoint ping clearly marked
        const baseLat = bus.current_latitude ?? 18.5204
        const baseLng = bus.current_longitude ?? 73.8567
        try {
          await pushBusGps(bus.id, {
            latitude: Number((baseLat + (Math.random() - 0.5) * 0.004).toFixed(6)),
            longitude: Number((baseLng + (Math.random() - 0.5) * 0.004).toFixed(6)),
            speed: 24,
            is_simulated: true,
          })
          showToast(
            'success',
            `Browser GPS unavailable — logged clearly labelled Simulated GPS ping for ${bus.bus_number}`
          )
          await loadFleet()
        } catch {
          showToast('error', 'Failed to update GPS location')
        }
      }
    )
  }

  const liveCount = buses.filter((b) => b.gps_status === 'live').length
  const simulatedCount = buses.filter((b) => b.gps_status === 'simulated').length
  const staleOrOfflineCount = buses.filter(
    (b) => b.gps_status === 'stale' || b.gps_status === 'offline'
  ).length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <BusIcon size={22} className="text-teal-400" />
              Live Bus Monitoring
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Monitor registered buses, routes, GPS status, and recent road detections.
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={openAddModal}
              className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-lg shadow-teal-500/20"
            >
              <Plus size={16} />
              Register New Bus
            </button>
          )}
        </div>

        {toast && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {toast.text}
            </span>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Fleet KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block">Total Registered Buses</span>
            <span className="text-2xl font-bold text-white mt-1 block">{buses.length}</span>
            <span className="text-[11px] text-teal-400 mt-1 block">
              {buses.filter((b) => b.is_active).length} active on duty
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Wifi size={13} className="text-emerald-400" /> Genuine Live GPS
            </span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">{liveCount}</span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Verified hardware/browser GPS fix
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <FlaskConical size={13} className="text-purple-400" /> Simulated Vehicles
            </span>
            <span className="text-2xl font-bold text-purple-300 mt-1 block">{simulatedCount}</span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Synthetic route playback
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <WifiOff size={13} className="text-amber-400" /> Stale / Offline GPS
            </span>
            <span className="text-2xl font-bold text-amber-300 mt-1 block">
              {staleOrOfflineCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Awaiting fresh telemetry ping
            </span>
          </div>
        </div>

        {/* Interactive Fleet Map */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Navigation size={16} className="text-teal-400" />
              <h2 className="text-sm font-bold text-white">Interactive Fleet & Route Map</h2>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {Object.entries(GPS_STATUS_META).map(([key, meta]) => (
                <span key={key} className="flex items-center gap-1.5 text-slate-300">
                  <span className={`w-2.5 h-2.5 rounded-full ${meta.dotColor}`} />
                  {meta.label}
                </span>
              ))}
            </div>
          </div>

          <div className="h-[360px] relative">
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
                <MapInvalidator trigger={buses.length} />
                <MapOverlayToolbar
                  fallbackLat={buses[0]?.current_latitude ?? PUNE_CENTER[0]}
                  fallbackLng={buses[0]?.current_longitude ?? PUNE_CENTER[1]}
                />

                {/* Route polylines */}
                {routes.map((r) => (
                  <Polyline
                    key={r.bus_id}
                    positions={r.waypoints.map((w) => [w.lat, w.lng] as [number, number])}
                    pathOptions={{
                      color: '#0d9488',
                      weight: 2,
                      dashArray: '6 6',
                      opacity: 0.6,
                    }}
                  />
                ))}

                {/* Bus markers */}
                {buses.map((bus) => {
                  if (
                    bus.current_latitude === undefined ||
                    bus.current_latitude === null ||
                    bus.current_longitude === undefined ||
                    bus.current_longitude === null
                  ) {
                    return null
                  }
                  const meta = GPS_STATUS_META[bus.gps_status || 'offline'] || GPS_STATUS_META.offline
                  return (
                    <CircleMarker
                      key={bus.id}
                      center={[bus.current_latitude, bus.current_longitude]}
                      radius={10}
                      pathOptions={{
                        color: meta.color,
                        fillColor: meta.color,
                        fillOpacity: 0.9,
                        weight: 3,
                      }}
                    >
                      <Popup>
                        <div className="text-slate-900 space-y-1 text-xs min-w-[190px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">🚌 {bus.bus_number}</span>
                            <span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-200">
                              {meta.label}
                            </span>
                          </div>
                          <p className="font-medium text-slate-700">{bus.route_name}</p>
                          <p className="text-slate-600">
                            Driver: {bus.driver_name || 'Unassigned'} ({bus.driver_id || 'N/A'})
                          </p>
                          <p className="text-slate-600 font-mono">
                            {bus.current_latitude.toFixed(4)}°N, {bus.current_longitude.toFixed(4)}°E ·{' '}
                            {bus.current_speed ?? 0} km/h
                          </p>
                          <button
                            onClick={() => navigate(`/dashboard/buses/${bus.id}`)}
                            className="text-teal-700 font-bold hover:underline block pt-1"
                          >
                            Inspect Bus & Journey History →
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            )}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by bus number, route, driver ID or name…"
              className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <select
            value={gpsFilter}
            onChange={(e) => setGpsFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">All GPS Modes</option>
            <option value="live">Live GPS Only</option>
            <option value="simulated">Simulated Only</option>
            <option value="stale">Stale GPS</option>
            <option value="offline">Offline</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">All Fleet Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated / Maintenance</option>
          </select>
        </div>

        {/* Registered Buses Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4">Bus Number</th>
                  <th className="py-3.5 px-4">Assigned Route</th>
                  <th className="py-3.5 px-4">Driver Identifier</th>
                  <th className="py-3.5 px-4">GPS Telemetry Status</th>
                  <th className="py-3.5 px-4">Latest Location & Speed</th>
                  <th className="py-3.5 px-4">AI Detections</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {buses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No registered buses match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  buses.map((bus) => {
                    const meta = GPS_STATUS_META[bus.gps_status || 'offline'] || GPS_STATUS_META.offline
                    return (
                      <tr
                        key={bus.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          !bus.is_active ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-xs">
                              🚌
                            </div>
                            <div>
                              <button
                                onClick={() => navigate(`/dashboard/buses/${bus.id}`)}
                                className="font-mono font-bold text-white hover:text-teal-300 transition-colors block"
                              >
                                {bus.bus_number}
                              </button>
                              <span
                                className={`text-[10px] uppercase font-semibold ${
                                  bus.is_active ? 'text-emerald-400' : 'text-red-400'
                                }`}
                              >
                                {bus.is_active ? 'Active Duty' : 'Deactivated'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-200 text-xs font-medium">
                          {bus.route_name}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-xs">
                            <span className="text-white font-medium block">
                              {bus.driver_name || 'Unassigned'}
                            </span>
                            <span className="font-mono text-slate-400 text-[11px]">
                              {bus.driver_id || 'No Driver ID'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.badgeClass}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                            {meta.label}
                          </span>
                          {bus.last_updated && (
                            <span className="block text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                              <Clock size={10} />
                              {(() => {
                                try {
                                  return formatDistanceToNow(new Date(bus.last_updated), {
                                    addSuffix: true,
                                  })
                                } catch {
                                  return 'recently'
                                }
                              })()}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {bus.current_latitude !== undefined &&
                          bus.current_latitude !== null &&
                          bus.current_longitude !== undefined &&
                          bus.current_longitude !== null ? (
                            <div className="text-xs font-mono text-slate-300">
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-teal-400" />
                                {bus.current_latitude.toFixed(4)}°N, {bus.current_longitude.toFixed(4)}°E
                              </span>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                Speed: {bus.current_speed ?? 0} km/h
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">No GPS coordinates</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-teal-300 font-mono text-xs font-semibold">
                              <Activity size={12} />
                              {bus.total_detections ?? bus.complaints_count ?? 0} issues
                            </span>
                            {bus.latest_issues && bus.latest_issues.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {bus.latest_issues.slice(0, 2).map((iss) => (
                                  <button
                                    key={iss.id}
                                    type="button"
                                    onClick={() => navigate(`/dashboard/complaints/${iss.complaint_id}`)}
                                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#101C23] hover:bg-[#367F77] text-[#91C8BD] hover:text-[#F4F7F7] border border-[#2A4550] transition-colors"
                                    title={`${iss.category} (${iss.status})`}
                                  >
                                    {iss.complaint_id}: {iss.category}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/dashboard/buses/${bus.id}`)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 transition-colors"
                              title="View Bus Details & Historical Journey"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handlePingRealGps(bus)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                              title="Send GPS Telemetry Ping"
                            >
                              <Radio size={14} />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => openEditModal(bus)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                                  title="Edit Bus"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleToggleActive(bus)}
                                  className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors ${
                                    bus.is_active ? 'text-amber-400' : 'text-emerald-400'
                                  }`}
                                  title={bus.is_active ? 'Deactivate Bus' : 'Reactivate Bus'}
                                >
                                  <Power size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Bus Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BusIcon size={18} className="text-teal-400" />
                {editingBus ? `Edit Bus ${editingBus.bus_number}` : 'Register Municipal Transit Bus'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBus} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Bus Number *</label>
                  <input
                    type="text"
                    required
                    value={formBusNumber}
                    onChange={(e) => setFormBusNumber(e.target.value)}
                    placeholder="e.g. PMPML-208"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    GPS Connectivity Mode
                  </label>
                  <select
                    value={formGpsStatus}
                    onChange={(e) => setFormGpsStatus(e.target.value as BusGpsStatus)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  >
                    <option value="live">Live GPS (Genuine Hardware/Browser)</option>
                    <option value="simulated">Simulated Telemetry</option>
                    <option value="stale">Stale GPS</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Assigned Route *</label>
                <input
                  type="text"
                  required
                  value={formRouteName}
                  onChange={(e) => setFormRouteName(e.target.value)}
                  placeholder="e.g. Route 24 - Katraj to Shivajinagar"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Driver Identifier</label>
                  <input
                    type="text"
                    value={formDriverId}
                    onChange={(e) => setFormDriverId(e.target.value)}
                    placeholder="e.g. DRV-PMPML-109"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Driver Full Name</label>
                  <input
                    type="text"
                    value={formDriverName}
                    onChange={(e) => setFormDriverName(e.target.value)}
                    placeholder="e.g. Suresh Jadhav"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    placeholder="18.5204"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value)}
                    placeholder="73.8567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Speed (km/h)</label>
                  <input
                    type="number"
                    step="any"
                    value={formSpeed}
                    onChange={(e) => setFormSpeed(e.target.value)}
                    placeholder="25"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : editingBus ? 'Save Changes' : 'Register Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
