import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Send,
  Search,
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  Navigation,
  Upload,
  X,
  Sparkles,
  Building2,
  ArrowLeft,
  Eye,
  Loader2,
  RefreshCw,
  GitMerge,
  UserCheck,
  UserPlus,
  LogOut,
  History,
  FileCheck2,
} from 'lucide-react'
import { MapContainer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createPublicComplaint,
  trackPublicComplaint,
  classifyCitizenReport,
  uploadCitizenMedia,
  checkCitizenDuplicates,
  confirmCitizenDuplicate,
  registerCitizenAccount,
  loginCitizenAccount,
  getCitizenMyComplaints,
  type AIClassificationResponse,
  type PotentialDuplicateWarningItem,
  type CitizenUserSession,
} from '../api/citizen'
import {
  DEFAULT_CITY_CENTER,
  STREET_LEVEL_ZOOM,
  MapInvalidator,
  SafeTileLayer,
  MapInteractiveController,
  MapOverlayToolbar,
  SelectedLocationPin,
  MapSearchBox,
  type GeocodeResult,
} from '../components/Map/InteractiveMap'
import type { Complaint, ComplaintSeverity } from '../types'

const ISSUE_CATEGORIES = [
  { id: 'Pothole', label: 'Potholes', dept: 'Roads & Infrastructure' },
  { id: 'Garbage', label: 'Garbage', dept: 'Sanitation & Waste' },
  { id: 'Waterlogging', label: 'Waterlogging', dept: 'Drainage & Waterways' },
  { id: 'Broken Streetlight', label: 'Damaged Streetlight', dept: 'Electrical & Lighting' },
  { id: 'Fallen Tree', label: 'Fallen Tree', dept: 'Parks & Horticulture' },
  { id: 'Road Obstruction', label: 'Road Obstruction', dept: 'Roads & Infrastructure' },
  { id: 'Road Damage', label: 'Road Damage', dept: 'Roads & Infrastructure' },
  { id: 'Open Drain', label: 'Open Drain', dept: 'Drainage & Waterways' },
  { id: 'Other Civic Hazard', label: 'Other Hazard', dept: 'Roads & Infrastructure' },
]

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const ALLOWED_FILE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
])
const MAX_MEDIA_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to generate FileReader preview.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read selected file.'))
    reader.readAsDataURL(file)
  })
}

const STATUS_LABELS: Record<string, { label: string; step: number }> = {
  new: { label: 'Submitted', step: 1 },
  awaiting_verification: { label: 'Under Review', step: 2 },
  assigned: { label: 'Assigned', step: 3 },
  in_progress: { label: 'In Progress', step: 4 },
  resolved: { label: 'Resolved', step: 5 },
  closed: { label: 'Resolved', step: 5 },
}

const CITIZEN_SAVED_IDS_KEY = 'civiceye_citizen_complaint_ids'
const CITIZEN_SESSION_KEY = 'civiceye_citizen_session'

