import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera,
  Video,
  Play,
  Square,
  Cpu,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Upload,
  Crosshair,
  PlusCircle,
  XCircle,
  Eye,
  ShieldCheck,
} from 'lucide-react'
import DashboardLayout from '../components/Layout/DashboardLayout'
import LoadingSpinner from '../components/UI/LoadingSpinner'
import {
  getBuses,
  getBusRoute,
  updateBusGps,
  analyzeFrame,
  getRecentDetections,
  type BusRoute,
} from '../api/buses'
import { createComplaint } from '../api/complaints'
import type { Bus, DetectionResult } from '../types'
import { categoryEmoji, categoryLabel } from '../utils/categoryHelpers'
import { safeFormatDistanceToNow } from '../utils/dateHelpers'

type CameraMode = 'live' | 'upload' | 'simulation'

export default function BusCamera() {
  const [mode, setMode] = useState<CameraMode>('live')
  const [buses, setBuses] = useState<Bus[]>([])
  const [selectedBusId, setSelectedBusId] = useState<number>(1)
  const [route, setRoute] = useState<BusRoute | null>(null)
  const [waypointIdx, setWaypointIdx] = useState(0)

  // Live Camera state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Upload Video state
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [uploadedVideoName, setUploadedVideoName] = useState<string>('')
  const uploadVideoRef = useRef<HTMLVideoElement | null>(null)
  const videoFileInputRef = useRef<HTMLInputElement | null>(null)

  // Offscreen canvas for frame capture
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Real GPS state (for Live & Upload modes)
  const [realGps, setRealGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatusText, setGpsStatusText] = useState<string>('GPS not requested yet')
  const [isLocatingGps, setIsLocatingGps] = useState(false)

  // Analysis & Deduplication state
  const [autoCreateReports, setAutoCreateReports] = useState<boolean>(false)
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentFrameDetections, setCurrentFrameDetections] = useState<DetectionResult[]>([])
  const [suggestedDetections, setSuggestedDetections] = useState<DetectionResult[]>([])
  const [detectionsHistory, setDetectionsHistory] = useState<DetectionResult[]>([])
  const [latestCreated, setLatestCreated] = useState<string[]>([])
  const [latestUpdated, setLatestUpdated] = useState<string[]>([])
  const [aiStatusBanner, setAiStatusBanner] = useState<{
    source: string
    error?: string | null
    message?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const autoScanTimerRef = useRef<number | null>(null)

  // Load fleet buses and recent detections
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        const [busList, recentDets] = await Promise.all([
          getBuses(),
          getRecentDetections(15),
        ])
        setBuses(busList)
        setDetectionsHistory(recentDets)
        if (busList.length > 0) {
          setSelectedBusId(busList[0].id)
        }
      } catch (err) {
        console.error('Failed to load bus camera data', err)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [])

  // Load route waypoints for selected bus (used in Simulation mode)
  useEffect(() => {
    if (!selectedBusId) return
    getBusRoute(selectedBusId)
      .then((r) => {
        setRoute(r)
        setWaypointIdx(0)
      })
      .catch(() => setRoute(null))
  }, [selectedBusId])

  // Stop camera stream helper
  const stopLiveCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null
    }
    setCameraActive(false)
    setAutoScanEnabled(false)
  }, [])

  // Clean up camera and timers on unmount or mode switch
  useEffect(() => {
    setCurrentFrameDetections([])
    setAiStatusBanner(null)
    setAutoScanEnabled(false)
    if (mode !== 'live') {
      stopLiveCamera()
    }
  }, [mode, stopLiveCamera])

  useEffect(() => {
    return () => {
      stopLiveCamera()
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl)
      }
    }
  }, [stopLiveCamera, uploadedVideoUrl])

  // Start Live Browser Camera
  const startLiveCamera = async () => {
    setCameraError(null)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Browser camera API (getUserMedia) is not supported in this environment.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
        audio: false,
      })
      mediaStreamRef.current = stream
      setCameraActive(true)
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        await liveVideoRef.current.play().catch(() => {})
      }
    } catch (err: any) {
      setCameraActive(false)
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser address bar, or switch to Upload Video / Demo Simulation.'
          : `Unable to access camera (${err?.message || 'No camera found'}). You can upload a road video or use Demo Simulation mode.`
      )
    }
  }

  // Attach stream whenever liveVideoRef mounts while cameraActive is true
  useEffect(() => {
    if (cameraActive && liveVideoRef.current && mediaStreamRef.current) {
      liveVideoRef.current.srcObject = mediaStreamRef.current
      liveVideoRef.current.play().catch(() => {})
    }
  }, [cameraActive])

  // Request Real Browser GPS Permission
  const requestBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatusText('Geolocation API unavailable in this browser')
      return
    }
    setIsLocatingGps(true)
    setGpsStatusText('Acquiring live GPS fix…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
        }
        setRealGps(coords)
        setIsLocatingGps(false)
        setGpsStatusText(`Live GPS locked: ${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`)
        if (selectedBusId) {
          updateBusGps(selectedBusId, {
            latitude: coords.lat,
            longitude: coords.lng,
            speed: pos.coords.speed ? +(pos.coords.speed * 3.6).toFixed(1) : 22,
            source: 'live',
          }).catch(() => {})
        }
      },
      (err) => {
        setIsLocatingGps(false)
        setGpsStatusText(`GPS unavailable (${err.message || 'Permission declined'})`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Extract base64 JPEG from an active <video> element
  const captureVideoFrameBase64 = (videoEl: HTMLVideoElement | null): string | null => {
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return null
    }
    const canvas = captureCanvasRef.current
    if (!canvas) return null
    canvas.width = 640
    canvas.height = 360
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(videoEl, 0, 0, 640, 360)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  const selectedBus = buses.find((b) => b.id === selectedBusId)
  const simWaypoint = route?.waypoints?.[waypointIdx] || {
    lat: selectedBus?.current_latitude ?? 18.5204,
    lng: selectedBus?.current_longitude ?? 73.8567,
    name: selectedBus?.route_name ?? 'Pune Transit Corridor',
  }

  // Execute Frame Analysis across any of the 3 modes
  const runFrameAnalysis = useCallback(async () => {
    if (isAnalyzing) return
    setIsAnalyzing(true)
    setAiStatusBanner(null)

    try {
      if (mode === 'live') {
        const frameBase64 = captureVideoFrameBase64(liveVideoRef.current)
        if (!frameBase64) {
          setAiStatusBanner({
            source: 'unavailable',
            error: 'Live camera video stream is not ready yet. Start the camera first.',
          })
          setIsAnalyzing(false)
          return
        }

        const res = await analyzeFrame({
          mode: 'live',
          frame_base64: frameBase64,
          bus_id: selectedBusId,
          latitude: realGps?.lat ?? null,
          longitude: realGps?.lng ?? null,
          gps_source: realGps ? 'browser_gps' : 'unavailable',
          auto_create_complaints: autoCreateReports && Boolean(realGps),
        })

        const dets = res.detections || []
        setCurrentFrameDetections(dets)
        if (dets.length > 0) {
          setDetectionsHistory((prev) => [...dets, ...prev].slice(0, 25))
          if (!autoCreateReports || !realGps) {
            setSuggestedDetections((prev) => [...dets, ...prev].slice(0, 10))
          }
        }
        setLatestCreated(res.complaints_created || [])
        setLatestUpdated(res.complaints_updated || [])
        setAiStatusBanner({
          source: res.ai_source || 'gemini-3.8-flash',
          error: res.ai_error,
          message:
            dets.length > 0
              ? `Gemini Vision detected ${dets.length} civic issue(s) in live frame.`
              : 'Gemini Vision inspected frame: No civic defects detected.',
        })
      } else if (mode === 'upload') {
        const frameBase64 = captureVideoFrameBase64(uploadVideoRef.current)
        if (!frameBase64) {
          setAiStatusBanner({
            source: 'unavailable',
            error: 'Please upload a video and advance to a visible road frame before analyzing.',
          })
          setIsAnalyzing(false)
          return
        }

        const fallbackLat = realGps?.lat ?? selectedBus?.current_latitude ?? 18.5204
        const fallbackLng = realGps?.lng ?? selectedBus?.current_longitude ?? 73.8567

        const res = await analyzeFrame({
          mode: 'upload',
          frame_base64: frameBase64,
          bus_id: selectedBusId,
          latitude: fallbackLat,
          longitude: fallbackLng,
          gps_source: realGps ? 'browser_gps' : 'manual',
          auto_create_complaints: autoCreateReports,
        })

        const dets = res.detections || []
        setCurrentFrameDetections(dets)
        if (dets.length > 0) {
          setDetectionsHistory((prev) => [...dets, ...prev].slice(0, 25))
          if (!autoCreateReports) {
            setSuggestedDetections((prev) => [...dets, ...prev].slice(0, 10))
          }
        }
        setLatestCreated(res.complaints_created || [])
        setLatestUpdated(res.complaints_updated || [])
        setAiStatusBanner({
          source: res.ai_source || 'gemini-3.8-flash',
          error: res.ai_error,
          message:
            dets.length > 0
              ? `Gemini Vision detected ${dets.length} issue(s) in uploaded video frame.`
              : 'Gemini Vision inspected video frame: No road defects detected.',
        })
      } else {
        // Mode C: Demo Simulation
        const nextIdx = route?.waypoints?.length ? (waypointIdx + 1) % route.waypoints.length : 0
        const wp = route?.waypoints?.[nextIdx] || simWaypoint
        setWaypointIdx(nextIdx)

        await updateBusGps(selectedBusId, {
          latitude: wp.lat,
          longitude: wp.lng,
          speed: 25 + Math.round(Math.random() * 8),
          source: 'simulated',
        })

        const res = await analyzeFrame({
          mode: 'simulation',
          bus_id: selectedBusId,
          latitude: wp.lat,
          longitude: wp.lng,
          gps_source: 'simulated_route',
          auto_create_complaints: autoCreateReports,
        })

        const dets = res.detections || []
        setCurrentFrameDetections(dets)
        if (dets.length > 0) {
          setDetectionsHistory((prev) => [...dets, ...prev].slice(0, 25))
          if (!autoCreateReports) {
            setSuggestedDetections((prev) => [...dets, ...prev].slice(0, 10))
          }
        }
        setLatestCreated(res.complaints_created || [])
        setLatestUpdated(res.complaints_updated || [])
        setAiStatusBanner({
          source: 'simulation',
          message: `[DEMO SIMULATION] Generated synthetic detection along ${wp.name}.`,
        })
      }
    } catch (err: any) {
      setAiStatusBanner({
        source: 'error',
        error: err?.response?.data?.message || err?.message || 'Network error during frame analysis',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }, [
    isAnalyzing,
    mode,
    selectedBusId,
    realGps,
    autoCreateReports,
    selectedBus,
    route,
    waypointIdx,
    simWaypoint,
  ])

  // Throttled Auto-Scan interval (6 seconds)
  useEffect(() => {
    if (autoScanEnabled) {
      autoScanTimerRef.current = window.setInterval(() => {
        runFrameAnalysis()
      }, 6000)
    } else if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current)
      autoScanTimerRef.current = null
    }
    return () => {
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current)
    }
  }, [autoScanEnabled, runFrameAnalysis])

  // Handle video file upload for Mode B
  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl)
    }
    const url = URL.createObjectURL(file)
    setUploadedVideoUrl(url)
    setUploadedVideoName(file.name)
    setCurrentFrameDetections([])
    setAiStatusBanner(null)
  }

  // Confirm & Verify a Detection as an official Complaint
  const handleConfirmSuggestedReport = async (det: DetectionResult, index?: number) => {
    const lat = det.latitude ?? realGps?.lat ?? selectedBus?.current_latitude ?? 18.5204
    const lng = det.longitude ?? realGps?.lng ?? selectedBus?.current_longitude ?? 73.8567
    try {
      const created = await createComplaint({
        category: det.category,
        description:
          det.description ||
          `Verified ${det.category} detection (${Math.round(det.confidence * 100)}% confidence) from Bus #${selectedBusId}`,
        latitude: lat,
        longitude: lng,
        bus_id: selectedBusId,
        source: 'bus_camera',
        severity: det.severity || (det.confidence > 0.85 ? 'high' : 'medium'),
        evidence_image_path: det.image_path || null,
      })
      setLatestCreated([created.complaint_id])
      if (index !== undefined) {
        setSuggestedDetections((prev) => prev.filter((_, idx) => idx !== index))
      }
      setDetectionsHistory((prev) =>
        prev.map((item) =>
          item === det || (item.id && item.id === det.id)
            ? { ...item, complaint_id: created.complaint_id }
            : item
        )
      )
    } catch (err) {
      console.error('Failed to verify detection:', err)
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hidden offscreen canvas for capturing video frames */}
        <canvas ref={captureCanvasRef} width={640} height={360} className="hidden" />

        {/* Header & Bus Selector */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#F4F7F7] flex items-center gap-2">
              <Camera className="text-[#91C8BD]" size={22} />
              AI Camera Detection
            </h1>
            <p className="text-[#AABDC2] text-xs sm:text-sm mt-0.5">
              Detect road hazards from live feeds, uploaded videos, or demo simulation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedBusId}
              onChange={(e) => setSelectedBusId(Number(e.target.value))}
              className="bg-[#1C3038] border border-[#2A444E] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#F4F7F7] focus:border-[#91C8BD] outline-none"
            >
              {buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bus_number} — {b.route_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={requestBrowserGps}
              disabled={isLocatingGps}
              className="px-3.5 py-2 bg-[#1C3038] hover:bg-[#233B44] text-[#91C8BD] border border-[#2A444E] rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Crosshair size={14} className={isLocatingGps ? 'animate-spin' : ''} />
              {realGps ? `${realGps.lat.toFixed(4)}, ${realGps.lng.toFixed(4)}` : 'Use Live GPS'}
            </button>
          </div>
        </div>

        {/* 3 Clearly Separated Mode Tabs */}
        <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors ${
                mode === 'live'
                  ? 'bg-[#367F77] text-[#F4F7F7]'
                  : 'text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#233B44]'
              }`}
            >
              <Camera size={16} />
              Live Camera
            </button>

            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors ${
                mode === 'upload'
                  ? 'bg-[#367F77] text-[#F4F7F7]'
                  : 'text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#233B44]'
              }`}
            >
              <Video size={16} />
              Upload Video
            </button>

            <button
              type="button"
              onClick={() => setMode('simulation')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors ${
                mode === 'simulation'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-[#AABDC2] hover:text-[#F4F7F7] hover:bg-[#233B44]'
              }`}
            >
              <Cpu size={16} />
              Demo Simulation
            </button>
          </div>

          {/* Staff Verification Mode Toggle */}
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101C23] border border-[#2A444E] text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoCreateReports}
              onChange={(e) => setAutoCreateReports(e.target.checked)}
              className="accent-[#367F77] rounded"
            />
            <span className="text-[#AABDC2] font-medium">
              {autoCreateReports
                ? 'Auto-Route Verified Detections'
                : 'Require Staff Verification Before Routing'}
            </span>
          </label>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Video Viewport + Bounding Boxes */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl overflow-hidden shadow-lg">
              {/* Top Status Bar */}
              <div className="px-4 py-3 border-b border-[#2A444E] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      mode === 'simulation'
                        ? 'bg-amber-400'
                        : cameraActive || uploadedVideoUrl
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className="font-mono font-semibold text-[#F4F7F7]">
                    {selectedBus?.bus_number || 'PMC-11'} ·{' '}
                    {mode === 'live'
                      ? 'AUTHORIZED LIVE CAMERA FEED'
                      : mode === 'upload'
                      ? 'UPLOADED DEMONSTRATION VIDEO'
                      : 'DEMO SIMULATION MODE'}
                  </span>
                </div>

                <span className="font-mono tabular-nums text-[#AABDC2]">
                  {mode === 'simulation'
                    ? `Simulated GPS: ${simWaypoint.lat.toFixed(4)}°N, ${simWaypoint.lng.toFixed(4)}°E`
                    : realGps
                    ? `Live GPS: ${realGps.lat.toFixed(4)}°N, ${realGps.lng.toFixed(4)}°E`
                    : gpsStatusText}
                </span>
              </div>

              {/* Viewport Container */}
              <div className="relative h-80 sm:h-96 bg-[#101C23] flex items-center justify-center overflow-hidden">
                {/* MODE A: LIVE CAMERA */}
                {mode === 'live' && (
                  <>
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                    />
                    {!cameraActive && (
                      <div className="text-center p-6 max-w-md space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#367F77]/20 border border-[#367F77]/40 text-[#91C8BD] flex items-center justify-center mx-auto">
                          <Camera size={28} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-[#F4F7F7]">
                            Authorized Bus Camera Feed
                          </h3>
                          <p className="text-xs text-[#AABDC2] leading-relaxed">
                            Connect a live camera stream to inspect road conditions with Gemini
                            Vision. If no physical camera is attached, upload a demonstration video
                            or switch to Demo Simulation mode.
                          </p>
                        </div>
                        {cameraError && (
                          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs text-left space-y-2">
                            <div className="flex items-start gap-2">
                              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                              <span>{cameraError}</span>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setMode('upload')}
                                className="px-2.5 py-1 bg-[#233B44] hover:bg-[#367F77] text-[#F4F7F7] rounded text-[11px]"
                              >
                                Upload Video
                              </button>
                              <button
                                type="button"
                                onClick={() => setMode('simulation')}
                                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[11px]"
                              >
                                Demo Simulation Mode
                              </button>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={startLiveCamera}
                          className="px-5 py-2.5 bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] font-bold rounded-xl text-xs sm:text-sm transition-colors inline-flex items-center gap-2"
                        >
                          <Camera size={16} />
                          Connect Camera Feed
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* MODE B: UPLOAD VIDEO */}
                {mode === 'upload' && (
                  <>
                    {uploadedVideoUrl ? (
                      <video
                        ref={uploadVideoRef}
                        src={uploadedVideoUrl}
                        controls
                        playsInline
                        crossOrigin="anonymous"
                        className="w-full h-full object-contain bg-black"
                      />
                    ) : (
                      <div className="text-center p-6 max-w-md space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#367F77]/20 border border-[#367F77]/40 text-[#91C8BD] flex items-center justify-center mx-auto">
                          <Upload size={28} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-[#F4F7F7]">
                            Upload Demonstration Road Video
                          </h3>
                          <p className="text-xs text-[#AABDC2] leading-relaxed">
                            Select an MP4 or WEBM road corridor video, play or pause on any frame,
                            and click "Start Detection" or "Inspect Current Frame" to detect
                            potholes, garbage, waterlogging, or obstructions.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => videoFileInputRef.current?.click()}
                          className="px-5 py-2.5 bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] font-bold rounded-xl text-xs sm:text-sm transition-colors inline-flex items-center gap-2"
                        >
                          <Upload size={16} />
                          Select Demonstration Video (.MP4 / .WEBM)
                        </button>
                      </div>
                    )}
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      onChange={handleVideoFileUpload}
                    />
                  </>
                )}

                {/* MODE C: DEMO SIMULATION (Clearly Labelled Synthetic Viewport) */}
                {mode === 'simulation' && (
                  <div className="w-full h-full relative flex flex-col justify-between p-5 bg-[#101C23]">
                    <svg
                      viewBox="0 0 640 360"
                      className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none"
                    >
                      <rect width="640" height="180" fill="#101C23" />
                      <rect y="180" width="640" height="180" fill="#1C3038" />
                      <polygon points="240,180 400,180 600,360 40,360" fill="#233B44" />
                      <line
                        x1="320"
                        y1="185"
                        x2="320"
                        y2="360"
                        stroke="#91C8BD"
                        strokeWidth="4"
                        strokeDasharray="18 14"
                      />
                    </svg>

                    <div className="relative z-10 flex items-center justify-between">
                      <span className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs">
                        DEMO SIMULATION MODE — SYNTHETIC DATA
                      </span>
                      <span className="px-2.5 py-1 rounded bg-[#1C3038] border border-[#2A444E] text-xs text-[#F4F7F7] font-mono">
                        Waypoint: {simWaypoint.name}
                      </span>
                    </div>

                    <div className="relative z-10 text-xs text-[#AABDC2] bg-[#1C3038]/95 border border-[#2A444E] rounded-xl p-3">
                      Demonstration mode advances{' '}
                      <strong className="text-[#F4F7F7]">{selectedBus?.bus_number || 'PMC-11'}</strong>{' '}
                      along <strong className="text-[#91C8BD]">{route?.name || 'Pune Transit Route'}</strong>{' '}
                      and generates clearly labelled synthetic detections to demonstrate staff
                      verification, 50m geo-deduplication, and automated department routing.
                    </div>
                  </div>
                )}

                {/* Bounding Box Overlays (Rendered when returned by computer-vision model or demo simulation) */}
                {currentFrameDetections.map((det, idx) => {
                  if (!det.bbox) return null
                  const leftPct = Math.max(2, Math.min(85, (det.bbox.x1 / 640) * 100))
                  const topPct = Math.max(5, Math.min(80, (det.bbox.y1 / 360) * 100))
                  const widthPct = Math.max(
                    12,
                    Math.min(90 - leftPct, ((det.bbox.x2 - det.bbox.x1) / 640) * 100)
                  )
                  const heightPct = Math.max(
                    12,
                    Math.min(90 - topPct, ((det.bbox.y2 - det.bbox.y1) / 360) * 100)
                  )

                  return (
                    <div
                      key={det.id ?? idx}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                      className={`absolute border-2 rounded-lg pointer-events-none flex flex-col justify-between p-1.5 ${
                        det.is_simulated
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-[#91C8BD] bg-[#367F77]/20'
                      }`}
                    >
                      <div
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded w-fit ${
                          det.is_simulated
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-[#91C8BD] text-[#101C23]'
                        }`}
                      >
                        <span>{categoryLabel(det.category)}</span>
                        <span className="font-mono tabular-nums">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[#F4F7F7] bg-[#101C23]/90 px-1.5 py-0.5 rounded w-fit">
                        {det.is_simulated ? 'DEMO SYNTHETIC' : 'GEMINI VISION'}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Start Detection / Stop Detection & Single-Frame Controls Bar */}
              <div className="p-4 bg-[#1C3038] border-t border-[#2A444E] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!autoScanEnabled) {
                        setAutoScanEnabled(true)
                        runFrameAnalysis()
                      } else {
                        setAutoScanEnabled(false)
                      }
                    }}
                    disabled={
                      (mode === 'live' && !cameraActive) ||
                      (mode === 'upload' && !uploadedVideoUrl)
                    }
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-40 ${
                      autoScanEnabled
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7]'
                    }`}
                  >
                    {autoScanEnabled ? <Square size={14} /> : <Play size={14} />}
                    <span>{autoScanEnabled ? 'Stop Detection' : 'Start Detection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={runFrameAnalysis}
                    disabled={
                      isAnalyzing ||
                      (mode === 'live' && !cameraActive) ||
                      (mode === 'upload' && !uploadedVideoUrl)
                    }
                    className="px-3.5 py-2 bg-[#233B44] hover:bg-[#2A444E] text-[#F4F7F7] border border-[#2A444E] font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                    <span>
                      {isAnalyzing
                        ? 'Inspecting Frame…'
                        : mode === 'simulation'
                        ? 'Step Demo Frame'
                        : 'Inspect Current Frame'}
                    </span>
                  </button>

                  {mode === 'live' && cameraActive && (
                    <button
                      type="button"
                      onClick={stopLiveCamera}
                      className="px-3 py-2 bg-red-950/50 hover:bg-red-900/60 text-red-200 border border-red-800/60 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Square size={13} /> Disconnect Camera
                    </button>
                  )}

                  {mode === 'upload' && uploadedVideoUrl && (
                    <button
                      type="button"
                      onClick={() => videoFileInputRef.current?.click()}
                      className="px-3 py-2 bg-[#101C23] hover:bg-[#233B44] text-[#AABDC2] border border-[#2A444E] rounded-xl text-xs font-medium flex items-center gap-1.5"
                    >
                      <Upload size={13} /> Change Video ({uploadedVideoName.slice(0, 16)})
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-[#AABDC2] font-mono">
                  {mode === 'simulation' ? 'Mode: Demo Simulation' : 'Model: gemini-3.8-flash'}
                </span>
              </div>
            </div>

            {/* AI Status / Error Feedback */}
            {aiStatusBanner && (
              <div
                className={`rounded-xl p-4 border text-xs flex items-start justify-between gap-3 ${
                  aiStatusBanner.error
                    ? 'bg-red-950/50 border-red-800/60 text-red-200'
                    : aiStatusBanner.source === 'simulation'
                    ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                    : 'bg-[#1C3038] border-[#367F77] text-[#F4F7F7]'
                }`}
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    {aiStatusBanner.error ? 'Detection Notice' : aiStatusBanner.message}
                  </p>
                  {aiStatusBanner.error && <p>{aiStatusBanner.error}</p>}
                </div>
                <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-[#101C23] border border-[#2A444E] shrink-0">
                  {aiStatusBanner.source}
                </span>
              </div>
            )}

            {/* Auto-Created / Deduplicated Ticket Banner */}
            {(latestCreated.length > 0 || latestUpdated.length > 0) && (
              <div className="bg-[#1C3038] border border-[#367F77] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-[#91C8BD] shrink-0" />
                  <div className="space-y-0.5">
                    {latestCreated.length > 0 && (
                      <p className="text-[#F4F7F7] font-medium">
                        Verified & Routed Complaint:{' '}
                        <span className="font-mono text-[#91C8BD] font-bold">
                          {latestCreated.join(', ')}
                        </span>
                      </p>
                    )}
                    {latestUpdated.length > 0 && (
                      <p className="text-[#AABDC2]">
                        50m Geo-Deduplication — Merged with open complaint:{' '}
                        <span className="font-mono text-amber-300 font-bold">
                          {latestUpdated.join(', ')}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  to="/dashboard/complaints"
                  className="text-[#91C8BD] hover:text-[#F4F7F7] font-semibold"
                >
                  Open Complaints →
                </Link>
              </div>
            )}

            {/* Staff Verification Queue (Verify detections before initiating official action) */}
            {suggestedDetections.length > 0 && (
              <div className="bg-[#1C3038] border border-[#367F77] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#F4F7F7] flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[#91C8BD]" />
                    Staff Verification Queue (Verify Before Routing)
                  </h2>
                  <span className="text-xs text-[#91C8BD] font-mono">
                    {suggestedDetections.length} awaiting verification
                  </span>
                </div>
                <div className="space-y-2.5">
                  {suggestedDetections.map((det, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#101C23] border border-[#2A444E] flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#F4F7F7]">
                            {categoryEmoji(det.category)} {categoryLabel(det.category)}
                          </span>
                          <span className="font-mono text-[#91C8BD] font-bold">
                            {Math.round(det.confidence * 100)}% confidence
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                            Pending Verification
                          </span>
                        </div>
                        {det.description && (
                          <p className="text-[#AABDC2]">{det.description}</p>
                        )}
                        <p className="text-[11px] font-mono text-[#AABDC2]">
                          Bus: {selectedBus?.bus_number || `#${selectedBusId}`} · GPS:{' '}
                          {det.latitude && det.longitude
                            ? `${Number(det.latitude).toFixed(4)}°N, ${Number(det.longitude).toFixed(4)}°E`
                            : 'Corridor Default'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmSuggestedReport(det, idx)}
                          className="px-3 py-1.5 bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] font-semibold rounded-lg flex items-center gap-1"
                        >
                          <PlusCircle size={13} /> Verify & Route
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSuggestedDetections((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-[#AABDC2] hover:text-red-400"
                          title="Dismiss Detection"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Cols: Route Waypoints & Detailed Detection Log */}
          <div className="lg:col-span-5 space-y-5">
            {/* Bus & Route Status Card */}
            <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#F4F7F7]">
                  Assigned Bus: {selectedBus?.bus_number || 'PMC-11'}
                </h2>
                <Link
                  to={`/dashboard/buses/${selectedBusId}`}
                  className="text-xs text-[#91C8BD] hover:text-[#F4F7F7] flex items-center gap-1"
                >
                  <Eye size={13} /> Bus Details
                </Link>
              </div>
              <p className="text-xs text-[#AABDC2]">
                Route: <strong className="text-[#F4F7F7]">{selectedBus?.route_name}</strong> ·
                Driver: <strong className="text-[#F4F7F7]">{selectedBus?.driver_name || 'Assigned'}</strong>
              </p>

              {mode === 'simulation' && route && (
                <div className="space-y-1.5 pt-2 border-t border-[#2A444E]">
                  <p className="text-[11px] text-[#AABDC2] font-medium">
                    Demo Simulation Route Waypoints:
                  </p>
                  {route.waypoints.map((wp, idx) => (
                    <div
                      key={wp.name}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                        idx === waypointIdx
                          ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold'
                          : 'bg-[#101C23] text-[#AABDC2]'
                      }`}
                    >
                      <span>{wp.name}</span>
                      <span className="font-mono tabular-nums text-[11px]">
                        {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detection Feed (Category, Confidence, Bus ID, GPS, Timestamp, Evidence Frame, Verification Status) */}
            <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#F4F7F7]">
                  Detection Feed ({detectionsHistory.length})
                </h2>
                <span className="text-[11px] text-[#AABDC2]">Live AI & Demo Labelled</span>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {detectionsHistory.length === 0 ? (
                  <div className="text-center py-8 text-[#AABDC2] text-xs">
                    No detections recorded yet. Click "Start Detection" to inspect road conditions.
                  </div>
                ) : (
                  detectionsHistory.map((d, i) => {
                    const busLabel =
                      buses.find((b) => b.id === (d.bus_id ?? selectedBusId))?.bus_number ||
                      `Bus #${d.bus_id ?? selectedBusId}`
                    const isVerified = Boolean(d.complaint_id)
                    return (
                      <div
                        key={d.id ?? i}
                        className="p-3.5 rounded-xl bg-[#101C23] border border-[#2A444E] text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[#F4F7F7]">
                                {categoryEmoji(d.category)} {categoryLabel(d.category)}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  d.is_simulated
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-[#367F77]/25 text-[#91C8BD] border border-[#367F77]/50'
                                }`}
                              >
                                {d.is_simulated ? 'DEMO SIMULATION' : 'GEMINI VISION'}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  isVerified
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                }`}
                              >
                                {isVerified ? 'Verified' : 'Unverified'}
                              </span>
                            </div>
                            <p className="text-[#AABDC2] text-[11px] mt-1 font-mono">
                              {busLabel} · {safeFormatDistanceToNow(d.timestamp)}
                              {d.latitude && d.longitude
                                ? ` · ${Number(d.latitude).toFixed(4)}°N, ${Number(d.longitude).toFixed(4)}°E`
                                : ' · No GPS'}
                            </p>
                          </div>

                          <div className="text-right font-mono tabular-nums shrink-0">
                            <span className="text-[#91C8BD] font-bold block">
                              {Math.round(d.confidence * 100)}%
                            </span>
                            {d.complaint_id ? (
                              <Link
                                to={`/dashboard/complaints/${d.complaint_id}`}
                                className="text-[11px] text-[#91C8BD] hover:text-[#F4F7F7] underline"
                              >
                                Ticket #{d.complaint_id} →
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConfirmSuggestedReport(d)}
                                className="text-[11px] text-[#91C8BD] hover:text-[#F4F7F7] underline mt-0.5"
                              >
                                Verify & Route
                              </button>
                            )}
                          </div>
                        </div>

                        {d.image_path && (
                          <div className="pt-1">
                            <img
                              src={d.image_path}
                              alt={String(d.category)}
                              referrerPolicy="no-referrer"
                              className="w-full h-24 object-cover rounded-lg border border-[#2A444E]"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
