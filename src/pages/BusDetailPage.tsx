import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bus as BusIcon,
  MapPin,
  Navigation,
  Clock,
  Radio,
  AlertTriangle,
  CheckCircle2,
  User,
  Activity,
  Camera,
  FileText,
} from 'lucide-react'
import { MapContainer, CircleMarker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import DashboardLayout from '../components/Layout/DashboardLayout'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import StatusBadge from '../components/Complaints/StatusBadge'
import {
  SafeTileLayer,
  MapInvalidator,
  MapOverlayToolbar,
} from '../components/Map/InteractiveMap'
import { getBusDetail, pushBusGps } from '../api/buses'
import type { BusDetail } from '../types'
import { categoryEmoji, categoryLabel } from '../utils/categoryHelpers'
import { safeFormat } from '../utils/dateHelpers'

export default function BusDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [bus, setBus] = useState<BusDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [pingMessage, setPingMessage] = useState('')

  const loadDetail = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const detail = await getBusDetail(id)
      setBus(detail)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load bus details')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const handleRecordWaypoint = async (simulated: boolean) => {
    if (!bus) return
    if (!simulated && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await pushBusGps(bus.id, {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 28,
            is_simulated: false,
          })
          setPingMessage('Recorded genuine browser GPS coordinate into historical journey.')
          await loadDetail()
        },
        async () => {
          setPingMessage('Browser GPS permission denied — use Simulated Demo Step instead.')
        }
      )
      return
    }

    const baseLat = bus.current_latitude ?? 18.5204
    const baseLng = bus.current_longitude ?? 73.8567
    await pushBusGps(bus.id, {
      latitude: Number((baseLat + (Math.random() - 0.45) * 0.004).toFixed(6)),
      longitude: Number((baseLng + (Math.random() - 0.45) * 0.004).toFixed(6)),
      speed: Math.round(20 + Math.random() * 18),
      is_simulated: true,
    })
    setPingMessage('Appended clearly labelled simulated demo waypoint to bus journey log.')
    await loadDetail()
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !bus) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 space-y-3">
          <AlertTriangle size={36} className="text-red-400 mx-auto" />
          <p className="text-white font-semibold">{error || 'Bus not found'}</p>
          <button
            onClick={() => navigate('/dashboard/buses')}
            className="text-teal-400 hover:underline text-sm"
          >
            ← Back to Live Bus Monitoring
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const center: [number, number] =
    bus.current_latitude && bus.current_longitude
      ? [bus.current_latitude, bus.current_longitude]
      : [18.5204, 73.8567]

  const historyCoords: [number, number][] = (bus.gps_history || []).map((pt) => [
    pt.latitude,
    pt.longitude,
  ])

  const cameraOnline = bus.is_active && bus.gps_status !== 'offline'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate('/dashboard/buses')}
            className="flex items-center gap-1.5 text-[#AABDC2] hover:text-[#F4F7F7] text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Live Bus Monitoring
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleRecordWaypoint(false)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Radio size={13} />
              Ping Live Browser GPS
            </button>
            <button
              onClick={() => handleRecordWaypoint(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Navigation size={13} />
              Simulate Demo Route Step
            </button>
            <button
              onClick={() => navigate('/dashboard/bus-camera')}
              className="px-3.5 py-1.5 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Camera size={13} />
              Open Bus AI Camera
            </button>
          </div>
        </div>

        {pingMessage && (
          <div className="p-3 rounded-xl bg-[#1C3038] border border-[#367F77] text-[#91C8BD] text-xs flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{pingMessage}</span>
          </div>
        )}

        {/* Dedicated Bus Summary Card (Bus ID, Reg No, Route, Driver, GPS, Last Update, Operational Status, Camera Status) */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#367F77]/20 border border-[#367F77]/40 flex items-center justify-center text-2xl">
                🚌
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-[#F4F7F7] font-mono">
                    {bus.bus_number}
                  </h1>
                  <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-[#101C23] border border-[#2A444E] text-[#91C8BD]">
                    Reg: {bus.registration_number || `MH-12-CY-100${bus.id}`}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase border ${
                      bus.gps_status === 'live'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : bus.gps_status === 'simulated'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : bus.gps_status === 'stale'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-[#101C23] text-[#AABDC2] border-[#2A444E]'
                    }`}
                  >
                    {bus.gps_status === 'live'
                      ? 'Real Live GPS'
                      : bus.gps_status === 'simulated'
                      ? 'Simulated Demo GPS'
                      : `${bus.gps_status} GPS`}
                  </span>
                </div>
                <p className="text-[#AABDC2] text-sm mt-1">
                  Assigned Route: <strong className="text-[#F4F7F7]">{bus.route_name}</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs pt-4 border-t border-[#2A444E]">
            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <User size={11} /> Driver Details
              </span>
              <span className="text-[#F4F7F7] font-semibold block">
                {bus.driver_name || 'Unassigned'}
              </span>
              <span className="text-[#AABDC2] font-mono text-[11px] block">
                {bus.driver_id || 'N/A'} {bus.driver_phone ? `· ${bus.driver_phone}` : ''}
              </span>
            </div>

            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <MapPin size={11} /> Current GPS Location
              </span>
              <span className="text-[#F4F7F7] font-mono block">
                {bus.current_latitude?.toFixed(4)}°N, {bus.current_longitude?.toFixed(4)}°E
              </span>
              <span className="text-[#AABDC2] text-[11px]">
                Speed: {bus.current_speed ?? 0} km/h
              </span>
            </div>

            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <Clock size={11} /> Last Telemetry Update
              </span>
              <span className="text-[#F4F7F7] font-mono block">
                {safeFormat(bus.last_updated || bus.last_seen_at, 'dd MMM HH:mm:ss')}
              </span>
            </div>

            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <Radio size={11} /> Operational Status
              </span>
              <span
                className={`font-semibold block ${
                  bus.is_active ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {bus.is_active ? 'Active Service' : 'Maintenance / Offline'}
              </span>
            </div>

            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <Camera size={11} /> Camera Status
              </span>
              <span
                className={`font-semibold block ${
                  cameraOnline ? 'text-[#91C8BD]' : 'text-[#AABDC2]'
                }`}
              >
                {cameraOnline ? 'AI Camera Ready' : 'Standby / Offline'}
              </span>
            </div>

            <div>
              <span className="text-[#AABDC2] block mb-0.5 flex items-center gap-1">
                <Activity size={11} /> Inspection Summary
              </span>
              <span className="text-[#91C8BD] font-bold font-mono text-sm block">
                {bus.detections?.length ?? 0} scans · {bus.complaints?.length ?? 0} reports
              </span>
            </div>
          </div>
        </div>

        {/* Map + Historical Journey Log */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#1C3038] border border-[#2A444E] rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-[#2A444E] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#F4F7F7] flex items-center gap-2">
                <Navigation size={15} className="text-[#91C8BD]" />
                Historical GPS Journey Trail & Linked Detections
              </h2>
              <span className="text-xs text-[#AABDC2]">
                {historyCoords.length} GPS points · {bus.complaints?.length ?? 0} reports
              </span>
            </div>
            <div className="h-[420px] relative">
              <MapContainer
                center={center}
                zoom={13}
                scrollWheelZoom={false}
                touchZoom={true}
                dragging={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
              >
                <SafeTileLayer />
                <MapInvalidator trigger={bus.gps_history?.length} />
                <MapOverlayToolbar
                  fallbackLat={bus.current_latitude ?? center[0]}
                  fallbackLng={bus.current_longitude ?? center[1]}
                />

                {/* Historical GPS Trail */}
                {historyCoords.length > 1 && (
                  <Polyline
                    positions={historyCoords}
                    pathOptions={{ color: '#367F77', weight: 4, opacity: 0.85 }}
                  />
                )}

                {/* Historical Waypoint dots */}
                {bus.gps_history?.map((pt, idx) => (
                  <CircleMarker
                    key={idx}
                    center={[pt.latitude, pt.longitude]}
                    radius={4}
                    pathOptions={{
                      color: pt.is_simulated ? '#f59e0b' : '#10b981',
                      fillColor: pt.is_simulated ? '#f59e0b' : '#10b981',
                      fillOpacity: 0.8,
                    }}
                  >
                    <Popup>
                      <div className="text-slate-900 text-xs space-y-0.5">
                        <p className="font-bold">
                          {pt.is_simulated ? 'Simulated Demo GPS Point' : 'Verified Live GPS Point'}
                        </p>
                        <p className="font-mono">
                          {pt.latitude.toFixed(4)}, {pt.longitude.toFixed(4)}
                        </p>
                        <p>Speed: {pt.speed} km/h</p>
                        <p className="text-slate-500">{safeFormat(pt.recorded_at, 'HH:mm:ss')}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                {/* Current Bus Position */}
                {bus.current_latitude && bus.current_longitude && (
                  <CircleMarker
                    center={[bus.current_latitude, bus.current_longitude]}
                    radius={11}
                    pathOptions={{
                      color: '#367F77',
                      fillColor: '#91C8BD',
                      fillOpacity: 1,
                      weight: 3,
                    }}
                  >
                    <Popup>
                      <div className="text-slate-900 text-xs font-bold">
                        🚌 {bus.bus_number} (Latest Position)
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {/* Linked Civic Detections */}
                {bus.complaints?.map((c) => (
                  <CircleMarker
                    key={c.id}
                    center={[c.latitude, c.longitude]}
                    radius={8}
                    pathOptions={{
                      color: '#ef4444',
                      fillColor: '#f97316',
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-slate-900 text-xs space-y-1">
                        <p className="font-mono font-bold">{c.complaint_id}</p>
                        <p className="font-semibold">
                          {categoryEmoji(c.category)} {categoryLabel(c.category)}
                        </p>
                        <button
                          onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                          className="text-teal-700 font-bold hover:underline block"
                        >
                          View Issue →
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Stored GPS History Timeline */}
          <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 flex flex-col h-[475px]">
            <h2 className="text-sm font-bold text-[#F4F7F7] mb-3 flex items-center gap-2">
              <Clock size={15} className="text-[#91C8BD]" />
              Stored GPS Telemetry Log
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {!bus.gps_history || bus.gps_history.length === 0 ? (
                <p className="text-xs text-[#AABDC2] py-8 text-center">
                  No historical GPS points recorded yet.
                </p>
              ) : (
                [...bus.gps_history].reverse().map((pt, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-[#101C23] border border-[#2A444E] text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono text-[#F4F7F7] font-medium">
                        {pt.latitude.toFixed(5)}°N, {pt.longitude.toFixed(5)}°E
                      </p>
                      <p className="text-[11px] text-[#AABDC2] mt-0.5">
                        {safeFormat(pt.recorded_at, 'dd MMM HH:mm:ss')} · {pt.speed} km/h
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        pt.is_simulated
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {pt.is_simulated ? 'Simulated Demo' : 'Live GPS'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent AI Detections */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[#F4F7F7] mb-4 flex items-center gap-2">
            <Camera size={16} className="text-[#91C8BD]" />
            Recent AI Detections by {bus.bus_number} ({bus.detections?.length ?? 0})
          </h2>

          {!bus.detections || bus.detections.length === 0 ? (
            <p className="text-xs text-[#AABDC2] py-6 text-center">
              No AI camera detections recorded for this bus yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bus.detections.slice(0, 6).map((det, idx) => (
                <div
                  key={det.id ?? idx}
                  className="p-4 rounded-xl bg-[#101C23] border border-[#2A444E] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#F4F7F7]">
                      {categoryEmoji(det.category)} {categoryLabel(det.category)}
                    </span>
                    <span className="font-mono font-bold text-[#91C8BD]">
                      {Math.round(det.confidence * 100)}% conf.
                    </span>
                  </div>
                  <p className="text-[#AABDC2] line-clamp-2">
                    {det.description || `${det.category} detected along ${bus.route_name}`}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-[#AABDC2] pt-2 border-t border-[#2A444E]">
                    <span>
                      {det.is_simulated ? 'Demo Simulation' : det.ai_model || 'Gemini Vision'}
                    </span>
                    <span className="font-mono">{safeFormat(det.timestamp, 'dd MMM HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historical Inspection Reports Linked to this Bus */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[#F4F7F7] mb-4 flex items-center gap-2">
            <FileText size={16} className="text-[#91C8BD]" />
            Historical Inspection Reports Linked to {bus.bus_number} ({bus.complaints?.length ?? 0})
          </h2>

          {!bus.complaints || bus.complaints.length === 0 ? (
            <p className="text-xs text-[#AABDC2] py-6 text-center">
              No civic inspection reports have been filed by this bus yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bus.complaints.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/dashboard/complaints/${c.complaint_id}`)}
                  className="p-4 rounded-xl bg-[#101C23] border border-[#2A444E] hover:border-[#367F77] cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#91C8BD]">
                      {c.complaint_id}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm font-semibold text-[#F4F7F7]">
                    {categoryEmoji(c.category)} {categoryLabel(c.category)}
                  </p>
                  <p className="text-xs text-[#AABDC2] line-clamp-2">{c.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-[#AABDC2] pt-2 border-t border-[#2A444E]">
                    <span className="font-mono">
                      {c.latitude.toFixed(4)}°N, {c.longitude.toFixed(4)}°E
                    </span>
                    <span>{safeFormat(c.first_detected_at, 'dd MMM HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