export default function CitizenHome() {
  const [activeTab, setActiveTab] = useState<'submit' | 'track'>('submit')

  // Optional Citizen Account State (Citizens can submit anonymously OR register/sign in to track history)
  const [citizenSession, setCitizenSession] = useState<CitizenUserSession | null>(() => {
    try {
      const raw = localStorage.getItem(CITIZEN_SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authFullName, setAuthFullName] = useState<string>('')
  const [authEmail, setAuthEmail] = useState<string>('')
  const [authPassword, setAuthPassword] = useState<string>('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState<boolean>(false)

  // Citizen Complaint History State
  const [savedComplaintIds, setSavedComplaintIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CITIZEN_SAVED_IDS_KEY)
      const parsed = raw ? JSON.parse(raw) : ['CE-202609-0001', 'CE-202609-0005']
      return Array.isArray(parsed) ? parsed : ['CE-202609-0001', 'CE-202609-0005']
    } catch {
      return ['CE-202609-0001', 'CE-202609-0005']
    }
  })
  const [myComplaintsHistory, setMyComplaintsHistory] = useState<Complaint[]>([])

  // Submit Complaint State
  const [category, setCategory] = useState<string>('Pothole')
  const [manualCategoryOverride, setManualCategoryOverride] = useState<boolean>(false)
  const [severity, setSeverity] = useState<ComplaintSeverity>('medium')
  const [description, setDescription] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [latitude, setLatitude] = useState<number>(DEFAULT_CITY_CENTER[0])
  const [longitude, setLongitude] = useState<number>(DEFAULT_CITY_CENTER[1])
  const [manualLatInput, setManualLatInput] = useState<string>(DEFAULT_CITY_CENTER[0].toFixed(5))
  const [manualLngInput, setManualLngInput] = useState<string>(DEFAULT_CITY_CENTER[1].toFixed(5))
  const [locationSource, setLocationSource] = useState<
    'default_map' | 'gps' | 'manual_pin' | 'search' | 'manual_coords'
  >('default_map')
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false)
  const [gpsNotice, setGpsNotice] = useState<{
    type: 'info' | 'success' | 'warning'
    text: string
  } | null>(null)
  const [flyTarget, setFlyTarget] = useState<{
    lat: number
    lng: number
    zoom?: number
    seq: number
  } | null>(null)
  const [honeypot, setHoneypot] = useState<string>('')

  // Optional Media & AI Classification State
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null)
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [aiResult, setAiResult] = useState<AIClassificationResponse | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  // Feature A: Duplicate Complaint Detection State
  const [duplicateWarnings, setDuplicateWarnings] = useState<PotentialDuplicateWarningItem[]>([])
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState<boolean>(false)
  const [isConfirmingDuplicateId, setIsConfirmingDuplicateId] = useState<string | null>(null)

  // Submission Result State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedComplaint, setSubmittedComplaint] = useState<Complaint | null>(null)
  const [copiedId, setCopiedId] = useState<boolean>(false)

  // Track Complaint State
  const [trackCode, setTrackCode] = useState<string>('')
  const [isTracking, setIsTracking] = useState<boolean>(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [trackedComplaint, setTrackedComplaint] = useState<Complaint | null>(null)

  const recordSavedComplaintId = useCallback((cid: string) => {
    setSavedComplaintIds((prev) => {
      const next = [cid, ...prev.filter((x) => x.toUpperCase() !== cid.toUpperCase())].slice(0, 15)
      try {
        localStorage.setItem(CITIZEN_SAVED_IDS_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const refreshCitizenHistory = useCallback(async () => {
    try {
      const list = await getCitizenMyComplaints(
        savedComplaintIds,
        citizenSession?.access_token || null
      )
      setMyComplaintsHistory(list)
    } catch {
      // ignore background history errors
    }
  }, [savedComplaintIds, citizenSession?.access_token])

  useEffect(() => {
    refreshCitizenHistory()
  }, [refreshCitizenHistory, activeTab])

  // Clean up any temporary object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  const revokeCurrentObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  // Citizen Auth Handlers
  const handleCitizenAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setIsAuthSubmitting(true)
    try {
      const session =
        authMode === 'register'
          ? await registerCitizenAccount({
              full_name: authFullName.trim(),
              email: authEmail.trim(),
              password: authPassword,
            })
          : await loginCitizenAccount({
              username: authEmail.trim(),
              password: authPassword,
            })
      setCitizenSession(session)
      try {
        localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify(session))
      } catch {
        // ignore
      }
      setShowAuthModal(false)
      setAuthPassword('')
    } catch (err: any) {
      setAuthError(
        err?.response?.data?.message || 'Citizen authentication failed. Please check your details.'
      )
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleCitizenLogout = () => {
    setCitizenSession(null)
    try {
      localStorage.removeItem(CITIZEN_SESSION_KEY)
    } catch {
      // ignore
    }
  }

  // PHASE 1 — #3 & #4: Browser Geolocation with permission handling, no fake coordinates, and street-level auto-zoom
  const handleUseCurrentLocation = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setGpsNotice({
        type: 'warning',
        text: 'Browser geolocation requires a secure HTTPS or localhost connection. Please click the map, search an address, or enter coordinates manually below.',
      })
      return
    }

    if (!navigator.geolocation) {
      setGpsNotice({
        type: 'warning',
        text: 'Geolocation API is not supported by your browser. Click anywhere on the map or search a landmark below.',
      })
      return
    }

    setIsLocatingGps(true)
    setGpsNotice({
      type: 'info',
      text: 'Requesting your current GPS location…',
    })

    const onGpsSuccess = (pos: GeolocationPosition) => {
      setIsLocatingGps(false)
      const lat = Number(pos.coords.latitude.toFixed(6))
      const lng = Number(pos.coords.longitude.toFixed(6))
      const accuracyMeters = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null
      setLatitude(lat)
      setLongitude(lng)
      setManualLatInput(lat.toFixed(5))
      setManualLngInput(lng.toFixed(5))
      setLocationSource('gps')
      setFlyTarget({ lat, lng, zoom: STREET_LEVEL_ZOOM, seq: Date.now() })
      setGpsNotice({
        type: 'success',
        text: `Current GPS location locked (${lat.toFixed(5)}, ${lng.toFixed(5)})${
          accuracyMeters ? ` · ±${accuracyMeters}m accuracy` : ''
        }. Map centered and zoomed to street level.`,
      })
    }

    const onGpsError = (err: GeolocationPositionError) => {
      setIsLocatingGps(false)
      // Never substitute fake coordinates on error
      let reason = 'Unable to retrieve your current GPS location.'
      if (err.code === 1) {
        const policyBlocked =
          err.message &&
          (err.message.toLowerCase().includes('permissions policy') ||
            err.message.toLowerCase().includes('feature policy'))
        reason = policyBlocked
          ? `Geolocation is blocked by the browser frame policy (${err.message}). Please use manual location selection: click/drag the map pin, search a landmark, or type coordinates below.`
          : `Location permission was denied (${err.message || 'user declined access'}). Please select the location manually by clicking the map, searching an address, or entering coordinates below.`
      } else if (err.code === 2) {
        reason = `Position unavailable: your device could not determine a GPS/network fix (${
          err.message || 'signal unavailable'
        }). Please click the map or search a landmark manually.`
      } else if (err.code === 3) {
        reason =
          'Location request timed out while waiting for a GPS fix. Please try again or select the location on the map manually.'
      } else if (err.message) {
        reason = `Location error: ${err.message}. Please select the location on the map manually.`
      }
      setGpsNotice({
        type: 'warning',
        text: reason,
      })
    }

    navigator.geolocation.getCurrentPosition(
      onGpsSuccess,
      (err) => {
        if (err.code === 2 || err.code === 3) {
          navigator.geolocation.getCurrentPosition(onGpsSuccess, onGpsError, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          })
          return
        }
        onGpsError(err)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Manual map click or pin drag updates coordinates & centers map cleanly
  const handleMapPinSelect = (lat: number, lng: number) => {
    setLatitude(lat)
    setLongitude(lng)
    setManualLatInput(lat.toFixed(5))
    setManualLngInput(lng.toFixed(5))
    setLocationSource('manual_pin')
    setDuplicateWarnings([])
    setGpsNotice({
      type: 'info',
      text: `Pin placed at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag the pin or click the map to adjust.`,
    })
  }

  // Address/landmark search centers and auto-zooms the map to street level
  const handleSearchSelect = (result: GeocodeResult) => {
    setLatitude(result.lat)
    setLongitude(result.lng)
    setManualLatInput(result.lat.toFixed(5))
    setManualLngInput(result.lng.toFixed(5))
    setAddress(result.name)
    setLocationSource('search')
    setDuplicateWarnings([])
    setFlyTarget({ lat: result.lat, lng: result.lng, zoom: STREET_LEVEL_ZOOM, seq: Date.now() })
    setGpsNotice({
      type: 'success',
      text: `Centered and zoomed to "${result.name}" (${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}).`,
    })
  }

  // Manual coordinate input handler (fallback when GPS permission is denied)
  const handleApplyManualCoords = () => {
    const parsedLat = Number(manualLatInput)
    const parsedLng = Number(manualLngInput)
    if (
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setGpsNotice({
        type: 'warning',
        text: 'Please enter valid latitude (-90 to 90) and longitude (-180 to 180) coordinates.',
      })
      return
    }
    const lat = Number(parsedLat.toFixed(6))
    const lng = Number(parsedLng.toFixed(6))
    setLatitude(lat)
    setLongitude(lng)
    setLocationSource('manual_coords')
    setDuplicateWarnings([])
    setFlyTarget({ lat, lng, zoom: STREET_LEVEL_ZOOM, seq: Date.now() })
    setGpsNotice({
      type: 'success',
      text: `Centered and zoomed to manual coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
    })
  }

  const applyAiClassification = (classification: AIClassificationResponse) => {
    setAiResult(classification)
    setAiError(null)
    const isLowConf =
      Boolean(classification.low_confidence) ||
      (typeof classification.confidence === 'number' && classification.confidence < 0.65)

    // Only auto-apply category if confidence is not low OR user hasn't manually overridden
    if (classification.category && (!manualCategoryOverride || !isLowConf)) {
      setCategory(classification.category)
      setManualCategoryOverride(false)
    }
    if (classification.severity) {
      setSeverity(classification.severity)
    }
    if (!description.trim() && classification.suggested_description) {
      setDescription(classification.suggested_description)
    }
  }

  // PHASE 1 — #1 & #2: Photo Preview validation + persistence + genuine AI classification
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSubmitError(null)
    setMediaError(null)
    setAiError(null)

    const lowerName = file.name.toLowerCase()
    const dotIdx = lowerName.lastIndexOf('.')
    const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : ''
    const mime = (file.type || '').toLowerCase()

    const isSupportedMime =
      ALLOWED_IMAGE_MIME_TYPES.has(mime) || ALLOWED_VIDEO_MIME_TYPES.has(mime)
    const isSupportedExt = ALLOWED_FILE_EXTENSIONS.has(ext)

    if (!isSupportedMime && !isSupportedExt) {
      setMediaError(
        `Unsupported file type "${file.name}". Please select a valid image (JPG, PNG, WEBP, GIF) or video (MP4, WEBM).`
      )
      e.target.value = ''
      return
    }

    if (file.size === 0) {
      setMediaError(`The selected file "${file.name}" is empty (0 bytes). Please choose a valid photo.`)
      e.target.value = ''
      return
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setMediaError(
        `File "${file.name}" (${formatFileSize(file.size)}) exceeds the maximum 20 MB limit. Please choose a smaller photo.`
      )
      e.target.value = ''
      return
    }

    revokeCurrentObjectUrl()
    setMediaFile(file)
    setUploadedMediaUrl(null)

    // 1. Immediate object URL preview
    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    setMediaPreview(objectUrl)

    // 2. Data URL via FileReader for resilient preview & persistence
    let localDataUrl: string | null = null
    if (!mime.startsWith('video/') && ext !== '.mp4' && ext !== '.webm' && ext !== '.mov') {
      try {
        localDataUrl = await readFileAsDataUrl(file)
        setMediaDataUrl(localDataUrl)
      } catch {
        setMediaDataUrl(null)
      }
    } else {
      setMediaDataUrl(null)
    }

    // 3. Upload original file to server
    setIsUploading(true)
    let serverMediaUrl = ''
    let serverMediaType: 'image' | 'video' = mime.startsWith('video/') ? 'video' : 'image'
    try {
      const uploaded = await uploadCitizenMedia(file)
      serverMediaUrl = uploaded.url
      serverMediaType = uploaded.media_type
      setUploadedMediaUrl(uploaded.url)
    } catch (uploadErr: any) {
      const msg = uploadErr?.response?.data?.message
      if (msg) {
        setMediaError(msg)
      }
    } finally {
      setIsUploading(false)
    }

    // 4. Classify with real Gemini AI model
    setIsAnalyzing(true)
    try {
      const classification = await classifyCitizenReport({
        text: description,
        media_name: file.name,
        media_type: serverMediaType,
        media_url: serverMediaUrl,
        image_base64: localDataUrl || undefined,
      })
      applyAiClassification(classification)
    } catch (aiErr: any) {
      setAiError(
        aiErr?.response?.data?.message ||
          'AI classification service is currently unavailable. Please verify or select the issue category manually.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleRunAiOnDescription = async () => {
    if (!description.trim() && !uploadedMediaUrl && !mediaDataUrl) {
      setAiError('Please enter a description or upload a photo first to run AI classification.')
      return
    }
    setIsAnalyzing(true)
    setAiError(null)
    setSubmitError(null)
    try {
      const classification = await classifyCitizenReport({
        text: description,
        media_name: mediaFile?.name || '',
        media_type: mediaFile?.type.startsWith('video/') ? 'video' : 'image',
        media_url: uploadedMediaUrl || '',
        image_base64: mediaDataUrl || undefined,
      })
      applyAiClassification(classification)
    } catch (err: any) {
      setAiError(
        err?.response?.data?.message ||
          'AI classification service is currently unavailable. Please select the issue category manually.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleClearMedia = () => {
    revokeCurrentObjectUrl()
    setMediaFile(null)
    setMediaPreview(null)
    setMediaDataUrl(null)
    setUploadedMediaUrl(null)
    setMediaError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Finalize creating a separate complaint record
  const executeCreateSeparateComplaint = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      let finalMediaUrl = uploadedMediaUrl
      if (mediaFile && !finalMediaUrl) {
        try {
          const uploaded = await uploadCitizenMedia(mediaFile)
          finalMediaUrl = uploaded.url
          setUploadedMediaUrl(uploaded.url)
        } catch {
          // Will fall back to image_base64 in createPublicComplaint payload
        }
      }

      const created = await createPublicComplaint({
        category,
        description: description.trim(),
        severity,
        latitude,
        longitude,
        address:
          address.trim() ||
          `Pune (${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E)`,
        media_url: finalMediaUrl,
        media_type: mediaFile?.type.startsWith('video/') ? 'video' : mediaFile ? 'image' : null,
        image_base64: !finalMediaUrl && mediaDataUrl ? mediaDataUrl : undefined,
        is_anonymous: !citizenSession,
        contact_name: citizenSession?.user.full_name || undefined,
        honeypot,
        force_new: true,
      })
      setDuplicateWarnings([])
      setSubmittedComplaint(created)
      setTrackCode(created.complaint_id)
      recordSavedComplaintId(created.complaint_id)
      refreshCitizenHistory()
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.message || 'Failed to submit complaint. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // PHASE 2 — FEATURE A: Check for duplicate complaints before submitting
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!description.trim()) {
      setSubmitError('Please enter a brief description of the issue.')
      return
    }

    // Step 1: Check for potential unresolved duplicates (proximity + category + description similarity)
    setIsCheckingDuplicates(true)
    try {
      const dupCheck = await checkCitizenDuplicates({
        category,
        description: description.trim(),
        latitude,
        longitude,
      })
      if (dupCheck.has_duplicates && dupCheck.duplicates.length > 0) {
        setDuplicateWarnings(dupCheck.duplicates)
        setIsCheckingDuplicates(false)
        return
      }
    } catch {
      // If duplicate check fails, proceed gracefully to submission
    } finally {
      setIsCheckingDuplicates(false)
    }

    // Step 2: No duplicates found — submit separate report immediately
    await executeCreateSeparateComplaint()
  }

  // Citizen confirms a duplicate warning is the same issue
  const handleConfirmSameIssue = async (dup: PotentialDuplicateWarningItem) => {
    setIsConfirmingDuplicateId(dup.complaint_id)
    setSubmitError(null)
    try {
      const confirmed = await confirmCitizenDuplicate(dup.complaint_id, {
        notes: description.trim(),
        media_url: uploadedMediaUrl || null,
      })
      setDuplicateWarnings([])
      setSubmittedComplaint(confirmed)
      setTrackCode(confirmed.complaint_id)
      recordSavedComplaintId(confirmed.complaint_id)
      refreshCitizenHistory()
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.message || 'Could not confirm duplicate complaint. Please try again.'
      )
    } finally {
      setIsConfirmingDuplicateId(null)
    }
  }

  const handleResetForm = () => {
    setSubmittedComplaint(null)
    setDescription('')
    setAddress('')
    setAiResult(null)
    setAiError(null)
    setDuplicateWarnings([])
    setManualCategoryOverride(false)
    handleClearMedia()
    setSubmitError(null)
  }

  const handleCopyTrackingId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2500)
  }

  const handleTrackLookup = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault()
    const codeToSearch = (overrideCode ?? trackCode).trim()
    if (!codeToSearch) {
      setTrackError('Enter your complaint reference number (e.g., CE-202609-0001).')
      return
    }
    setIsTracking(true)
    setTrackError(null)
    setTrackedComplaint(null)
    try {
      const found = await trackPublicComplaint(codeToSearch)
      setTrackedComplaint(found)
      recordSavedComplaintId(found.complaint_id)
    } catch (err: any) {
      setTrackError(
        err?.response?.data?.message ||
          `No complaint found for "${codeToSearch}".`
      )
    } finally {
      setIsTracking(false)
    }
  }

  const selectedDept =
    ISSUE_CATEGORIES.find((c) => c.id === category)?.dept ||
    (aiResult?.category === category ? aiResult.department_name : null) ||
    'Roads & Infrastructure'

  const isLowConfidenceAi =
    Boolean(aiResult?.low_confidence) ||
    (typeof aiResult?.confidence === 'number' && aiResult.confidence < 0.65)

  return (
    <div className="min-h-screen bg-[#101C23] text-[#F4F7F7] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2A444E] bg-[#1C3038] sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-15 py-3 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-[#F4F7F7] whitespace-nowrap"
          >
            <div className="w-8 h-8 rounded-lg bg-[#367F77] flex items-center justify-center text-[#F4F7F7]">
              <Eye size={17} />
            </div>
            <span>CivicEye AI</span>
          </Link>

          <div className="flex items-center gap-1 p-1 bg-[#101C23] border border-[#2A444E] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'submit'
                  ? 'bg-[#367F77] text-[#F4F7F7]'
                  : 'text-[#AABDC2] hover:text-[#F4F7F7]'
              }`}
            >
              Report an Issue
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('track')}
              className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'track'
                  ? 'bg-[#367F77] text-[#F4F7F7]'
                  : 'text-[#AABDC2] hover:text-[#F4F7F7]'
              }`}
            >
              Track My Complaint
            </button>
          </div>

          <div className="flex items-center gap-2">
            {citizenSession ? (
              <div className="flex items-center gap-2 text-xs bg-[#101C23] border border-[#2A444E] rounded-lg px-2.5 py-1.5">
                <UserCheck size={13} className="text-[#91C8BD]" />
                <span className="font-semibold text-[#F4F7F7] hidden sm:inline">
                  {citizenSession.user.full_name}
                </span>
                <button
                  type="button"
                  onClick={handleCitizenLogout}
                  title="Sign Out"
                  className="text-[#AABDC2] hover:text-red-300 ml-1"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal((v) => !v)
                  setAuthError(null)
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#101C23] hover:bg-[#233B44] border border-[#2A444E] text-xs font-semibold text-[#91C8BD] transition-colors whitespace-nowrap"
              >
                <UserPlus size={13} />
                <span className="hidden sm:inline">Citizen Login / Register</span>
              </button>
            )}

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#AABDC2] hover:text-[#F4F7F7] whitespace-nowrap"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Optional Citizen Registration / Login Panel */}
        {showAuthModal && !citizenSession && (
          <div className="mb-6 bg-[#1C3038] border border-[#367F77] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#F4F7F7]">
                  {authMode === 'login' ? 'Citizen Account Sign In' : 'Create Citizen Account'}
                </h2>
                <p className="text-xs text-[#AABDC2]">
                  Optional — Sign in to link submitted reports to your citizen profile, or continue reporting anonymously below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-[#AABDC2] hover:text-[#F4F7F7]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setAuthError(null)
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold ${
                  authMode === 'login'
                    ? 'bg-[#367F77] text-[#F4F7F7]'
                    : 'bg-[#101C23] text-[#AABDC2]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setAuthError(null)
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold ${
                  authMode === 'register'
                    ? 'bg-[#367F77] text-[#F4F7F7]'
                    : 'bg-[#101C23] text-[#AABDC2]'
                }`}
              >
                Register New Citizen
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setAuthEmail('citizen1')
                  setAuthPassword('pass123')
                }}
                className="ml-auto text-[#91C8BD] hover:underline font-mono text-[11px]"
              >
                Fill Demo Citizen (citizen1)
              </button>
            </div>

            {authError && (
              <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-700/60 text-red-200 text-xs">
                {authError}
              </div>
            )}

            <form onSubmit={handleCitizenAuthSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {authMode === 'register' && (
                <input
                  type="text"
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  placeholder="Full Name (e.g. Rahul Deshmukh)"
                  required
                  className="bg-[#101C23] border border-[#2A444E] rounded-lg px-3 py-2 text-xs text-[#F4F7F7] outline-none focus:border-[#91C8BD]"
                />
              )}
              <input
                type="text"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder={authMode === 'register' ? 'Email or Username' : 'Username or Email (e.g. citizen1)'}
                required
                className="bg-[#101C23] border border-[#2A444E] rounded-lg px-3 py-2 text-xs text-[#F4F7F7] outline-none focus:border-[#91C8BD]"
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password (min 4 chars)"
                required
                className="bg-[#101C23] border border-[#2A444E] rounded-lg px-3 py-2 text-xs text-[#F4F7F7] outline-none focus:border-[#91C8BD]"
              />
              <button
                type="submit"
                disabled={isAuthSubmitting}
                className="px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isAuthSubmitting
                  ? 'Please wait…'
                  : authMode === 'register'
                  ? 'Register & Sign In'
                  : 'Sign In'}
              </button>
            </form>
          </div>
        )}

        {/* Compact Page Header */}
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-[#F4F7F7]">
            {activeTab === 'submit' ? 'Report an Issue' : 'Track My Complaint'}
          </h1>
          <p className="text-xs sm:text-sm text-[#AABDC2] mt-0.5">
            Report a civic issue or track your complaint status and before/after repair proof.
          </p>
        </div>

        {/* TAB 1: REPORT AN ISSUE */}
        {activeTab === 'submit' && (
          <div>
            {submittedComplaint ? (
              <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-[#91C8BD] flex-shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-lg font-bold text-[#F4F7F7]">
                      {submittedComplaint.deduplicated
                        ? 'Confirmed & Linked to Existing Report'
                        : 'Complaint Submitted'}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#AABDC2] mt-0.5">
                      {submittedComplaint.deduplicated
                        ? `Your report corroborated existing ${submittedComplaint.category} complaint ${submittedComplaint.complaint_id}. Total sightings: ${submittedComplaint.observation_count}.`
                        : 'Your report has been logged with a unique tracking ID and routed to the responsible department.'}
                    </p>
                  </div>
                </div>

                {/* Reference Number Box */}
                <div className="bg-[#101C23] border border-[#367F77] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#AABDC2]">
                      Tracking Reference Number
                    </div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#91C8BD] mt-0.5">
                      {submittedComplaint.complaint_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyTrackingId(submittedComplaint.complaint_id)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    {copiedId ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                  </button>
                </div>

                {/* Summary Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t border-b border-[#2A444E] py-3.5">
                  <div>
                    <span className="text-[#AABDC2] block">Category</span>
                    <span className="font-semibold text-[#F4F7F7]">
                      {submittedComplaint.category} ({submittedComplaint.severity.toUpperCase()})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#AABDC2] block">Routed Department</span>
                    <span className="font-semibold text-[#F4F7F7]">
                      {submittedComplaint.department_name ||
                        submittedComplaint.department ||
                        selectedDept}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#AABDC2] block">Status</span>
                    <span className="font-semibold text-[#91C8BD]">
                      {STATUS_LABELS[submittedComplaint.status]?.label || 'Submitted'}
                    </span>
                  </div>
                </div>

                {/* Retained Photo Evidence Confirmation */}
                {(submittedComplaint.media_url ||
                  submittedComplaint.evidence_image_path ||
                  mediaPreview) && (
                  <div className="bg-[#101C23] border border-[#2A444E] rounded-xl p-3 space-y-2">
                    <div className="text-xs font-semibold text-[#91C8BD] flex items-center gap-1.5">
                      <Camera size={14} />
                      <span>Attached Photo Evidence Retained</span>
                    </div>
                    <img
                      src={
                        submittedComplaint.media_url ||
                        submittedComplaint.evidence_image_path ||
                        mediaPreview ||
                        ''
                      }
                      alt="Submitted complaint evidence"
                      className="w-full max-h-48 object-contain rounded-lg border border-[#2A444E] bg-[#0B1419]"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('track')
                      handleTrackLookup(undefined, submittedComplaint.complaint_id)
                    }}
                    className="px-4 py-2 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Track Status
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="px-4 py-2 rounded-lg bg-[#233B44] hover:bg-[#2A444E] text-[#F4F7F7] text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Report Another Issue
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 sm:p-6 space-y-5"
              >
                {/* Honeypot */}
                <input
                  type="text"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                />

                {submitError && (
                  <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-red-200 text-xs flex items-center gap-2">
                    <AlertTriangle size={15} className="text-red-400 flex-shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* 1. Category */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="block text-xs sm:text-sm font-semibold text-[#F4F7F7]">
                      Issue Category <span className="text-red-400">*</span>
                    </label>
                    <span className="text-[11px] text-[#AABDC2]">
                      Select manually or use AI Suggest / Photo Upload
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ISSUE_CATEGORIES.map((cat) => {
                      const selected = category === cat.id
                      const isAiSuggested = aiResult?.category === cat.id
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setCategory(cat.id)
                            setDuplicateWarnings([])
                            if (aiResult && aiResult.category !== cat.id) {
                              setManualCategoryOverride(true)
                            } else {
                              setManualCategoryOverride(false)
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left transition-colors relative ${
                            selected
                              ? 'bg-[#367F77] text-[#F4F7F7] border-[#91C8BD]'
                              : 'bg-[#101C23] text-[#F4F7F7] border-[#2A444E] hover:bg-[#233B44]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold">{cat.label}</span>
                            {isAiSuggested && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#101C23]/80 text-[#91C8BD] font-semibold">
                                AI
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 truncate ${
                              selected ? 'text-[#F4F7F7]/90' : 'text-[#AABDC2]'
                            }`}
                          >
                            {cat.dept}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2. Description & Priority */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs sm:text-sm font-semibold text-[#F4F7F7]">
                        Description <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleRunAiOnDescription}
                        disabled={isAnalyzing || (!description.trim() && !mediaPreview)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#101C23] border border-[#367F77] text-xs font-semibold text-[#91C8BD] hover:bg-[#367F77] hover:text-[#F4F7F7] transition-colors disabled:opacity-40"
                      >
                        {isAnalyzing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} />
                        )}
                        <span>{isAnalyzing ? 'Analyzing with AI…' : 'AI Suggest Category'}</span>
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value)
                        if (duplicateWarnings.length > 0) setDuplicateWarnings([])
                      }}
                      placeholder="Describe the issue and nearby landmark (e.g. Deep pothole in the middle of FC Road damaging two-wheelers)…"
                      className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg p-3 text-sm text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none"
                      required
                    />
                  </div>

                  {/* AI Classification Error Banner */}
                  {aiError && (
                    <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold block">AI Classification Unavailable</span>
                        <span>{aiError}</span>
                      </div>
                    </div>
                  )}

                  {/* AI Classification Result & Low-Confidence Handling */}
                  {aiResult && (
                    <div
                      className={`bg-[#101C23] border rounded-lg p-3 text-xs space-y-1.5 ${
                        isLowConfidenceAi ? 'border-amber-500/60' : 'border-[#367F77]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#91C8BD] flex items-center gap-1.5">
                          <Sparkles size={13} />
                          <span>
                            AI Suggested Category:{' '}
                            <strong className="text-[#F4F7F7]">{aiResult.category}</strong>
                            {typeof aiResult.confidence === 'number'
                              ? ` (${Math.round(aiResult.confidence * 100)}% confidence)`
                              : ''}
                          </span>
                        </span>
                        <span className="text-[#AABDC2]">
                          Suggested Dept:{' '}
                          <strong className="text-[#F4F7F7]">{aiResult.department_name}</strong>
                        </span>
                      </div>

                      {isLowConfidenceAi && (
                        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                          <span>
                            {aiResult.confidence_warning ||
                              'Low AI confidence detected. Please verify and confirm the issue category manually above.'}
                          </span>
                        </div>
                      )}

                      {aiResult.suggested_description && (
                        <p className="text-[#AABDC2] text-[11px]">
                          {aiResult.suggested_description}
                        </p>
                      )}

                      {manualCategoryOverride && category !== aiResult.category && (
                        <div className="pt-1 flex items-center justify-between gap-2 border-t border-[#2A444E] text-[11px]">
                          <span className="text-amber-300">
                            Manual selection active: <strong>{category}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCategory(aiResult.category)
                              setManualCategoryOverride(false)
                            }}
                            className="text-[#91C8BD] hover:text-[#F4F7F7] underline font-semibold"
                          >
                            Use AI suggestion ({aiResult.category})
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#F4F7F7] mb-1">
                        Priority
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as ComplaintSeverity)}
                        className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg px-3 py-2 text-xs sm:text-sm text-[#F4F7F7] outline-none"
                      >
                        <option value="low">Low — Minor issue</option>
                        <option value="medium">Medium — Standard repair</option>
                        <option value="high">High — Safety hazard</option>
                        <option value="critical">Critical — Urgent obstruction</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#F4F7F7] mb-1">
                        Assigned Department
                      </label>
                      <div className="w-full bg-[#101C23] border border-[#2A444E] rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-[#91C8BD] flex items-center gap-2">
                        <Building2 size={14} className="text-[#91C8BD]" />
                        <span>{selectedDept}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Photo Evidence Upload & Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="citizen-media-upload"
                      className="block text-xs sm:text-sm font-semibold text-[#F4F7F7]"
                    >
                      Photo Evidence{' '}
                      <span className="text-xs font-normal text-[#AABDC2]">
                        (Optional · JPG, PNG, WEBP, GIF up to 20 MB)
                      </span>
                    </label>
                  </div>

                  <input
                    id="citizen-media-upload"
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {mediaError && (
                    <div
                      role="alert"
                      className="p-2.5 rounded-lg bg-red-950/60 border border-red-700/60 text-red-200 text-xs flex items-center gap-2"
                    >
                      <AlertTriangle size={14} className="text-red-400 shrink-0" />
                      <span>{mediaError}</span>
                    </div>
                  )}

                  {!mediaPreview ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                          fileInputRef.current.click()
                        }
                      }}
                      className="w-full border border-dashed border-[#367F77] bg-[#101C23] hover:bg-[#233B44] rounded-lg p-4 text-center transition-colors flex items-center justify-center gap-2"
                    >
                      <Upload size={16} className="text-[#91C8BD]" />
                      <span className="text-xs font-semibold text-[#F4F7F7]">
                        Select photo or video (Generates preview & auto-classifies issue)
                      </span>
                    </button>
                  ) : (
                    <div
                      data-testid="photo-preview-container"
                      className="bg-[#101C23] border border-[#367F77] rounded-lg p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-[#F4F7F7] flex items-center gap-1.5 min-w-0">
                          <Camera size={14} className="text-[#91C8BD] shrink-0" />
                          <span className="truncate">{mediaFile?.name || 'Selected Photo'}</span>
                          {mediaFile && (
                            <span className="text-[11px] font-normal text-[#AABDC2] shrink-0">
                              ({formatFileSize(mediaFile.size)})
                            </span>
                          )}
                          {isUploading && (
                            <span className="text-[11px] text-[#91C8BD] inline-flex items-center gap-1 shrink-0">
                              <Loader2 size={11} className="animate-spin" /> Uploading…
                            </span>
                          )}
                          {isAnalyzing && (
                            <span className="text-[11px] text-[#91C8BD] inline-flex items-center gap-1 shrink-0">
                              <Loader2 size={11} className="animate-spin" /> AI Analyzing…
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.value = ''
                                fileInputRef.current.click()
                              }
                            }}
                            className="text-xs font-semibold text-[#91C8BD] hover:text-[#F4F7F7] inline-flex items-center gap-1"
                          >
                            <RefreshCw size={12} />
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={handleClearMedia}
                            className="text-xs font-semibold text-red-400 hover:underline inline-flex items-center gap-1"
                          >
                            <X size={13} />
                            Remove
                          </button>
                        </div>
                      </div>

                      {mediaFile?.type.startsWith('video/') ? (
                        <video
                          data-testid="media-preview-video"
                          src={mediaPreview}
                          controls
                          className="w-full max-h-56 rounded-lg border border-[#2A444E] bg-black"
                        />
                      ) : (
                        <img
                          data-testid="media-preview-image"
                          src={mediaPreview}
                          alt="Selected civic issue preview"
                          onError={(e) => {
                            const imgEl = e.currentTarget
                            if (mediaDataUrl && imgEl.src !== mediaDataUrl) {
                              imgEl.src = mediaDataUrl
                            } else if (uploadedMediaUrl && imgEl.src !== uploadedMediaUrl) {
                              imgEl.src = uploadedMediaUrl
                            }
                          }}
                          className="w-full max-h-56 object-contain rounded-lg border border-[#2A444E] bg-[#0B1419]"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Interactive Location Picker */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs sm:text-sm font-semibold text-[#F4F7F7] flex items-center gap-1.5">
                      <MapPin size={15} className="text-[#91C8BD]" />
                      <span>Location (Click map, drag pin, search landmark, or use GPS)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isLocatingGps}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#233B44] hover:bg-[#367F77] border border-[#367F77] text-xs font-semibold text-[#F4F7F7] transition-colors disabled:opacity-60"
                    >
                      <Navigation
                        size={13}
                        className={`text-[#91C8BD] ${isLocatingGps ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isLocatingGps ? 'Locating GPS…' : 'Use My Current Location'}
                      </span>
                    </button>
                  </div>

                  {/* Landmark / Street Search Box */}
                  <MapSearchBox onSelectLocation={handleSearchSelect} />

                  {/* Optional street/landmark note input */}
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street or landmark details (optional)"
                    className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg px-3 py-2 text-xs sm:text-sm text-[#F4F7F7] placeholder-[#AABDC2]/60 outline-none"
                  />

                  {gpsNotice && (
                    <div
                      role="status"
                      className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                        gpsNotice.type === 'warning'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : gpsNotice.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : 'bg-[#101C23] border-[#2A444E] text-[#91C8BD]'
                      }`}
                    >
                      <MapPin size={14} className="shrink-0" />
                      <span>{gpsNotice.text}</span>
                    </div>
                  )}

                  {/* Interactive Leaflet Map */}
                  <div className="h-[300px] sm:h-[340px] w-full rounded-xl overflow-hidden border border-[#2A444E] relative">
                    <MapContainer
                      center={[latitude, longitude]}
                      zoom={13}
                      scrollWheelZoom={false}
                      touchZoom={true}
                      dragging={true}
                      zoomControl={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <SafeTileLayer />
                      <MapInvalidator trigger={activeTab} />
                      <MapInteractiveController
                        flyTarget={flyTarget}
                        onMapClick={handleMapPinSelect}
                      />
                      <MapOverlayToolbar
                        onMyLocation={handleUseCurrentLocation}
                        isLocatingExternal={isLocatingGps}
                        fallbackLat={latitude}
                        fallbackLng={longitude}
                      />
                      <SelectedLocationPin
                        latitude={latitude}
                        longitude={longitude}
                        onMove={handleMapPinSelect}
                      />
                    </MapContainer>
                  </div>

                  {/* Accurate Coordinate Readout & Manual Coordinate Entry Fallback */}
                  <div className="bg-[#101C23] border border-[#2A444E] rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[#F4F7F7]">
                        Lat: <strong>{latitude.toFixed(5)}</strong> · Lng:{' '}
                        <strong>{longitude.toFixed(5)}</strong>
                      </span>
                      <span className="text-[11px] text-[#91C8BD]">
                        {locationSource === 'gps'
                          ? 'Source: Current GPS Location'
                          : locationSource === 'search'
                          ? 'Source: Landmark Search'
                          : locationSource === 'manual_coords'
                          ? 'Source: Manual Coordinates'
                          : locationSource === 'manual_pin'
                          ? 'Source: Manual Map Pin'
                          : 'Click map, drag pin, or enter coordinates'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1.5 border-t border-[#2A444E]/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#AABDC2] whitespace-nowrap">Lat:</span>
                        <input
                          type="number"
                          step="any"
                          value={manualLatInput}
                          onChange={(e) => setManualLatInput(e.target.value)}
                          aria-label="Manual Latitude"
                          className="w-full bg-[#1C3038] border border-[#2A444E] rounded px-2 py-1 text-xs font-mono text-[#F4F7F7] outline-none focus:border-[#91C8BD]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#AABDC2] whitespace-nowrap">Lng:</span>
                        <input
                          type="number"
                          step="any"
                          value={manualLngInput}
                          onChange={(e) => setManualLngInput(e.target.value)}
                          aria-label="Manual Longitude"
                          className="w-full bg-[#1C3038] border border-[#2A444E] rounded px-2 py-1 text-xs font-mono text-[#F4F7F7] outline-none focus:border-[#91C8BD]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyManualCoords}
                        className="px-3 py-1 rounded bg-[#233B44] hover:bg-[#367F77] border border-[#367F77]/50 text-[#F4F7F7] text-xs font-semibold transition-colors"
                      >
                        Center Map on Coordinates
                      </button>
                    </div>
                  </div>
                </div>

                {/* PHASE 2 — FEATURE A: Duplicate Complaint Warning Panel */}
                {duplicateWarnings.length > 0 && (
                  <div
                    data-testid="duplicate-complaint-warning"
                    className="bg-amber-950/40 border-2 border-amber-500/70 rounded-xl p-4 space-y-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-amber-200">
                          Possible Duplicate Complaint Found ({duplicateWarnings.length})
                        </h3>
                        <p className="text-xs text-amber-100/90 leading-relaxed">
                          We found existing unresolved complaint(s) matching your location, category,
                          or description. You can view the existing complaint and confirm it is the
                          same issue, or continue to submit a separate report.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {duplicateWarnings.map((dup) => (
                        <div
                          key={dup.id}
                          className="bg-[#101C23] border border-amber-500/40 rounded-lg p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-[#91C8BD]">
                                {dup.complaint_id}
                              </span>
                              <span className="font-semibold text-[#F4F7F7]">{dup.category}</span>
                              {dup.distance_meters !== null && (
                                <span className="text-amber-300 font-mono">
                                  · {dup.distance_meters}m away
                                </span>
                              )}
                              {dup.description_similarity > 0 && (
                                <span className="text-[#91C8BD] font-mono">
                                  · {Math.round(dup.description_similarity * 100)}% text similarity
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-[#91C8BD]">
                              Status: {STATUS_LABELS[dup.status]?.label || dup.status}
                            </span>
                          </div>

                          <p className="text-[#F4F7F7] text-xs">{dup.description}</p>

                          {dup.match_reasons && dup.match_reasons.length > 0 && (
                            <div className="text-[11px] text-[#AABDC2]">
                              Why flagged: {dup.match_reasons.join(' · ')}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2A444E]">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('track')
                                setTrackCode(dup.complaint_id)
                                handleTrackLookup(undefined, dup.complaint_id)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#1C3038] hover:bg-[#233B44] border border-[#2A444E] text-[#91C8BD] font-semibold transition-colors"
                            >
                              View Existing Complaint
                            </button>

                            <button
                              type="button"
                              disabled={isConfirmingDuplicateId === dup.complaint_id}
                              onClick={() => handleConfirmSameIssue(dup)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] font-semibold transition-colors disabled:opacity-50"
                            >
                              <GitMerge size={13} />
                              <span>
                                {isConfirmingDuplicateId === dup.complaint_id
                                  ? 'Confirming…'
                                  : 'Confirm Same Issue'}
                              </span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-amber-500/30">
                      <span className="text-[11px] text-amber-200/90">
                        Not the same issue? Submit your complaint as a new separate record:
                      </span>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={executeCreateSeparateComplaint}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {isSubmitting ? 'Submitting Separate Report…' : 'Continue with Separate Report'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2 border-t border-[#2A444E] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-[#AABDC2]">
                    {citizenSession
                      ? `Submitting as ${citizenSession.user.full_name} · Personal contact info is never exposed publicly.`
                      : 'Anonymous submission · Personal data is never exposed.'}
                  </span>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading || isCheckingDuplicates}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <Send size={15} />
                    <span>
                      {isCheckingDuplicates
                        ? 'Checking Duplicates…'
                        : isSubmitting
                        ? 'Submitting…'
                        : 'Submit Complaint'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: TRACK MY COMPLAINT */}
        {activeTab === 'track' && (
          <div className="space-y-5">
            <form
              onSubmit={(e) => handleTrackLookup(e)}
              className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 sm:p-6 space-y-3.5"
            >
              <label className="block text-xs sm:text-sm font-semibold text-[#F4F7F7]">
                Complaint Reference Number
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AABDC2]"
                  />
                  <input
                    type="text"
                    value={trackCode}
                    onChange={(e) => setTrackCode(e.target.value)}
                    placeholder="e.g., CE-202609-0001"
                    className="w-full bg-[#101C23] border border-[#2A444E] focus:border-[#91C8BD] rounded-lg pl-10 pr-4 py-2.5 text-sm font-mono text-[#F4F7F7] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isTracking}
                  className="px-5 py-2.5 rounded-lg bg-[#367F77] hover:bg-[#2d6b64] text-[#F4F7F7] text-sm font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {isTracking ? 'Checking…' : 'Track Status'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#AABDC2]">
                <span>Try sample ID:</span>
                {['CE-202609-0001', 'CE-202609-0002', 'CE-202609-0005'].map((sampleId) => (
                  <button
                    key={sampleId}
                    type="button"
                    onClick={() => {
                      setTrackCode(sampleId)
                      handleTrackLookup(undefined, sampleId)
                    }}
                    className="font-mono text-[#91C8BD] hover:text-[#F4F7F7] underline"
                  >
                    {sampleId}
                  </button>
                ))}
              </div>
            </form>

            {trackError && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-700/60 text-red-200 text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <span>{trackError}</span>
              </div>
            )}

            {trackedComplaint && (
              <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2A444E] pb-4">
                  <div>
                    <span className="text-xs text-[#AABDC2] font-mono">
                      {trackedComplaint.complaint_id}
                    </span>
                    <h2 className="text-lg font-bold text-[#F4F7F7] mt-0.5">
                      {trackedComplaint.category}
                    </h2>
                    <p className="text-xs text-[#AABDC2] mt-0.5">
                      {trackedComplaint.address ||
                        `Pune (${trackedComplaint.latitude.toFixed(4)}°N, ${trackedComplaint.longitude.toFixed(4)}°E)`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#AABDC2] block">Status</span>
                    <span className="text-sm font-bold text-[#91C8BD]">
                      {STATUS_LABELS[trackedComplaint.status]?.label || 'Submitted'}
                    </span>
                  </div>
                </div>

                {/* 5-Step Progress */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { step: 1, title: 'Submitted' },
                    { step: 2, title: 'Under Review' },
                    { step: 3, title: 'Assigned' },
                    { step: 4, title: 'In Progress' },
                    { step: 5, title: 'Resolved' },
                  ].map((item) => {
                    const currentStep = STATUS_LABELS[trackedComplaint.status]?.step || 1
                    const reached = currentStep >= item.step
                    return (
                      <div
                        key={item.step}
                        className={`p-2.5 rounded-lg border text-xs font-semibold text-center ${
                          reached
                            ? 'bg-[#367F77]/30 border-[#91C8BD] text-[#F4F7F7]'
                            : 'bg-[#101C23] border-[#2A444E] text-[#AABDC2]'
                        }`}
                      >
                        {item.title}
                      </div>
                    )
                  })}
                </div>

                {/* Public Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#101C23] border border-[#2A444E] rounded-xl p-3.5 text-xs">
                  <div>
                    <span className="text-[#AABDC2] block">Department</span>
                    <span className="font-semibold text-[#F4F7F7] mt-0.5 block">
                      {trackedComplaint.department_name ||
                        trackedComplaint.department ||
                        'Roads & Infrastructure'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#AABDC2] block">Observations</span>
                    <span className="font-semibold text-[#F4F7F7] font-mono mt-0.5 block">
                      {trackedComplaint.observation_count} sighting(s)
                    </span>
                  </div>
                  <div>
                    <span className="text-[#AABDC2] block">Reported On</span>
                    <span className="font-semibold text-[#F4F7F7] font-mono mt-0.5 block">
                      {new Date(trackedComplaint.first_detected_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#AABDC2] mb-1">Description</h3>
                  <p className="text-sm text-[#F4F7F7]">{trackedComplaint.description}</p>
                </div>

                {/* PHASE 2 — FEATURE B: Before & After Resolution Evidence & Note */}
                {(trackedComplaint.public_repair_verification ||
                  trackedComplaint.before_image_url ||
                  trackedComplaint.after_image_url ||
                  trackedComplaint.resolution_notes) && (
                  <div
                    data-testid="citizen-before-after-resolution"
                    className="bg-[#101C23] border border-[#367F77] rounded-xl p-4 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#91C8BD] flex items-center gap-1.5">
                        <FileCheck2 size={14} />
                        <span>Before & After Resolution Evidence</span>
                      </span>
                      {trackedComplaint.public_repair_verification && (
                        <span className="text-[11px] font-semibold text-[#91C8BD]">
                          {trackedComplaint.public_repair_verification.status_label ||
                            trackedComplaint.public_repair_verification.verification_status.replace(
                              /_/g,
                              ' '
                            )}
                        </span>
                      )}
                    </div>

                    {(trackedComplaint.resolution_notes ||
                      trackedComplaint.public_repair_verification?.public_summary) && (
                      <div className="p-3 rounded-lg bg-[#1C3038] border border-[#2A444E] space-y-1">
                        <div className="text-[11px] font-semibold text-[#91C8BD]">
                          Official Resolution Note
                        </div>
                        <p className="text-xs sm:text-sm text-[#F4F7F7] leading-relaxed">
                          {trackedComplaint.resolution_notes ||
                            trackedComplaint.public_repair_verification?.public_summary}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {(trackedComplaint.before_image_url ||
                        trackedComplaint.public_repair_verification?.before_image_url ||
                        trackedComplaint.media_url ||
                        trackedComplaint.evidence_image_path) && (
                        <div className="bg-[#1C3038] border border-[#2A444E] rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-red-300">
                              Original Complaint Image (Before)
                            </span>
                            <span className="text-[#AABDC2] font-mono">
                              {new Date(trackedComplaint.first_detected_at).toLocaleDateString()}
                            </span>
                          </div>
                          <img
                            src={
                              trackedComplaint.before_image_url ||
                              trackedComplaint.public_repair_verification?.before_image_url ||
                              trackedComplaint.media_url ||
                              trackedComplaint.evidence_image_path ||
                              ''
                            }
                            alt="Original Complaint Before Repair"
                            className="w-full h-44 object-cover rounded border border-[#2A444E]"
                          />
                        </div>
                      )}

                      {(trackedComplaint.after_image_url ||
                        trackedComplaint.resolution_evidence_path ||
                        trackedComplaint.public_repair_verification?.after_image_url) && (
                        <div className="bg-[#1C3038] border border-emerald-500/40 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-emerald-300">
                              Resolution Image (After Repair)
                            </span>
                            {trackedComplaint.resolved_at && (
                              <span className="text-[#AABDC2] font-mono">
                                {new Date(trackedComplaint.resolved_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <img
                            src={
                              trackedComplaint.after_image_url ||
                              trackedComplaint.resolution_evidence_path ||
                              trackedComplaint.public_repair_verification?.after_image_url ||
                              ''
                            }
                            alt="After Repair Resolution"
                            className="w-full h-44 object-cover rounded border border-emerald-500/40"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tracked Location Auto-Zoom Map */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#AABDC2]">
                    <span className="font-semibold">Complaint Location Map</span>
                    <span className="font-mono text-[#91C8BD]">
                      {trackedComplaint.latitude.toFixed(5)}, {trackedComplaint.longitude.toFixed(5)}
                    </span>
                  </div>
                  <div className="h-48 w-full rounded-xl overflow-hidden border border-[#2A444E]">
                    <MapContainer
                      key={`track-map-${trackedComplaint.complaint_id}`}
                      center={[trackedComplaint.latitude, trackedComplaint.longitude]}
                      zoom={STREET_LEVEL_ZOOM}
                      scrollWheelZoom={false}
                      zoomControl={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <SafeTileLayer />
                      <MapInvalidator trigger={trackedComplaint.complaint_id} />
                      <SelectedLocationPin
                        latitude={trackedComplaint.latitude}
                        longitude={trackedComplaint.longitude}
                      />
                    </MapContainer>
                  </div>
                </div>

                {trackedComplaint.status_history && trackedComplaint.status_history.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-[#AABDC2] mb-2">
                      Status Timeline
                    </h3>
                    <div className="space-y-2">
                      {trackedComplaint.status_history.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-2.5 rounded-lg bg-[#101C23] border border-[#2A444E] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Clock size={12} className="text-[#91C8BD] flex-shrink-0" />
                            <span className="font-semibold text-[#F4F7F7]">
                              {STATUS_LABELS[entry.new_status]?.label || entry.new_status}
                            </span>
                            {entry.notes && (
                              <span className="text-[#AABDC2]">— {entry.notes}</span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-[#AABDC2]">
                            {new Date(entry.changed_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Citizen Complaint History List */}
            {myComplaintsHistory.length > 0 && (
              <div className="bg-[#1C3038] border border-[#2A444E] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#F4F7F7] flex items-center gap-2">
                    <History size={15} className="text-[#91C8BD]" />
                    <span>My Complaint History ({myComplaintsHistory.length})</span>
                  </h3>
                  <span className="text-[11px] text-[#AABDC2]">
                    Click any complaint to view full status & resolution proof
                  </span>
                </div>
                <div className="divide-y divide-[#2A444E]">
                  {myComplaintsHistory.map((item) => (
                    <div
                      key={item.complaint_id}
                      onClick={() => {
                        setTrackCode(item.complaint_id)
                        handleTrackLookup(undefined, item.complaint_id)
                      }}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-[#101C23]/50 px-2 rounded-lg transition-colors text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#91C8BD]">
                            {item.complaint_id}
                          </span>
                          <span className="font-semibold text-[#F4F7F7]">{item.category}</span>
                          {item.after_image_url && (
                            <span className="text-emerald-300 font-semibold">
                              · Before & After Proof Available
                            </span>
                          )}
                        </div>
                        <p className="text-[#AABDC2] line-clamp-1">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-[#91C8BD] block">
                          {STATUS_LABELS[item.status]?.label || item.status}
                        </span>
                        <span className="text-[10px] text-[#AABDC2] font-mono">
                          {new Date(item.first_detected_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2A444E] bg-[#1C3038] py-4 px-4 sm:px-6 text-xs text-[#AABDC2]">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span>CivicEye AI · Citizen Portal</span>
          <Link to="/" className="hover:text-[#F4F7F7] hover:underline">
            Home
          </Link>
        </div>
      </footer>
    </div>
  )
}
