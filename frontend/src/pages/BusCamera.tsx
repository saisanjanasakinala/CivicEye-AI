import { useState, useEffect } from 'react'
import { Radio, MapPin, Gauge, Info } from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import BusCameraFeed from '../components/Camera/BusCameraFeed'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import { getBuses } from '../api/buses'
import type { Bus } from '../types'

export default function BusCamera() {
  const [buses, setBuses] = useState<Bus[]>([])
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getBuses()
      .then((data) => {
        setBuses(data)
        if (data.length > 0) setSelectedBus(data[0])
      })
      .catch(() => {
        // Use mock buses if API not ready
        const mocks: Bus[] = [
          { id: 1, bus_number: 'PMC-11', route_name: 'Route 11 — Swargate to Katraj', is_active: true },
          { id: 2, bus_number: 'PMC-47', route_name: 'Route 47 — Shivajinagar to Hadapsar', is_active: true },
          { id: 3, bus_number: 'PMC-99', route_name: 'Route 99 — Kothrud to Viman Nagar', is_active: false },
        ]
        setBuses(mocks)
        setSelectedBus(mocks[0])
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Bus Camera Feed</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Real-time AI detection on live bus routes
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-teal-400">
            <Radio size={14} className="live-dot" />
            {buses.filter((b) => b.is_active).length} buses active
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Left: Camera + Controls */}
          <div className="xl:col-span-3 space-y-4">
            {/* Bus selector */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Bus
              </label>
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <select
                  value={selectedBus?.id ?? ''}
                  onChange={(e) => {
                    const bus = buses.find((b) => String(b.id) === e.target.value) ?? null
                    setSelectedBus(bus)
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-teal-500"
                >
                  {buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.bus_number} — {bus.route_name}
                      {!bus.is_active ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <BusCameraFeed bus={selectedBus} />
          </div>

          {/* Right: Bus info panel */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Info size={16} className="text-teal-400" />
                <h3 className="font-semibold text-white text-sm">Bus Info</h3>
              </div>
              {selectedBus ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Bus ID</p>
                    <p className="text-white font-mono font-semibold">{selectedBus.bus_number}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Route</p>
                    <p className="text-white text-sm">{selectedBus.route_name}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">GPS Position</p>
                    <div className="flex items-start gap-1.5 text-slate-300 text-sm">
                      <MapPin size={13} className="text-teal-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div>Pune City Routes</div>
                        <div className="text-slate-500 text-xs">GPS tracked via route</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Driver</p>
                    <div className="flex items-center gap-1.5 text-slate-300 text-sm">
                      <Gauge size={13} className="text-teal-400" />
                      {selectedBus.driver_name ?? 'Assigned Driver'}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Status</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${selectedBus.is_active ? 'bg-emerald-400 live-dot' : 'bg-slate-500'}`}
                      />
                      <span className={`text-sm ${selectedBus.is_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {selectedBus.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Camera</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${selectedBus.is_active ? 'bg-teal-400 live-dot' : 'bg-slate-500'}`}
                      />
                      <span className={`text-sm ${selectedBus.is_active ? 'text-teal-400' : 'text-slate-400'}`}>
                        {selectedBus.is_active ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No bus selected</p>
              )}
            </div>

            {/* Detection guide */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <h3 className="font-semibold text-white text-sm mb-3">Detection Guide</h3>
              <div className="space-y-2 text-xs text-slate-400">
                {[
                  { color: 'bg-orange-400', label: 'Pothole' },
                  { color: 'bg-red-400', label: 'Garbage' },
                  { color: 'bg-amber-400', label: 'Dustbin' },
                  { color: 'bg-emerald-400', label: 'Fallen Tree' },
                  { color: 'bg-blue-400', label: 'Waterlogging' },
                  { color: 'bg-yellow-400', label: 'Streetlight' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded ${item.color}`} />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
