import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Upload,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Search,
  Shield,
  Eye,
  Sparkles,
  ArrowRight,
  Clock,
  Building2,
  Copy,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  Phone,
  Crosshair,
  FileText,
  Video,
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { classifyCivicIssue, uploadCitizenMedia, submitCitizenComplaint, trackComplaintPublic, type AIClassificationResult } from '../api/citizen'
import { getComplaints } from '../api/complaints'
import type { Complaint } from '../types'
import { categoryLabel, categoryEmoji } from '../utils/categoryHelpers'
import { safeFormat, safeFormatDistanceToNow } from '../utils/dateHelpers'
import LoadingSpinner from '../components/UI/LoadingSpinner'

const PUNE_CENTER: [number, number] = [18.5204, 73.8567]

const SAMPLE_ISSUES = [
  {
    title: 'Swargate Deep Pothole',
    category: 'Pothole',
    description: 'Deep road surface crater approx 2ft wide on Swargate-Bibwewadi main road near petrol pump. High collision risk for two-wheelers.',
    lat: 18.4985,
    lng: 73.8542,
    address: 'Swargate-Bibwewadi Road, near Bharat Petroleum, Pune',
    image: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80',
    mediaType: 'image' as const,
  },
  {
    title: 'Hadapsar Garbage Mound',
    category: 'Garbage',
    description: 'Overflowing municipal garbage dumpster and open waste spill on footpath near Hadapsar vegetable market. Strong odor and sanitation hazard.',
    lat: 18.5089,
    lng: 73.9259,
    address: 'Hadapsar Gadital Market Road, Hadapsar, Pune',
    image: 'https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?w=800&auto=format&fit=crop&q=80',
    mediaType: 'image' as const,
  },
  {
    title: 'Shivajinagar Stormwater Drain Blockage',
    category: 'Waterlogging',
    description: 'Stormwater drain overflowing with standing stagnant water 1.5 ft deep after rain, completely blocking carriage way near bus station.',
    lat: 18.5314,
    lng: 73.8446,
    address: 'Near Shivajinagar ST Stand, Pune',
    image: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&auto=format&fit=crop&q=80',
    mediaType: 'image' as const,
  },
  {
    title: 'Viman Nagar Fallen Bough',
    category: 'Fallen Tree',
    description: 'Large gulmohar tree branch snapped and resting across lane 2, blocking vehicles and touching overhead electric cabling.',
    lat: 18.5679,
    lng: 73.9143,
    address: 'Lane 2, Viman Nagar, near Symbiosis Road, Pune',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&auto=format&fit=crop&q=80',
    mediaType: 'image' as const,
  },
]

function MapDraggablePin({
  position,
  onPositionChange,
}: {
  position: [number, number]
  onPositionChange: (pos: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      onPositionChange([e.latlng.lat, e.latlng.lng])
    },
  })

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#0d9488;border:3px solid #ffffff;box-shadow:0 0 10px rgba(13,148,136,0.6);display:flex;align-items:center;justify-content:center"><div style="width:6px;height:6px;border-radius:50%;background:#ffffff"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

  return <Marker position={position} icon={icon} />
}

function FlyToPosition({ position }: { position: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(position, 15)
  }, [position, map])
  return null
}

