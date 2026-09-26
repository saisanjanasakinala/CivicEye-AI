import { useState, useRef, useEffect } from 'react'
import { Play, Square, AlertTriangle, Bus as BusIcon, Microscope } from 'lucide-react'
import type { Bus, DetectionResult } from '../../types'
import { analyzeFrame } from '../../api/detections'
import DetectionOverlay from './DetectionOverlay'
import { categoryLabel, categoryEmoji, severityVariant } from '../../utils/categoryHelpers'
import Badge from '../UI/Badge'
import { formatDistanceToNow } from 'date-fns'

// Pune bus route waypoints (simulated GPS path)
const ROUTE_WAYPOINTS = [
  { lat: 18.5204, lng: 73.8567 },
  { lat: 18.5220, lng: 73.8590 },
  { lat: 18.5240, lng: 73.8612 },
  { lat: 18.5260, lng: 73.8580 },
  { lat: 18.5280, lng: 73.8550 },
  { lat: 18.5250, lng: 73.8530 },
  { lat: 18.5220, lng: 73.8540 },
]

interface BusCameraFeedProps {
  bus: Bus | null
}

export default function BusCameraFeed({ bus }: BusCameraFeedProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [detections, setDetections] = useState<DetectionResult[]>([])
  const [currentDetections, setCurrentDetections] = useState<DetectionResult[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 360 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Use a ref to track waypoint index to avoid stale closure in setInterval
  const waypointIdxRef = useRef(0)
  const [displayWpIdx, setDisplayWpIdx] = useState(0)
  const busRef = useRef(bus)

  useEffect(() => { busRef.current = bus }, [bus])

  // Update canvas size on resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        setCanvasSize({ width: w, height: Math.round(w * 0.5625) }) // 16:9
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const runDetection = async () => {
    const currentBus = busRef.current
    if (!currentBus) return
    setIsAnalyzing(true)
    const idx = waypointIdxRef.current
    const wp = ROUTE_WAYPOINTS[idx % ROUTE_WAYPOINTS.length]
    waypointIdxRef.current = idx + 1
    setDisplayWpIdx(waypointIdxRef.current)
    try {
      const results = await analyzeFrame({
        bus_id: currentBus.id,
        bus_number: currentBus.bus_number,
        latitude: wp.lat,
        longitude: wp.lng,
      })
      if (results.length > 0) {
        setCurrentDetections(results)
        setDetections((prev) => [...results, ...prev].slice(0, 20))
      }
    } catch (err) {
      console.error('Detection error:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const startDetection = () => {
    setIsRunning(true)
    intervalRef.current = setInterval(runDetection, 3000)
  }

  const stopDetection = () => {
    setIsRunning(false)
    setCurrentDetections([])
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const currentWp = ROUTE_WAYPOINTS[displayWpIdx % ROUTE_WAYPOINTS.length]

  return (
    <div className="space-y-4">
      {/* Camera feed */}
      <div
        ref={containerRef}
        className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-700/50"
        style={{ height: canvasSize.height }}
      >
        <DetectionOverlay
          detections={currentDetections}
          width={canvasSize.width}
          height={canvasSize.height}
          isRunning={isRunning}
        />
        {/* Status overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {isRunning ? (
            <span className="flex items-center gap-1.5 bg-red-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" />
              LIVE DETECTION
            </span>
          ) : (
            <span className="bg-slate-800/90 text-slate-400 text-xs px-2 py-1 rounded-full">
              STANDBY
            </span>
          )}
          {isAnalyzing && (
            <span className="bg-teal-600/90 text-white text-xs px-2 py-1 rounded-full">
              Analyzing…
            </span>
          )}
        </div>

        {/* Bus info overlay */}
        {bus && (
          <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-teal-400 font-medium mb-1">
              <BusIcon size={12} />
              {bus.bus_number} — {bus.route_name}
            </div>
            <div className="text-slate-400">
              GPS: {currentWp.lat.toFixed(4)}°N, {currentWp.lng.toFixed(4)}°E
            </div>
          </div>
        )}

        {!bus && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <BusIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a bus to begin</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!isRunning ? (
          <button
            onClick={startDetection}
            disabled={!bus}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            Start Detection
          </button>
        ) : (
          <button
            onClick={stopDetection}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Square size={16} />
            Stop Detection
          </button>
        )}
        <span className="text-slate-500 text-xs">
          {isRunning ? 'Analyzing every 3 seconds…' : 'Press Start to begin AI detection'}
        </span>
      </div>

      {/* Detection log */}
      {detections.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
            <Microscope size={16} className="text-teal-400" />
            <h3 className="text-sm font-semibold text-white">Detection Log</h3>
            <span className="ml-auto text-slate-500 text-xs">{detections.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-left">Confidence</th>
                  <th className="px-4 py-2 text-left">Severity</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {detections.map((det, idx) => (
                  <tr key={idx} className="border-b border-slate-700/30 table-row-hover">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span>{categoryEmoji(det.category as import('../../types').ComplaintCategory)}</span>
                        <span className="text-slate-300">{categoryLabel(det.category as import('../../types').ComplaintCategory)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full w-16">
                          <div
                            className="h-full bg-teal-400 rounded-full"
                            style={{ width: `${det.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-slate-300 text-xs">{(det.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {(() => {
                        const sev = det.severity ?? (det.confidence >= 0.85 ? 'high' : det.confidence >= 0.70 ? 'medium' : 'low')
                        return <Badge variant={severityVariant(sev)}>{sev}</Badge>
                      })()}
                    </td>
                    <td className="px-4 py-2">
                      {det.is_simulated ? (
                        <span className="flex items-center gap-1 text-amber-400 text-xs">
                          <AlertTriangle size={12} />
                          SIMULATED
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs">AI</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs">
                      {formatDistanceToNow(new Date(det.timestamp), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