export default function CitizenHome() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTabFromUrl = searchParams.get('tab') as 'report' | 'track' | 'feed' | null
  const [activeTab, setActiveTab] = useState<'report' | 'track' | 'feed'>(activeTabFromUrl || 'report')

  // Form states
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState<[number, number]>(PUNE_CENTER)
  const [address, setAddress] = useState('Pune Municipal Area, Maharashtra')
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)
  const [locationDetected, setLocationDetected] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  // AI Classification state
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<AIClassificationResult | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Pothole')
  const [selectedDeptId, setSelectedDeptId] = useState(1)
  const [selectedDeptName, setSelectedDeptName] = useState('Roads & Infrastructure')

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [generatedTrackingId, setGeneratedTrackingId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [copiedId, setCopiedId] = useState(false)

  // Tracking state
  const [trackSearchId, setTrackSearchId] = useState(searchParams.get('id') || '')
  const [trackedComplaint, setTrackedComplaint] = useState<Complaint | null>(null)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [trackError, setTrackError] = useState('')
  const [recentTrackingIds, setRecentTrackingIds] = useState<string[]>([])

  // Public Feed state
  const [feedComplaints, setFeedComplaints] = useState<Complaint[]>([])
  const [isFeedLoading, setIsFeedLoading] = useState(false)
  const [feedCategoryFilter, setFeedCategoryFilter] = useState('all')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Load recent tracking IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('civiceye_citizen_tracking_ids')
      if (stored) {
        setRecentTrackingIds(JSON.parse(stored))
      }
    } catch {
      // ignore
    }
  }, [])

  // Auto trigger tracking if ID is present in URL
  useEffect(() => {
    const urlId = searchParams.get('id')
    if (urlId) {
      setTrackSearchId(urlId)
      setActiveTab('track')
      handleTrackLookup(urlId)
    }
  }, [searchParams])

  // Sync tab with URL
  const switchTab = (tab: 'report' | 'track' | 'feed') => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  // Load public feed when active
  useEffect(() => {
    if (activeTab === 'feed') {
      setIsFeedLoading(true)
      getComplaints({ page_size: 20 })
        .then((res) => {
          setFeedComplaints(res.items || [])
        })
        .catch(() => setFeedComplaints([]))
        .finally(() => setIsFeedLoading(false))
    }
  }, [activeTab])

  // Automatic Location Detection with User Permission
  const detectUserLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    setIsDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setPosition([lat, lng])
        setLocationDetected(true)
        setIsDetectingLocation(false)
        setAddress(`GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)}) · Pune Region`)
      },
      (err) => {
        setIsDetectingLocation(false)
        console.warn('Geolocation permission denied or timed out:', err)
        // Keep default Pune position and notify quietly
        setAddress('Pune City Center (Tap on map to pin exact spot)')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Handle Image/Video file selection
  const handleFileSelected = async (file: File, type: 'image' | 'video') => {
    setMediaFile(file)
    setMediaType(type)
    setSubmitError('')

    const reader = new FileReader()
    reader.onload = (e) => {
      setMediaPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Trigger automatic location prompt if not yet detected
    if (!locationDetected) {
      detectUserLocation()
    }

    // Trigger AI classification automatically on the uploaded media & text
    runAiClassification(file.name, type, description)
  }

  // Pick sample issue
  const handleSelectSample = (sample: typeof SAMPLE_ISSUES[0]) => {
    setMediaFile(null)
    setMediaPreview(sample.image)
    setMediaType(sample.mediaType)
    setDescription(sample.description)
    setPosition([sample.lat, sample.lng])
    setAddress(sample.address)
    setLocationDetected(true)
    setSubmitError('')

    runAiClassification(sample.title, sample.mediaType, sample.description)
  }

  // AI Classification engine
  const runAiClassification = async (fileName: string, type: string, currentDesc: string) => {
    setIsAiAnalyzing(true)
    try {
      const res = await classifyCivicIssue({
        media_name: fileName,
        media_type: type,
        text: currentDesc,
      })
      setAiResult(res)
      setSelectedCategory(res.category)
      setSelectedDeptId(res.department_id)
      setSelectedDeptName(res.department_name)
      if (!description.trim()) {
        setDescription(res.suggested_description)
      }
    } catch (e) {
      console.error('AI classification failed', e)
    } finally {
      setIsAiAnalyzing(false)
    }
  }

  // Submit Complaint
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    if (!description.trim()) {
      setSubmitError('Please enter a brief description of the civic problem.')
      return
    }

    setIsSubmitting(true)
    try {
      let uploadedMediaUrl: string | undefined = mediaPreview?.startsWith('http') ? mediaPreview : undefined

      // If citizen selected a local file, upload it
      if (mediaFile) {
        try {
          const uploadRes = await uploadCitizenMedia(mediaFile)
          uploadedMediaUrl = uploadRes.url
        } catch {
          // If upload fails, use fallback preview or standard sample URL
          uploadedMediaUrl = mediaPreview?.startsWith('data:') ? undefined : mediaPreview || undefined
        }
      }

      const res = await submitCitizenComplaint({
        category: selectedCategory,
        description: description.trim(),
        latitude: position[0],
        longitude: position[1],
        address: address || `Pune, Maharashtra (${position[0].toFixed(4)}, ${position[1].toFixed(4)})`,
        severity: aiResult?.severity || 'medium',
        media_url: uploadedMediaUrl,
        media_type: mediaType,
        is_anonymous: isAnonymous,
        contact_name: isAnonymous ? undefined : contactName.trim() || undefined,
        contact_phone: isAnonymous ? undefined : contactPhone.trim() || undefined,
      })

      const newTrackingId = res.complaint_id
      setGeneratedTrackingId(newTrackingId)
      setSubmitSuccess(true)

      // Save to device localStorage
      try {
        const updated = [newTrackingId, ...recentTrackingIds.filter((id) => id !== newTrackingId)].slice(0, 10)
        setRecentTrackingIds(updated)
        localStorage.setItem('civiceye_citizen_tracking_ids', JSON.stringify(updated))
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setSubmitError(axiosErr?.response?.data?.message || 'Failed to submit complaint. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Tracking Lookup
  const handleTrackLookup = async (idToLookUp?: string) => {
    const target = (idToLookUp || trackSearchId).trim()
    if (!target) return

    setIsTrackingLoading(true)
    setTrackError('')
    setTrackedComplaint(null)

    try {
      const data = await trackComplaintPublic(target)
      setTrackedComplaint(data)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setTrackError(
        axiosErr?.response?.data?.message ||
          `No record found for tracking ID "${target}". Please verify the ID format (e.g. CE-202609-0001).`
      )
    } finally {
      setIsTrackingLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const resetForm = () => {
    setSubmitSuccess(false)
    setGeneratedTrackingId(null)
    setMediaFile(null)
    setMediaPreview(null)
    setDescription('')
    setAiResult(null)
    setSubmitError('')
  }

  const filteredFeed =
    feedCategoryFilter === 'all'
      ? feedComplaints
      : feedComplaints.filter((c) => c.category.toLowerCase() === feedCategoryFilter.toLowerCase())

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500/30 selection:text-teal-200">
      {/* ── Public Citizen Header ── */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-900/40">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">CivicEye AI</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-teal-400 bg-teal-950/80 border border-teal-800/60 px-2 py-0.5 rounded">
                  Citizen Portal
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Pune Municipal Corporation · Public Redressal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Quick Segmented Nav */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs">
              <button
                onClick={() => switchTab('report')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'report' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Report Issue
              </button>
              <button
                onClick={() => switchTab('track')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'track' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Track Status
              </button>
              <button
                onClick={() => switchTab('feed')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all hidden md:block ${
                  activeTab === 'feed' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                City Feed
              </button>
            </div>

            {/* Clear, distinct link to Government Login */}
            <Link
              to="/admin/login"
              className="text-xs text-slate-400 hover:text-teal-300 flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-colors"
              title="Restricted login for municipal staff"
            >
              <Shield size={13} className="text-teal-400" />
              <span className="hidden sm:inline">Municipal Admin</span>
              <ChevronRight size={12} className="text-slate-500" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Citizen Container ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8 space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/80 to-slate-950 border border-slate-800 p-6 md:p-10 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
          <div className="max-w-2xl relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-medium">
              <Sparkles size={13} className="text-teal-400" />
              Automated AI Routing to Pune Municipal Departments
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Report Civic Issues.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
                Fix Your City.
              </span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              No account or login needed. Upload a photo or video of a pothole, open garbage, broken streetlight, or drainage failure. Our AI auto-assigns the relevant municipal ward & department with real-time tracking.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => switchTab('report')}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
              >
                <Camera size={16} />
                Report Civic Problem
              </button>
              <button
                onClick={() => switchTab('track')}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all border border-slate-700 flex items-center gap-2"
              >
                <Search size={15} />
                Track by ID
              </button>
            </div>
          </div>
        </div>

        {/* ── TAB 1: REPORT CIVIC ISSUE ── */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {submitSuccess && generatedTrackingId ? (
              /* Success Confirmation Banner */
              <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
                    Report Successfully Filed
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-1">Your Complaint Has Been Dispatched</h2>
                  <p className="text-slate-400 text-sm max-w-md mx-auto mt-2">
                    Assigned to{' '}
                    <span className="text-teal-300 font-medium">{selectedDeptName}</span>. Save your unique tracking ID to monitor municipal crew progress.
                  </p>
                </div>

                {/* Tracking ID Box */}
                <div className="max-w-md mx-auto bg-slate-950 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Unique Tracking ID</span>
                    <span className="text-xl sm:text-2xl font-mono font-bold text-teal-400">
                      {generatedTrackingId}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(generatedTrackingId)}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 flex items-center gap-1.5 text-xs"
                  >
                    <Copy size={14} />
                    {copiedId ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setTrackSearchId(generatedTrackingId)
                      switchTab('track')
                      handleTrackLookup(generatedTrackingId)
                    }}
                    className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-xl text-sm transition-all flex items-center gap-2"
                  >
                    Track Progress Now <ArrowRight size={15} />
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all border border-slate-700"
                  >
                    Submit Another Issue
                  </button>
                </div>
              </div>
            ) : (
              /* Complaint Submission Form */
              <form onSubmit={handleSubmitReport} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Media & AI Analysis (7 cols) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Upload Box */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base flex items-center gap-2">
                          <Camera className="w-5 h-5 text-teal-400" />
                          1. Upload Photo or Video Evidence
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Clear visual evidence helps AI pinpoint the problem and department instantly.
                        </p>
                      </div>
                      <span className="text-[11px] text-teal-400/80 bg-teal-950/60 border border-teal-800/40 px-2 py-0.5 rounded">
                        Photo or Video
                      </span>
                    </div>

                    {/* Media Dropzone or Preview */}
                    {mediaPreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 group">
                        {mediaType === 'video' ? (
                          <video
                            src={mediaPreview}
                            controls
                            className="w-full h-64 sm:h-72 object-cover"
                          />
                        ) : (
                          <img
                            src={mediaPreview}
                            alt="Civic Issue Evidence"
                            className="w-full h-64 sm:h-72 object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMediaFile(null)
                            setMediaPreview(null)
                            setAiResult(null)
                          }}
                          className="absolute top-3 right-3 bg-slate-900/80 hover:bg-red-950/80 text-white hover:text-red-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur-md border border-slate-700 transition-colors"
                        >
                          Change Media
                        </button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 rounded-xl p-6 sm:p-8 text-center transition-all bg-slate-950/40">
                        <div className="flex justify-center gap-3 mb-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-teal-400">
                            <Upload size={22} />
                          </div>
                          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
                            <Video size={22} />
                          </div>
                        </div>
                        <p className="text-white font-medium text-sm">
                          Drag and drop or select evidence file
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          Supports JPG, PNG, WEBP, MP4, MOV up to 50MB
                        </p>
                        <div className="flex flex-wrap justify-center gap-3 mt-4">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                          >
                            <Camera size={14} /> Take / Select Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => videoInputRef.current?.click()}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                          >
                            <Video size={14} /> Upload Video
                          </button>
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileSelected(file, 'image')
                      }}
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileSelected(file, 'video')
                      }}
                    />

                    {/* Quick Demo Pre-fills for Testing */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-2">
                        Or select a sample Pune issue for quick testing:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SAMPLE_ISSUES.map((sample) => (
                          <button
                            key={sample.title}
                            type="button"
                            onClick={() => handleSelectSample(sample)}
                            className="text-left p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-teal-500/40 text-xs transition-all group"
                          >
                            <span className="text-teal-400 font-semibold block group-hover:text-teal-300 truncate">
                              {sample.category}
                            </span>
                            <span className="text-slate-500 text-[10px] truncate block">
                              {sample.address.split(',')[0]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AI Auto-Identification Card */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                          <Sparkles size={16} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">2. AI Problem & Department Routing</h3>
                          <p className="text-xs text-slate-400">Automated classification powered by CivicEye Vision</p>
                        </div>
                      </div>
                      {isAiAnalyzing && (
                        <div className="flex items-center gap-1.5 text-xs text-teal-400">
                          <LoadingSpinner size="sm" />
                          <span>Analyzing scene...</span>
                        </div>
                      )}
                    </div>

                    {aiResult ? (
                      <div className="bg-slate-950 border border-teal-500/30 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-500 block uppercase tracking-wider text-[10px]">
                              Identified Problem
                            </span>
                            <span className="text-white font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                              {categoryEmoji(aiResult.category)} {aiResult.category}
                            </span>
                            <span className="text-[11px] text-teal-400 font-mono mt-0.5 block">
                              Confidence: {Math.round(aiResult.confidence * 100)}%
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-500 block uppercase tracking-wider text-[10px]">
                              Assigned Department
                            </span>
                            <span className="text-white font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                              <Building2 size={13} className="text-teal-400" />
                              {aiResult.department_name}
                            </span>
                            <span className="text-[11px] text-amber-400/90 mt-0.5 block">
                              Severity: {aiResult.severity.toUpperCase()} Priority
                            </span>
                          </div>
                        </div>

                        {aiResult.detected_features && aiResult.detected_features.length > 0 && (
                          <div className="pt-2 border-t border-slate-800">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                              Key Visual Features Detected
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {aiResult.detected_features.map((feat) => (
                                <span
                                  key={feat}
                                  className="text-[11px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded"
                                >
                                  {feat}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-xs flex items-center gap-3">
                        <Info size={16} className="text-teal-400 flex-shrink-0" />
                        <span>
                          Upload a photo/video or select a sample above. CivicEye will automatically recognize whether it's a pothole, garbage, streetlight, or fallen branch, and dispatch it to the appropriate municipal body.
                        </span>
                      </div>
                    )}

                    {/* Manual Category Override if citizen wants to adjust */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                        Confirm or Adjust Category
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => {
                          const cat = e.target.value
                          setSelectedCategory(cat)
                          // update department recommendation
                          if (cat === 'Pothole') setSelectedDeptName('Roads & Infrastructure')
                          else if (cat === 'Garbage') setSelectedDeptName('Sanitation & Waste')
                          else if (cat === 'Waterlogging' || cat === 'Open Drain') setSelectedDeptName('Drainage & Waterways')
                          else if (cat === 'Fallen Tree') setSelectedDeptName('Parks & Horticulture')
                          else if (cat === 'Broken Streetlight') setSelectedDeptName('Electrical & Lighting')
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="Pothole">Pothole / Road Damage</option>
                        <option value="Garbage">Garbage / Waste Overflow</option>
                        <option value="Waterlogging">Waterlogging / Street Flooding</option>
                        <option value="Broken Streetlight">Broken Streetlight / Dark Spot</option>
                        <option value="Fallen Tree">Fallen Tree / Heavy Branches</option>
                        <option value="Open Drain">Open Drain / Manhole Hazard</option>
                        <option value="Stray Animals">Stray Animal Nuisance</option>
                        <option value="Other">Other Civic Grievance</option>
                      </select>
                    </div>

                    {/* Description field */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                        Problem Description
                      </label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Briefly describe what needs fixing..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Location & Anonymous Submission (5 cols) */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Location Picker */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-white text-base flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-teal-400" />
                        3. Issue Location
                      </h3>
                      <button
                        type="button"
                        onClick={detectUserLocation}
                        disabled={isDetectingLocation}
                        className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Crosshair size={12} className={isDetectingLocation ? 'animate-spin' : ''} />
                        {isDetectingLocation ? 'Detecting...' : 'Use My GPS'}
                      </button>
                    </div>

                    <div className="text-xs text-slate-400">
                      <span className="font-mono text-slate-300">
                        {position[0].toFixed(5)}, {position[1].toFixed(5)}
                      </span>
                      <p className="text-slate-500 text-[11px] mt-0.5 truncate">{address}</p>
                    </div>

                    {/* Interactive Leaflet Pin Selector */}
                    <div className="h-56 w-full rounded-xl overflow-hidden border border-slate-800 relative z-0">
                      <MapContainer
                        center={position}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        className="z-0"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <FlyToPosition position={position} />
                        <MapDraggablePin
                          position={position}
                          onPositionChange={(newPos) => {
                            setPosition(newPos)
                            setAddress(`Pinned Location (${newPos[0].toFixed(4)}, ${newPos[1].toFixed(4)}) · Pune`)
                          }}
                        />
                      </MapContainer>
                      <div className="absolute bottom-2 left-2 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded text-[10px] text-slate-400 border border-slate-800 pointer-events-none z-10">
                        Click on map to adjust exact pin
                      </div>
                    </div>
                  </div>

                  {/* Anonymous vs Contact Toggle */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Shield className="w-5 h-5 text-teal-400" />
                      4. Privacy & Submission
                    </h3>

                    {/* Anonymous toggle card */}
                    <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="mt-0.5 accent-teal-500 w-4 h-4 rounded"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-white block">Submit Anonymously</span>
                        <span className="text-slate-500 leading-relaxed block mt-0.5">
                          No identity, phone, or email recorded. You can still track progress using the generated unique ID.
                        </span>
                      </div>
                    </label>

                    {/* If not anonymous, optional contact details */}
                    {!isAnonymous && (
                      <div className="space-y-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs animate-in fade-in duration-200">
                        <div>
                          <label className="text-slate-400 block mb-1">Your Name (Optional)</label>
                          <input
                            type="text"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder="e.g. Rahul Deshmukh"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Phone / WhatsApp (For SMS updates)</label>
                          <input
                            type="tel"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>
                      </div>
                    )}

                    {submitError && (
                      <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle size={15} className="flex-shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-teal-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Routing to Department...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Submit Civic Grievance</span>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 text-center">
                      Official municipal record generated under Pune Smart City Redressal framework.
                    </p>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── TAB 2: TRACK YOUR COMPLAINT ── */}
        {activeTab === 'track' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Search Box */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-teal-400" />
                  Track Existing Civic Complaint
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your unique tracking ID (e.g., <span className="font-mono text-teal-300">CE-202609-0001</span>) to see current status, assigned crew, and photo verification.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={trackSearchId}
                  onChange={(e) => setTrackSearchId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTrackLookup()
                  }}
                  placeholder="Enter Tracking ID (e.g., CE-202609-0001)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:font-sans placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => handleTrackLookup()}
                  disabled={isTrackingLoading || !trackSearchId.trim()}
                  className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isTrackingLoading ? <LoadingSpinner size="sm" /> : <Search size={16} />}
                  <span>Search</span>
                </button>
              </div>

              {/* Quick chips of recent complaints on this device */}
              {recentTrackingIds.length > 0 && (
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <span className="text-[11px] text-slate-500">Recently filed from this device:</span>
                  {recentTrackingIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setTrackSearchId(id)
                        handleTrackLookup(id)
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              )}

              {trackError && (
                <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0" />
                  <span>{trackError}</span>
                </div>
              )}
            </div>

            {/* Complaint Detail Card */}
            {trackedComplaint && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 animate-in fade-in duration-300">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold font-mono text-teal-400">
                        {trackedComplaint.complaint_id}
                      </span>
                      <span
                        className={`text-xs uppercase font-bold px-2.5 py-0.5 rounded-full ${
                          trackedComplaint.status === 'resolved' || trackedComplaint.status === 'closed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : trackedComplaint.status === 'in_progress'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                        }`}
                      >
                        {trackedComplaint.status.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-white">
                      {categoryEmoji(trackedComplaint.category)} {categoryLabel(trackedComplaint.category)}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xl">{trackedComplaint.description}</p>
                  </div>

                  <div className="text-right text-xs">
                    <span className="text-slate-500 block">Reported At</span>
                    <span className="text-slate-300 font-medium">
                      {safeFormat(trackedComplaint.first_detected_at, 'dd MMM yyyy, HH:mm')}
                    </span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      ({safeFormatDistanceToNow(trackedComplaint.first_detected_at)})
                    </span>
                  </div>
                </div>

                {/* Status Stepper Progression */}
                <div>
                  <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3">
                    Progress Timeline
                  </h4>
                  {(() => {
                    const steps = [
                      { id: 'new', label: 'Report Registered' },
                      { id: 'assigned', label: 'Assigned to Ward' },
                      { id: 'in_progress', label: 'Repair In Progress' },
                      { id: 'awaiting_verification', label: 'Inspection' },
                      { id: 'resolved', label: 'Resolved & Closed' },
                    ]
                    const currentIdx = steps.findIndex((s) => s.id === trackedComplaint.status)
                    const effectiveIdx = currentIdx >= 0 ? currentIdx : trackedComplaint.status === 'closed' ? 4 : 0

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {steps.map((st, idx) => {
                          const isComplete = idx <= effectiveIdx
                          const isCurrent = idx === effectiveIdx
                          return (
                            <div
                              key={st.id}
                              className={`p-3 rounded-xl border text-xs text-center transition-all ${
                                isCurrent
                                  ? 'bg-teal-950/80 border-teal-500/60 text-teal-200'
                                  : isComplete
                                  ? 'bg-slate-950 border-emerald-900/60 text-emerald-400'
                                  : 'bg-slate-950/40 border-slate-800 text-slate-600'
                              }`}
                            >
                              <div className="flex justify-center mb-1">
                                {isComplete ? (
                                  <CheckCircle2 size={16} className={isCurrent ? 'text-teal-400' : 'text-emerald-400'} />
                                ) : (
                                  <Clock size={16} className="text-slate-600" />
                                )}
                              </div>
                              <span className="font-semibold block">{st.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* Metadata Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 block uppercase tracking-wider text-[10px]">
                      Responsible Department
                    </span>
                    <span className="text-white font-medium mt-0.5 block flex items-center gap-1">
                      <Building2 size={13} className="text-teal-400" />
                      {trackedComplaint.department || trackedComplaint.department_name || 'Municipal Roads'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block uppercase tracking-wider text-[10px]">Location</span>
                    <span className="text-white font-medium mt-0.5 block truncate flex items-center gap-1">
                      <MapPin size={13} className="text-teal-400 flex-shrink-0" />
                      {trackedComplaint.address || `${trackedComplaint.latitude.toFixed(4)}, ${trackedComplaint.longitude.toFixed(4)}`}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block uppercase tracking-wider text-[10px]">
                      Verification Photos
                    </span>
                    <span className="text-slate-300 font-medium mt-0.5 block">
                      {trackedComplaint.before_image_url || trackedComplaint.evidence_image_path
                        ? '1 Evidence on record'
                        : 'No media attached'}
                    </span>
                  </div>
                </div>

                {/* Status History Notes Log */}
                {trackedComplaint.status_history && trackedComplaint.status_history.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400">
                      Municipal Activity Log
                    </h4>
                    <div className="space-y-2">
                      {trackedComplaint.status_history.map((log, idx) => (
                        <div
                          key={log.id || idx}
                          className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
                        >
                          <div className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200 uppercase text-[11px]">
                                Status: {log.new_status.replace('_', ' ')}
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                {safeFormat(log.changed_at, 'dd MMM, HH:mm')}
                              </span>
                            </div>
                            {log.notes && <p className="text-slate-400 mt-1">{log.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: PUBLIC CIVIC FEED ── */}
        {activeTab === 'feed' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-400" />
                  Public Civic Activity Feed
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time issues reported across Pune municipal wards
                </p>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2 text-xs">
                {['all', 'pothole', 'garbage', 'waterlogging', 'streetlight'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFeedCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      feedCategoryFilter === cat
                        ? 'bg-teal-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat === 'all' ? 'All Issues' : categoryLabel(cat)}
                  </button>
                ))}
              </div>
            </div>

            {isFeedLoading ? (
              <div className="py-20 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
                No civic grievances found in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFeed.map((comp) => (
                  <div
                    key={comp.id}
                    onClick={() => {
                      setTrackSearchId(comp.complaint_id)
                      switchTab('track')
                      handleTrackLookup(comp.complaint_id)
                    }}
                    className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-teal-500/50 cursor-pointer transition-all hover:bg-slate-900/80 group space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-teal-400">
                        {comp.complaint_id}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          comp.status === 'resolved' || comp.status === 'closed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {comp.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors flex items-center gap-1.5">
                        {categoryEmoji(comp.category)} {categoryLabel(comp.category)}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">{comp.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                      <span className="truncate max-w-[160px] flex items-center gap-1">
                        <MapPin size={11} className="text-teal-400" />
                        {comp.address || 'Pune'}
                      </span>
                      <span>{safeFormatDistanceToNow(comp.first_detected_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── How It Works Section ── */}
        <div className="pt-8 border-t border-slate-800/80">
          <div className="text-center max-w-xl mx-auto mb-8 space-y-1">
            <h3 className="text-lg font-bold text-white">How CivicEye Works For Pune Citizens</h3>
            <p className="text-xs text-slate-400">A seamless, automated civic resolution loop</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                <Camera size={22} />
              </div>
              <h4 className="font-semibold text-white text-sm">1. Capture & Geo-locate</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Take a photo or upload video directly from your phone. GPS coordinates are automatically pinned with your consent.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                <Sparkles size={22} />
              </div>
              <h4 className="font-semibold text-white text-sm">2. AI Classification & Routing</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                CivicEye vision models identify severity, category, and dispatch work orders directly to Roads, Drainage, or Sanitation.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={22} />
              </div>
              <h4 className="font-semibold text-white text-sm">3. Transparent Resolution</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Track status in real-time with your ID. Field inspectors verify completion with before/after photos upon resolution.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Public Citizen Footer ── */}
      <footer className="border-t border-slate-800/80 bg-slate-900 py-8 text-xs text-slate-500 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
              <Eye size={14} className="text-teal-400" />
              CivicEye AI · Pune Municipal Corporation Initiative
            </div>
            <p className="text-slate-500">Citizen grievance portal for roads, sanitation, electricity & waterways.</p>
          </div>

          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Phone size={13} className="text-teal-400" />
              PMC Toll-Free Helpline: 1800 1030 222
            </span>
            <Link
              to="/admin/login"
              className="text-slate-400 hover:text-teal-300 font-medium border-l border-slate-800 pl-6 transition-colors"
            >
              Municipal Staff Login →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
