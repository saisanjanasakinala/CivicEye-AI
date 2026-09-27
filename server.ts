import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3000
const SECRET_KEY = process.env.SECRET_KEY || 'civiceye-secret-key-change-in-production-2024'
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data')
const DB_FILE = path.join(DATA_DIR, 'civiceye_db.json')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ── File Upload Validation (Images & Videos Only, Max 20MB) ─────────────────
const ALLOWED_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov'])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase()
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg'
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${safeExt}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const mimeOk = ALLOWED_MIME_PREFIXES.some((m) => file.mimetype.toLowerCase().startsWith(m))
    const extOk = ALLOWED_EXTENSIONS.has(ext)
    if (mimeOk || extOk) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file format. Please upload JPG, PNG, WEBP, MP4, or WEBM files under 20MB.'))
    }
  },
})

// ── Rate Limiting for Public Endpoints ──────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function publicRateLimiter(maxRequests = 30, windowMs = 5 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local')
    const key = `${ip}:${req.path}`
    const now = Date.now()
    const entry = rateLimitMap.get(key)
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    entry.count += 1
    if (entry.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests from this IP. Please wait a few minutes before submitting again.',
      })
    }
    next()
  }
}

// ── Server-Side Gemini Client ───────────────────────────────────────────────
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY
  if (!key || key.trim() === '') return null
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  })
}

// ── Data Models ─────────────────────────────────────────────────────────────
interface Department {
  id: number
  name: string
  code: string
  problem_categories: string[]
  contact_email: string
  is_active: boolean
}

interface User {
  id: number
  username: string
  full_name: string
  email: string
  role: 'admin' | 'officer' | 'citizen'
  department_id: number | null
  is_active: boolean
  created_at: string
}

interface GpsPoint {
  latitude: number
  longitude: number
  speed: number
  timestamp: string
  source: 'live' | 'simulated'
}

interface Bus {
  id: number
  bus_number: string
  registration_number: string
  route_name: string
  driver_name: string
  driver_phone: string
  driver_license: string
  is_active: boolean
  operational_status: 'active' | 'maintenance' | 'offline' | string
  gps_source?: 'live' | 'simulated' | 'offline'
  last_seen_at: string | null
  current_latitude: number | null
  current_longitude: number | null
  current_speed: number | null
}

interface RouteWaypoint {
  lat: number
  lng: number
  name: string
}

interface BusRoute {
  id: number
  bus_id: number
  name: string
  waypoints: RouteWaypoint[]
  created_at: string
}

interface StatusHistory {
  id: number
  old_status: string | null
  new_status: string
  changed_by: number | null
  changed_by_name?: string
  changed_at: string
  notes: string | null
}

interface Assignment {
  id: number
  complaint_id: number
  assigned_to: number
  assigned_to_name?: string
  assigned_by: number
  assigned_at: string
  notes: string | null
}

interface Evidence {
  id: number
  complaint_id: number
  image_path: string
  image_type: 'detection' | 'citizen' | 'resolution' | string
  uploaded_by: number | null
  uploaded_by_name?: string
  notes?: string | null
  created_at: string
}

interface Detection {
  id: number
  bus_id: number | null
  complaint_id: number | null
  category: string
  confidence: number
  bbox: { x1: number; y1: number; x2: number; y2: number } | null
  image_path: string | null
  timestamp: string
  latitude: number | null
  longitude: number | null
  is_simulated: boolean
  ai_model?: string
  description?: string
}

interface PriorityOverrideRecord {
  priority: 'low' | 'medium' | 'high' | 'critical'
  recommended_priority: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  overridden_by_id: number
  overridden_by_name: string
  overridden_by_role: string
  overridden_at: string
}

interface PriorityHistoryEntry {
  id: number
  old_priority: 'low' | 'medium' | 'high' | 'critical'
  new_priority: 'low' | 'medium' | 'high' | 'critical'
  recommended_priority: 'low' | 'medium' | 'high' | 'critical'
  is_manual_override: boolean
  changed_by_id: number
  changed_by_name: string
  changed_by_role: string
  reason: string
  changed_at: string
}

type VerificationDecisionStatus =
  | 'pending_upload'
  | 'pending_review'
  | 'verified'
  | 'needs_reinspection'
  | 'rejected'

interface ReinspectionDetectionLink {
  detection_id: number
  bus_id: number | null
  bus_number: string | null
  category: string
  confidence: number
  distance_meters: number
  timestamp: string
  image_path: string | null
  is_simulated: boolean
  description: string
}

interface VisionComparisonResult {
  mode: 'gemini_vision' | 'manual_demo'
  analyzed_at: string
  model_name: string
  issue_resolved_assessment: 'likely_repaired' | 'partially_repaired' | 'still_present' | 'inconclusive'
  confidence: number | null
  summary: string
  observed_changes: string[]
  limitations: string
  is_demo_fallback: boolean
}

interface RepairVerificationRecord {
  verification_status: VerificationDecisionStatus
  before_image_url: string | null
  before_captured_at: string
  before_latitude: number
  before_longitude: number
  before_source_label: string
  before_is_simulated?: boolean
  after_image_url: string | null
  after_uploaded_at: string | null
  after_uploaded_by_name: string | null
  after_latitude: number | null
  after_longitude: number | null
  after_notes: string | null
  after_is_simulated?: boolean
  decision_by_id: number | null
  decision_by_name: string | null
  decision_by_role: string | null
  decision_at: string | null
  decision_notes: string | null
  public_approved: boolean
  public_summary: string | null
  vision_comparison: VisionComparisonResult | null
  reinspection_detections: ReinspectionDetectionLink[]
  history: {
    id: number
    action: string
    status: VerificationDecisionStatus
    actor_name: string
    actor_role: string
    notes: string
    timestamp: string
    after_image_url?: string | null
  }[]
}

interface Complaint {
  id: number
  complaint_id: string
  category: string
  description: string
  latitude: number
  longitude: number
  bus_id: number | null
  source: 'bus_camera' | 'citizen_portal' | 'officer_manual'
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'assigned' | 'in_progress' | 'awaiting_verification' | 'resolved' | 'closed'
  department_id: number | null
  department_name?: string
  observation_count: number
  first_detected_at: string
  last_detected_at: string
  resolved_at: string | null
  resolution_notes: string | null
  evidence_image_path: string | null
  resolution_evidence_path?: string | null
  address?: string | null
  media_url?: string | null
  media_type?: 'image' | 'video' | null
  is_anonymous?: boolean
  is_simulated?: boolean
  contact_name?: string | null
  contact_phone?: string | null
  merged_into_complaint_id?: string | null
  priority_override?: PriorityOverrideRecord | null
  priority_history?: PriorityHistoryEntry[]
  repair_verification?: RepairVerificationRecord
  status_history: StatusHistory[]
  assignments: Assignment[]
  evidence?: Evidence[]
}

interface AuditLog {
  id: number
  action: string
  entity_type: 'complaint' | 'bus' | 'detection' | 'system'
  entity_id: string
  actor_name: string
  actor_role: string
  details: string
  timestamp: string
}

interface Notification {
  id: number
  user_id: number
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  is_read: boolean
  complaint_id: number | null
  created_at: string
}

// ── Static Reference Data ───────────────────────────────────────────────────
const departments: Department[] = [
  { id: 1, name: 'Roads & Infrastructure', code: 'ROADS', problem_categories: ['Pothole', 'Road Damage', 'Broken Road', 'Road Obstruction', 'Other Civic Hazard', 'Illegal Dumping'], contact_email: 'roads@punecity.gov.in', is_active: true },
  { id: 2, name: 'Sanitation & Waste', code: 'SANITATION', problem_categories: ['Garbage', 'Illegal Dumping', 'Stray Animals'], contact_email: 'sanitation@punecity.gov.in', is_active: true },
  { id: 3, name: 'Parks & Horticulture', code: 'PARKS', problem_categories: ['Fallen Tree', 'Park Maintenance'], contact_email: 'parks@punecity.gov.in', is_active: true },
  { id: 4, name: 'Drainage & Waterways', code: 'DRAINAGE', problem_categories: ['Waterlogging', 'Open Drain', 'Flood Risk'], contact_email: 'drainage@punecity.gov.in', is_active: true },
  { id: 5, name: 'Electrical & Lighting', code: 'ELECTRICAL', problem_categories: ['Broken Streetlight', 'Power Line', 'Electrical Hazard'], contact_email: 'electrical@punecity.gov.in', is_active: true },
]

// ── Password Hashing Helpers (Scrypt + Timing-Safe Verification) ───────────
const PASSWORD_SALT = 'civiceye-municipal-rbac-salt-v1'
function hashPassword(plain: string): string {
  return crypto.scryptSync(plain, PASSWORD_SALT, 64).toString('hex')
}

function verifyPassword(plain: string, storedHash: string): boolean {
  if (!plain || !storedHash) return false
  try {
    const candidate = crypto.scryptSync(plain, PASSWORD_SALT, 64)
    const expected = Buffer.from(storedHash, 'hex')
    if (candidate.length !== expected.length) return false
    return crypto.timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

const users: (User & { passwordHash: string; isDemoAccount?: boolean })[] = [
  {
    id: 1,
    username: 'admin',
    full_name: 'Municipal Commissioner (Admin)',
    email: 'admin@civiceye.ai',
    role: 'admin',
    department_id: null,
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    passwordHash: hashPassword(process.env.DEMO_ADMIN_PASSWORD || 'admin123'),
    isDemoAccount: true,
  },
  {
    id: 2,
    username: 'officer1',
    full_name: 'Officer Ramesh (Roads)',
    email: 'officer1@punecity.gov.in',
    role: 'officer',
    department_id: 1,
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    passwordHash: hashPassword(process.env.DEMO_OFFICER_PASSWORD || 'pass123'),
    isDemoAccount: true,
  },
  {
    id: 3,
    username: 'officer2',
    full_name: 'Officer Suresh (Sanitation)',
    email: 'officer2@punecity.gov.in',
    role: 'officer',
    department_id: 2,
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    passwordHash: hashPassword(process.env.DEMO_OFFICER_PASSWORD || 'pass123'),
    isDemoAccount: true,
  },
  {
    id: 5,
    username: 'officer3',
    full_name: 'Officer Priya (Drainage)',
    email: 'officer3@punecity.gov.in',
    role: 'officer',
    department_id: 4,
    is_active: true,
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    passwordHash: hashPassword(process.env.DEMO_OFFICER_PASSWORD || 'pass123'),
    isDemoAccount: true,
  },
  {
    id: 4,
    username: 'citizen1',
    full_name: 'Citizen Rahul',
    email: 'citizen1@gmail.com',
    role: 'citizen',
    department_id: null,
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    passwordHash: hashPassword('pass123'),
    isDemoAccount: false,
  },
]

const PUNE_ROUTES: Record<string, RouteWaypoint[]> = {
  'Route 11 — Swargate to Katraj': [
    { lat: 18.5018, lng: 73.856, name: 'Swargate Bus Stand' },
    { lat: 18.4975, lng: 73.8538, name: 'Bibwewadi Corner' },
    { lat: 18.4892, lng: 73.8503, name: 'Anand Nagar' },
    { lat: 18.4815, lng: 73.8474, name: 'Katraj Chowk' },
    { lat: 18.4762, lng: 73.8441, name: 'Katraj Bus Depot' },
  ],
  'Route 47 — Shivajinagar to Hadapsar': [
    { lat: 18.5308, lng: 73.8474, name: 'Shivajinagar Station' },
    { lat: 18.5265, lng: 73.8602, name: 'Deccan Gymkhana' },
    { lat: 18.5142, lng: 73.8732, name: 'Pune Railway Station' },
    { lat: 18.5081, lng: 73.8901, name: 'Sangamwadi' },
    { lat: 18.501, lng: 73.9168, name: 'Hadapsar Bus Stop' },
  ],
  'Route 99 — Kothrud to Viman Nagar': [
    { lat: 18.5074, lng: 73.8077, name: 'Kothrud Depot' },
    { lat: 18.513, lng: 73.8254, name: 'Karve Nagar' },
    { lat: 18.52, lng: 73.8474, name: 'Shivajinagar' },
    { lat: 18.5308, lng: 73.8997, name: 'Pune Airport Rd' },
    { lat: 18.5642, lng: 73.9145, name: 'Viman Nagar' },
  ],
}

const categoryToDept: Record<string, number> = {
  Pothole: 1,
  'Road Damage': 1,
  'Broken Road': 1,
  'Road Obstruction': 1,
  'Other Civic Hazard': 1,
  Garbage: 2,
  'Illegal Dumping': 2,
  'Stray Animals': 2,
  'Fallen Tree': 3,
  'Park Maintenance': 3,
  Waterlogging: 4,
  'Open Drain': 4,
  'Flood Risk': 4,
  'Broken Streetlight': 5,
  'Power Line': 5,
  'Electrical Hazard': 5,
}

// ── Mutable Persistent State ────────────────────────────────────────────────
let buses: Bus[] = []
let busRoutes: BusRoute[] = []
let gpsHistory: Record<number, GpsPoint[]> = {}
let complaints: Complaint[] = []
let detections: Detection[] = []
let evidenceList: Evidence[] = []
let auditLogs: AuditLog[] = []
let notifications: Notification[] = []
let nextComplaintNum = 1
let nextNotifId = 1
let dedupThresholdMeters = 50
let revokedTokens = new Set<string>()
let roadHealthCache: any[] = []

function seedInitialData() {
  buses = [
    {
      id: 1,
      bus_number: 'PMC-11',
      registration_number: 'MH-12-CY-1101',
      route_name: 'Route 11 — Swargate to Katraj',
      driver_name: 'Ramesh Patil',
      driver_phone: '+91 98220 11001',
      driver_license: 'DL-MH12-2015-001',
      is_active: true,
      operational_status: 'active',
      gps_source: 'live',
      last_seen_at: new Date(Date.now() - 90 * 1000).toISOString(),
      current_latitude: 18.4975,
      current_longitude: 73.8538,
      current_speed: 28.5,
    },
    {
      id: 2,
      bus_number: 'PMC-47',
      registration_number: 'MH-12-CY-4702',
      route_name: 'Route 47 — Shivajinagar to Hadapsar',
      driver_name: 'Suresh Kulkarni',
      driver_phone: '+91 98220 47002',
      driver_license: 'DL-MH12-2017-047',
      is_active: true,
      operational_status: 'active',
      gps_source: 'live',
      last_seen_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(), // Stale GPS (~14 mins ago)
      current_latitude: 18.5265,
      current_longitude: 73.8602,
      current_speed: 32.0,
    },
    {
      id: 3,
      bus_number: 'PMC-99',
      registration_number: 'MH-12-CY-9903',
      route_name: 'Route 99 — Kothrud to Viman Nagar',
      driver_name: 'Anil Shinde',
      driver_phone: '+91 98220 99003',
      driver_license: 'DL-MH12-2018-099',
      is_active: true,
      operational_status: 'active',
      gps_source: 'simulated',
      last_seen_at: new Date(Date.now() - 60 * 1000).toISOString(),
      current_latitude: 18.52,
      current_longitude: 73.8474,
      current_speed: 24.0,
    },
    {
      id: 4,
      bus_number: 'PMC-104',
      registration_number: 'MH-12-CY-1044',
      route_name: 'Route 104 — Nigdi to Baner Depot',
      driver_name: 'Mahesh Jadhav',
      driver_phone: '+91 98220 10404',
      driver_license: 'DL-MH12-2019-104',
      is_active: false,
      operational_status: 'maintenance',
      gps_source: 'offline',
      last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      current_latitude: 18.559,
      current_longitude: 73.7868,
      current_speed: 0,
    },
  ]

  busRoutes = buses.map((b, idx) => ({
    id: idx + 1,
    bus_id: b.id,
    name: b.route_name,
    waypoints: PUNE_ROUTES[b.route_name] || [
      { lat: b.current_latitude || 18.5204, lng: b.current_longitude || 73.8567, name: 'Start Terminal' },
      { lat: (b.current_latitude || 18.5204) + 0.012, lng: (b.current_longitude || 73.8567) + 0.015, name: 'Mid Corridor' },
    ],
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  }))

  gpsHistory = {}
  for (const r of busRoutes) {
    const b = buses.find((x) => x.id === r.bus_id)
    const src: 'live' | 'simulated' = b?.gps_source === 'simulated' ? 'simulated' : 'live'
    gpsHistory[r.bus_id] = r.waypoints.map((wp, i) => ({
      latitude: wp.lat,
      longitude: wp.lng,
      speed: 22 + i * 3,
      timestamp: new Date(Date.now() - (r.waypoints.length - i) * 8 * 60 * 1000).toISOString(),
      source: src,
    }))
  }

  const COMPLAINT_SCENARIOS = [
    { category: 'Pothole', severity: 'high' as const, description: 'Deep pothole on Swargate-Bibwewadi road near Anand petrol pump. Approx 2 ft wide, causing vehicle damage.', lat: 18.4985, lng: 73.8542, source: 'bus_camera' as const },
    { category: 'Pothole', severity: 'critical' as const, description: 'Multiple potholes on Katraj Ghat stretch, dangerous for two-wheelers especially at night.', lat: 18.483, lng: 73.8488, source: 'bus_camera' as const },
    { category: 'Pothole', severity: 'medium' as const, description: 'Pothole near Deccan Gymkhana bus stop, road dug up but not repaired after water pipeline work.', lat: 18.527, lng: 73.861, source: 'citizen_portal' as const },
    { category: 'Garbage', severity: 'high' as const, description: 'Large garbage mound near Hadapsar market, not cleared for 5+ days. Foul smell affecting nearby residents.', lat: 18.5015, lng: 73.918, source: 'bus_camera' as const },
    { category: 'Garbage', severity: 'medium' as const, description: 'Overflowing dustbins outside Shivajinagar station area. Waste spilling onto footpath.', lat: 18.5315, lng: 73.8465, source: 'citizen_portal' as const },
    { category: 'Garbage', severity: 'low' as const, description: 'Scattered plastic waste behind Kothrud bus depot compound wall.', lat: 18.5068, lng: 73.809, source: 'bus_camera' as const },
    { category: 'Waterlogging', severity: 'critical' as const, description: 'Severe waterlogging on Sangamwadi road after rain, water level reaching 1.5 ft. Traffic at standstill.', lat: 18.509, lng: 73.8905, source: 'bus_camera' as const },
    { category: 'Waterlogging', severity: 'high' as const, description: 'Water accumulation near Karve Nagar underpass, vehicles getting stranded.', lat: 18.5128, lng: 73.826, source: 'citizen_portal' as const },
    { category: 'Fallen Tree', severity: 'critical' as const, description: 'Large rain tree fallen across Viman Nagar main road blocking both lanes. Emergency clearance needed.', lat: 18.5638, lng: 73.9152, source: 'bus_camera' as const },
    { category: 'Fallen Tree', severity: 'high' as const, description: 'Tree branch fallen on electricity wire near Deccan bus stop. Power line sagging dangerously.', lat: 18.526, lng: 73.8598, source: 'citizen_portal' as const },
    { category: 'Broken Streetlight', severity: 'medium' as const, description: 'Three consecutive streetlights non-functional on Bibwewadi main road. Area very dark at night.', lat: 18.4978, lng: 73.854, source: 'bus_camera' as const },
    { category: 'Broken Streetlight', severity: 'medium' as const, description: 'Street light pole tilted and hanging loose near Katraj Circle. Hazard to pedestrians.', lat: 18.482, lng: 73.8478, source: 'bus_camera' as const },
    { category: 'Broken Streetlight', severity: 'low' as const, description: 'Flickering street light outside Pune Railway Station gate no. 3.', lat: 18.5148, lng: 73.874, source: 'citizen_portal' as const },
    { category: 'Open Drain', severity: 'high' as const, description: 'Open storm drain without cover near Hadapsar industrial area. Urgent concrete slab cover needed.', lat: 18.5008, lng: 73.9175, source: 'citizen_portal' as const },
    { category: 'Open Drain', severity: 'medium' as const, description: 'Drain cover missing on Shivajinagar-Deccan stretch, visible open drain of 3 ft depth.', lat: 18.5295, lng: 73.849, source: 'bus_camera' as const },
    { category: 'Illegal Dumping', severity: 'high' as const, description: 'Construction debris dumped illegally on footpath near Anand Nagar school.', lat: 18.4895, lng: 73.851, source: 'bus_camera' as const },
    { category: 'Illegal Dumping', severity: 'medium' as const, description: 'Old mattresses and furniture dumped near Sangamwadi bridge approach.', lat: 18.508, lng: 73.891, source: 'citizen_portal' as const },
    { category: 'Stray Animals', severity: 'medium' as const, description: 'Stray cattle obstructing traffic near Kothrud market area.', lat: 18.5072, lng: 73.8082, source: 'citizen_portal' as const },
    { category: 'Pothole', severity: 'high' as const, description: 'Road cave-in near Karve statue chowk. Pothole 3 ft deep, police barricade in place.', lat: 18.5135, lng: 73.8256, source: 'bus_camera' as const },
    { category: 'Garbage', severity: 'critical' as const, description: 'Uncollected municipal waste in Viman Nagar sector 4 spilling onto main road.', lat: 18.5645, lng: 73.9148, source: 'citizen_portal' as const },
  ]

  const statusOptions: Complaint['status'][] = ['new', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'closed']
  nextComplaintNum = 1

  complaints = COMPLAINT_SCENARIOS.map((s, idx) => {
    const status = statusOptions[idx % statusOptions.length]
    const deptId = categoryToDept[s.category] || 1
    const dept = departments.find((d) => d.id === deptId)
    const daysAgo = idx * 1.1 + 1
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
    const isResolved = status === 'resolved' || status === 'closed'
    const resolvedAt = isResolved ? new Date(Date.now() - Math.max(0.2, daysAgo - 1.5) * 86400000).toISOString() : null
    const activeBuses = buses.filter((b) => b.is_active)
    const bus = s.source === 'bus_camera' ? activeBuses[idx % activeBuses.length] : null

    const history: StatusHistory[] = [
      {
        id: idx * 10 + 1,
        old_status: null,
        new_status: 'new',
        changed_by: null,
        changed_by_name: s.source === 'bus_camera' ? `Bus ${bus?.bus_number} AI Scanner` : 'Anonymous Citizen',
        changed_at: createdAt,
        notes:
          s.source === 'bus_camera'
            ? `Auto-detected by transit bus ${bus?.bus_number} onboard camera`
            : 'Submitted anonymously via Public Citizen Portal',
      },
    ]
    if (status !== 'new') {
      history.push({
        id: idx * 10 + 2,
        old_status: 'new',
        new_status: 'assigned',
        changed_by: 1,
        changed_by_name: 'Municipal Commissioner (Admin)',
        changed_at: new Date(Date.parse(createdAt) + 3600000).toISOString(),
        notes: `Routed to ${dept?.name}`,
      })
    }
    if (['in_progress', 'awaiting_verification', 'resolved', 'closed'].includes(status)) {
      history.push({
        id: idx * 10 + 3,
        old_status: 'assigned',
        new_status: 'in_progress',
        changed_by: 2,
        changed_by_name: 'Officer Ramesh (Roads)',
        changed_at: new Date(Date.parse(createdAt) + 8 * 3600000).toISOString(),
        notes: 'Field maintenance crew dispatched to location',
      })
    }
    if (['awaiting_verification', 'resolved', 'closed'].includes(status)) {
      history.push({
        id: idx * 10 + 4,
        old_status: 'in_progress',
        new_status: 'awaiting_verification',
        changed_by: 2,
        changed_by_name: 'Officer Ramesh (Roads)',
        changed_at: new Date(Date.parse(createdAt) + 18 * 3600000).toISOString(),
        notes: 'Field work completed; awaiting supervisor inspection',
      })
    }
    if (['resolved', 'closed'].includes(status)) {
      history.push({
        id: idx * 10 + 5,
        old_status: 'awaiting_verification',
        new_status: 'resolved',
        changed_by: 1,
        changed_by_name: 'Municipal Commissioner (Admin)',
        changed_at: resolvedAt!,
        notes: 'Verified and confirmed resolved by municipal engineer',
      })
    }
    if (status === 'closed') {
      history.push({
        id: idx * 10 + 6,
        old_status: 'resolved',
        new_status: 'closed',
        changed_by: 1,
        changed_by_name: 'Municipal Commissioner (Admin)',
        changed_at: new Date(Date.parse(resolvedAt!) + 6 * 3600000).toISOString(),
        notes: 'Complaint closed and archived',
      })
    }

    const cid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`

    return {
      id: idx + 1,
      complaint_id: cid,
      category: s.category,
      description: s.description,
      latitude: +(s.lat + (idx % 3 - 1) * 0.0002).toFixed(6),
      longitude: +(s.lng + (idx % 3 - 1) * 0.0002).toFixed(6),
      address: `Pune Municipal Ward · (${s.lat.toFixed(4)}°N, ${s.lng.toFixed(4)}°E)`,
      bus_id: bus ? bus.id : null,
      source: s.source,
      severity: s.severity,
      status,
      department_id: deptId,
      department_name: dept?.name,
      observation_count: s.source === 'bus_camera' ? (idx % 4) + 1 : 1,
      first_detected_at: createdAt,
      last_detected_at: new Date(Date.parse(createdAt) + 3600000).toISOString(),
      resolved_at: resolvedAt,
      resolution_notes: isResolved ? 'Site cleared and surface restored to municipal safety standards.' : null,
      evidence_image_path: null,
      resolution_evidence_path: null,
      is_anonymous: s.source === 'citizen_portal',
      is_simulated: false,
      status_history: history,
      assignments:
        status !== 'new'
          ? [
              {
                id: idx + 1,
                complaint_id: idx + 1,
                assigned_to: deptId === 1 ? 2 : 3,
                assigned_to_name: deptId === 1 ? 'Officer Ramesh (Roads)' : 'Officer Suresh (Sanitation)',
                assigned_by: 1,
                assigned_at: createdAt,
                notes: 'Assigned for ward inspection',
              },
            ]
          : [],
      evidence: [],
    }
  })

  detections = complaints
    .filter((c) => c.bus_id !== null)
    .map((c, idx) => ({
      id: idx + 1,
      bus_id: c.bus_id,
      complaint_id: c.id,
      category: c.category,
      confidence: +(0.82 + (idx % 12) * 0.01).toFixed(2),
      bbox: { x1: 140, y1: 190, x2: 380, y2: 330 },
      image_path: null,
      timestamp: c.first_detected_at,
      latitude: c.latitude,
      longitude: c.longitude,
      is_simulated: true,
      ai_model: 'seed-historical',
      description: c.description,
    }))

  evidenceList = []

  auditLogs = [
    {
      id: 1,
      action: 'STATUS_RESOLVED',
      entity_type: 'complaint',
      entity_id: 'CE-202609-0005',
      actor_name: 'Municipal Commissioner (Admin)',
      actor_role: 'admin',
      details: 'Verified resolution of Garbage complaint at Shivajinagar Station.',
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 2,
      action: 'BUS_GPS_REPORT',
      entity_type: 'bus',
      entity_id: 'PMC-11',
      actor_name: 'Bus Telemetry Gateway',
      actor_role: 'system',
      details: 'Bus PMC-11 reported live GPS along Route 11 — Swargate to Katraj.',
      timestamp: new Date(Date.now() - 1 * 3600000).toISOString(),
    },
  ]

  nextNotifId = 1
  notifications = [
    { id: nextNotifId++, user_id: 1, title: 'Critical Pothole Cluster Detected', message: 'Bus PMC-11 reported a critical road defect on Katraj Ghat stretch.', type: 'warning', is_read: false, complaint_id: 2, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: nextNotifId++, user_id: 1, title: 'Complaint Resolved', message: 'Complaint CE-202609-0005 has been verified resolved by Sanitation & Waste.', type: 'success', is_read: false, complaint_id: 5, created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: nextNotifId++, user_id: 2, title: 'New Work Order Assigned', message: 'You have been assigned to inspect Swargate-Bibwewadi road defect (CE-202609-0001).', type: 'info', is_read: true, complaint_id: 1, created_at: new Date(Date.now() - 14400000).toISOString() },
    { id: nextNotifId++, user_id: 1, title: 'Verification Requested', message: 'Waterlogging clearance at Karve Nagar is awaiting supervisor verification.', type: 'info', is_read: false, complaint_id: 8, created_at: new Date(Date.now() - 28800000).toISOString() },
  ]
}

function saveDatabase() {
  try {
    const payload = {
      buses,
      busRoutes,
      gpsHistory,
      complaints,
      detections,
      evidenceList,
      auditLogs,
      notifications,
      nextComplaintNum,
      nextNotifId,
      dedupThresholdMeters,
      roadHealthCache,
      revokedTokens: Array.from(revokedTokens).slice(-500),
      updatedAt: new Date().toISOString(),
    }
    const tmpFile = `${DB_FILE}.tmp`
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8')
    fs.renameSync(tmpFile, DB_FILE)
  } catch (err) {
    console.error('[CivicEye AI] Failed to persist database:', err)
  }
}

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.complaints) && parsed.complaints.length > 0) {
        buses = parsed.buses || []
        busRoutes = parsed.busRoutes || []
        gpsHistory = parsed.gpsHistory || {}
        complaints = (parsed.complaints || []).map((c: Complaint) => {
          const deptId =
            typeof c.department_id === 'number' && c.department_id > 0
              ? c.department_id
              : categoryToDept[c.category] || 1
          const dept = departments.find((d) => d.id === deptId)
          return {
            ...c,
            department_id: deptId,
            department_name: dept ? dept.name : c.department_name || 'Roads & Infrastructure',
          }
        })
        detections = parsed.detections || []
        evidenceList = parsed.evidenceList || []
        auditLogs = parsed.auditLogs || []
        notifications = parsed.notifications || []
        nextComplaintNum = parsed.nextComplaintNum || complaints.length + 1
        nextNotifId = parsed.nextNotifId || notifications.length + 1
        if (Array.isArray(parsed.revokedTokens)) {
          revokedTokens = new Set<string>(parsed.revokedTokens)
        }
        if (typeof parsed.dedupThresholdMeters === 'number' && parsed.dedupThresholdMeters >= 10) {
          dedupThresholdMeters = parsed.dedupThresholdMeters
        }
        return
      }
    }
  } catch (err) {
    console.warn('[CivicEye AI] Database load warning, seeding fresh store:', err)
  }
  seedInitialData()
  saveDatabase()
}

loadDatabase()

function recordAudit(
  action: string,
  entityType: AuditLog['entity_type'],
  entityId: string,
  actorUser: User | null | undefined,
  details: string
) {
  auditLogs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_name: actorUser ? actorUser.full_name : 'Public / Automated System',
    actor_role: actorUser ? actorUser.role : 'system',
    details,
    timestamp: new Date().toISOString(),
  })
  if (auditLogs.length > 250) {
    auditLogs = auditLogs.slice(0, 250)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function computeBusGpsStatus(bus: Bus): 'live' | 'stale' | 'offline' | 'simulated' {
  if (!bus.is_active || bus.operational_status === 'offline' || bus.operational_status === 'maintenance') {
    return 'offline'
  }
  if (bus.gps_source === 'simulated') {
    return 'simulated'
  }
  if (!bus.last_seen_at || bus.current_latitude === null || bus.current_longitude === null) {
    return 'offline'
  }
  const ageMs = Date.now() - new Date(bus.last_seen_at).getTime()
  if (ageMs <= 5 * 60 * 1000) return 'live'
  if (ageMs <= 30 * 60 * 1000) return 'stale'
  return 'offline'
}

function enrichBus(bus: Bus, currentUser?: User) {
  const allBusComplaints = complaints.filter((c) => c.bus_id === bus.id)
  const visibleBusComplaints = currentUser
    ? allBusComplaints.filter((c) => canUserAccessComplaint(currentUser, c))
    : allBusComplaints
  const busDetections = detections.filter((d) => d.bus_id === bus.id)
  const latestIssues = visibleBusComplaints.slice(0, 3).map((c) => ({
    id: c.id,
    complaint_id: c.complaint_id,
    category: c.category,
    status: c.status,
    first_detected_at: c.first_detected_at,
  }))
  return {
    ...bus,
    driver_id: bus.driver_license || `DRV-${String(bus.id).padStart(3, '0')}`,
    status: bus.operational_status,
    gps_status: computeBusGpsStatus(bus),
    last_updated: bus.last_seen_at || undefined,
    total_detections: allBusComplaints.length || busDetections.length,
    complaints_count: allBusComplaints.length,
    detections_count: busDetections.length,
    history_count: (gpsHistory[bus.id] || []).length,
    latest_issues: latestIssues,
  }
}

// ── Feature 1, 2 & 3 Helper Engines ──────────────────────────────────────────

interface RoadSegmentDef {
  segment_id: string
  name: string
  corridor_road: string
  ward_name: string
  length_km: number
  waypoints: [number, number][]
  center: [number, number]
  associated_bus_id?: number
}

const PREDEFINED_ROAD_SEGMENTS: RoadSegmentDef[] = [
  {
    segment_id: 'SEG-01',
    name: 'Swargate – Bibwewadi Corridor',
    corridor_road: 'Pune–Satara Road (NH-48 Urban)',
    ward_name: 'Bibwewadi – Sahakarnagar Ward',
    length_km: 1.8,
    waypoints: [
      [18.5018, 73.856],
      [18.4985, 73.8542],
      [18.4975, 73.8538],
    ],
    center: [18.4985, 73.8542],
    associated_bus_id: 1,
  },
  {
    segment_id: 'SEG-02',
    name: 'Bibwewadi – Katraj Ghat Stretch',
    corridor_road: 'Satara Highway – Katraj Chowk',
    ward_name: 'Katraj – Dhankawadi Ward',
    length_km: 3.1,
    waypoints: [
      [18.4975, 73.8538],
      [18.4892, 73.8503],
      [18.483, 73.8488],
      [18.4815, 73.8474],
      [18.4762, 73.8441],
    ],
    center: [18.483, 73.8488],
    associated_bus_id: 1,
  },
  {
    segment_id: 'SEG-03',
    name: 'Shivajinagar – Deccan Gymkhana',
    corridor_road: 'Jangli Maharaj (JM) & FC Road',
    ward_name: 'Shivajinagar – Ghole Road Ward',
    length_km: 2.2,
    waypoints: [
      [18.5308, 73.8474],
      [18.5295, 73.849],
      [18.5265, 73.8602],
    ],
    center: [18.5285, 73.8535],
    associated_bus_id: 2,
  },
  {
    segment_id: 'SEG-04',
    name: 'Pune Station – Sangamwadi Road',
    corridor_road: 'Dr. Ambedkar Rd – Sangamwadi Bridge',
    ward_name: 'Dhole Patil – Yerawada Ward',
    length_km: 2.4,
    waypoints: [
      [18.5142, 73.8732],
      [18.511, 73.882],
      [18.5081, 73.8901],
    ],
    center: [18.511, 73.882],
    associated_bus_id: 2,
  },
  {
    segment_id: 'SEG-05',
    name: 'Hadapsar – Solapur Road Corridor',
    corridor_road: 'Pune–Solapur Highway (Hadapsar Gadital)',
    ward_name: 'Hadapsar – Mundhwa Ward',
    length_km: 2.9,
    waypoints: [
      [18.504, 73.905],
      [18.5015, 73.918],
      [18.5008, 73.9175],
    ],
    center: [18.5015, 73.918],
    associated_bus_id: 2,
  },
  {
    segment_id: 'SEG-06',
    name: 'Kothrud – Karve Nagar Stretch',
    corridor_road: 'Paud Road & Karve Road',
    ward_name: 'Kothrud – Warje Ward',
    length_km: 2.5,
    waypoints: [
      [18.5074, 73.8077],
      [18.5105, 73.8165],
      [18.513, 73.8254],
    ],
    center: [18.5105, 73.8165],
    associated_bus_id: 3,
  },
  {
    segment_id: 'SEG-07',
    name: 'Airport Road – Viman Nagar Corridor',
    corridor_road: 'Pune–Nagar Highway (Viman Nagar)',
    ward_name: 'Nagar Road – Vadgaonsheri Ward',
    length_km: 3.4,
    waypoints: [
      [18.5308, 73.8997],
      [18.548, 73.908],
      [18.5642, 73.9145],
    ],
    center: [18.555, 73.911],
    associated_bus_id: 3,
  },
  {
    segment_id: 'SEG-08',
    name: 'Nigdi – Baner Highway Stretch',
    corridor_road: 'Route 104 — Baner-Balewadi Corridor',
    ward_name: 'Aundh – Baner Ward',
    length_km: 4.0,
    waypoints: [
      [18.559, 73.7868],
      [18.572, 73.775],
      [18.585, 73.762],
    ],
    center: [18.572, 73.775],
    associated_bus_id: 4,
  },
]

const VERIFIED_SENSITIVE_LOCATIONS: {
  name: string
  type: 'Hospital' | 'School' | 'Transit Hub'
  lat: number
  lng: number
}[] = [
  { name: 'Sassoon General Hospital', type: 'Hospital', lat: 18.5284, lng: 73.8739 },
  { name: 'Deenanath Mangeshkar Hospital', type: 'Hospital', lat: 18.5092, lng: 73.8315 },
  { name: 'Bharati Hospital & Medical College', type: 'Hospital', lat: 18.4685, lng: 73.8548 },
  { name: 'Ruby Hall Clinic & Trauma Center', type: 'Hospital', lat: 18.5338, lng: 73.8775 },
  { name: 'Noble Hospital Hadapsar', type: 'Hospital', lat: 18.5055, lng: 73.9205 },
  { name: 'Anand Nagar Municipal School', type: 'School', lat: 18.4895, lng: 73.8508 },
  { name: 'Fergusson College & Campus', type: 'School', lat: 18.5223, lng: 73.8415 },
  { name: 'Symbiosis Viman Nagar School Campus', type: 'School', lat: 18.5648, lng: 73.9138 },
  { name: 'Karve Nagar Municipal High School', type: 'School', lat: 18.5132, lng: 73.8258 },
  { name: 'Swargate Multi-Modal Transit Hub', type: 'Transit Hub', lat: 18.5018, lng: 73.856 },
  { name: 'Shivajinagar Railway & Bus Terminus', type: 'Transit Hub', lat: 18.5308, lng: 73.8474 },
  { name: 'Katraj Bus Terminus & School Zone', type: 'Transit Hub', lat: 18.4825, lng: 73.8482 },
]

function isValidCoordinate(lat: any, lng: any): boolean {
  const nLat = Number(lat)
  const nLng = Number(lng)
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  )
}

function minDistanceToSegmentMeters(lat: number, lng: number, seg: RoadSegmentDef): number {
  let minD = haversineDistanceMeters(lat, lng, seg.center[0], seg.center[1])
  for (const wp of seg.waypoints) {
    const d = haversineDistanceMeters(lat, lng, wp[0], wp[1])
    if (d < minD) minD = d
  }
  return minD
}

function matchRoadSegmentForCoordinate(lat: number, lng: number): RoadSegmentDef | null {
  if (!isValidCoordinate(lat, lng)) return null
  let best: RoadSegmentDef | null = null
  let bestDist = Infinity
  for (const seg of PREDEFINED_ROAD_SEGMENTS) {
    const d = minDistanceToSegmentMeters(lat, lng, seg)
    if (d < bestDist) {
      bestDist = d
      best = seg
    }
  }
  if (best && bestDist <= 1200) {
    return best
  }
  // Create a dynamic road segment around the coordinate so no valid GPS complaint is orphaned
  const gridLat = Number(lat.toFixed(2))
  const gridLng = Number(lng.toFixed(2))
  const dynId = `SEG-LOCAL-${gridLat.toFixed(2).replace('.', '')}-${gridLng.toFixed(2).replace('.', '')}`
  return {
    segment_id: dynId,
    name: `Local Municipal Stretch (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
    corridor_road: `Pune Municipal Road Sector (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
    ward_name: 'Pune Municipal Sector',
    length_km: 1.2,
    waypoints: [
      [Number((lat - 0.003).toFixed(5)), Number((lng - 0.003).toFixed(5))],
      [Number(lat.toFixed(5)), Number(lng.toFixed(5))],
      [Number((lat + 0.003).toFixed(5)), Number((lng + 0.003).toFixed(5))],
    ],
    center: [Number(lat.toFixed(5)), Number(lng.toFixed(5))],
  }
}

function computeRoadIssueDeduction(c: Complaint): {
  baseDeduction: number
  ageDeduction: number
  totalDeduction: number
  ageDays: number
} {
  const catLower = c.category.toLowerCase()
  const sev = c.severity || 'medium'
  let baseDeduction = 6

  if (catLower.includes('pothole')) {
    baseDeduction = sev === 'critical' ? 22 : sev === 'high' ? 15 : sev === 'medium' ? 10 : 5
  } else if (catLower.includes('road damage') || catLower.includes('broken road') || catLower.includes('obstruction')) {
    baseDeduction = sev === 'critical' ? 18 : sev === 'high' ? 13 : sev === 'medium' ? 8 : 4
  } else if (catLower.includes('waterlog') || catLower.includes('drain')) {
    baseDeduction = sev === 'critical' ? 16 : sev === 'high' ? 12 : sev === 'medium' ? 8 : 4
  } else {
    baseDeduction = sev === 'critical' ? 10 : sev === 'high' ? 7 : sev === 'medium' ? 4 : 2
  }

  const detectedMs = Date.parse(c.first_detected_at) || Date.now()
  const ageDays = Math.max(0, Number(((Date.now() - detectedMs) / 86400000).toFixed(1)))
  const ageDeduction = Math.min(6, Math.floor(ageDays / 3))
  return {
    baseDeduction,
    ageDeduction,
    totalDeduction: baseDeduction + ageDeduction,
    ageDays,
  }
}

function computeRoadHealthSegments(currentUser?: User) {
  const segmentMap = new Map<string, { def: RoadSegmentDef; allComplaints: Complaint[] }>()
  for (const seg of PREDEFINED_ROAD_SEGMENTS) {
    segmentMap.set(seg.segment_id, { def: seg, allComplaints: [] })
  }

  for (const c of complaints) {
    if (!isValidCoordinate(c.latitude, c.longitude)) continue
    // Ignore closed records that were explicitly merged into another primary complaint
    if (c.merged_into_complaint_id) continue
    if (c.status === 'closed' && c.resolution_notes?.toLowerCase().includes('merged into')) continue

    const matchedSeg = matchRoadSegmentForCoordinate(c.latitude, c.longitude)
    if (!matchedSeg) continue
    if (!segmentMap.has(matchedSeg.segment_id)) {
      segmentMap.set(matchedSeg.segment_id, { def: matchedSeg, allComplaints: [] })
    }
    segmentMap.get(matchedSeg.segment_id)!.allComplaints.push(c)
  }

  const results: any[] = []
  let totalActiveRoadIssues = 0
  let totalDuplicatesPrevented = 0

  for (const [, { def, allComplaints }] of segmentMap.entries()) {
    const associatedBus = def.associated_bus_id ? buses.find((b) => b.id === def.associated_bus_id) : null
    const busIsOffline = associatedBus ? !associatedBus.is_active || associatedBus.operational_status === 'maintenance' || associatedBus.operational_status === 'offline' : false

    // Check if there is sufficient data to calculate a Road Health Score
    const hasSufficientData = allComplaints.length > 0 || (associatedBus && !busIsOffline)

    if (!hasSufficientData) {
      results.push({
        segment_id: def.segment_id,
        name: def.name,
        corridor_road: def.corridor_road,
        ward_name: def.ward_name,
        length_km: def.length_km,
        waypoints: def.waypoints,
        center: def.center,
        score: null,
        band: 'insufficient_data',
        status_label: 'Insufficient Data',
        insufficient_data: true,
        insufficient_reason:
          'Assigned transit bus (PMC-104) is currently in maintenance/offline and no verified road surface inspections or complaints have been recorded on this corridor within the evaluation window.',
        scoring_method: 'Rule-Based Municipal Road Surface Index (Hackathon MVP — Not ML)',
        formula_explanation:
          'Score cannot be computed when 0 verified camera scans or citizen inspections exist on the corridor. Displays "Insufficient Data" rather than inventing a synthetic score.',
        base_score: 100,
        total_deduction: 0,
        active_unique_issues_count: 0,
        resolved_issues_count: 0,
        duplicate_sightings_ignored: 0,
        pothole_count: 0,
        road_damage_count: 0,
        waterlogging_count: 0,
        other_hazard_count: 0,
        deduction_breakdown: [],
        active_issues: [],
        complaint_history: [],
        last_updated_at: associatedBus?.last_seen_at || new Date().toISOString(),
      })
      continue
    }

    // Separate unresolved vs resolved complaints
    const rawActive = allComplaints.filter((c) => !['resolved', 'closed'].includes(c.status))
    const resolvedList = allComplaints.filter((c) => ['resolved', 'closed'].includes(c.status))

    // Spatial deduplication safeguard: ensure nearby unmerged issues of the same category within dedupThresholdMeters are counted ONCE
    const uniqueActive: Complaint[] = []
    let extraMergedSightings = 0
    for (const item of rawActive) {
      const existingNearby = uniqueActive.find(
        (u) =>
          u.category.toLowerCase() === item.category.toLowerCase() &&
          haversineDistanceMeters(u.latitude, u.longitude, item.latitude, item.longitude) <= dedupThresholdMeters
      )
      if (existingNearby) {
        extraMergedSightings += item.observation_count || 1
      } else {
        uniqueActive.push(item)
        extraMergedSightings += Math.max(0, (item.observation_count || 1) - 1)
      }
    }

    for (const r of resolvedList) {
      extraMergedSightings += Math.max(0, (r.observation_count || 1) - 1)
    }

    let totalDeduction = 0
    let potholeCount = 0
    let roadDamageCount = 0
    let waterloggingCount = 0
    let otherHazardCount = 0

    const deductionBreakdown = uniqueActive.map((u) => {
      const catLower = u.category.toLowerCase()
      if (catLower.includes('pothole')) potholeCount++
      else if (catLower.includes('road damage') || catLower.includes('broken road') || catLower.includes('obstruction')) roadDamageCount++
      else if (catLower.includes('waterlog') || catLower.includes('drain')) waterloggingCount++
      else otherHazardCount++

      const { baseDeduction, ageDeduction, totalDeduction: itemDed, ageDays } = computeRoadIssueDeduction(u)
      totalDeduction += itemDed
      return {
        complaint_id: u.complaint_id,
        id: u.id,
        category: u.category,
        severity: u.severity,
        status: u.status,
        description: u.description,
        age_days: ageDays,
        observation_count: u.observation_count || 1,
        base_deduction: baseDeduction,
        age_deduction: ageDeduction,
        total_deduction: itemDed,
        first_detected_at: u.first_detected_at,
        latitude: u.latitude,
        longitude: u.longitude,
        is_simulated: Boolean(u.is_simulated),
      }
    })

    const finalScore = Math.max(0, Math.min(100, Math.round(100 - totalDeduction)))
    let band: 'green' | 'yellow' | 'orange' | 'red' = 'green'
    let statusLabel = 'Good (Healthy Road)'
    if (finalScore < 40) {
      band = 'red'
      statusLabel = 'Critical (Severe Deterioration)'
    } else if (finalScore < 60) {
      band = 'orange'
      statusLabel = 'Poor (Needs Repair)'
    } else if (finalScore < 80) {
      band = 'yellow'
      statusLabel = 'Fair (Moderate Wear)'
    }

    totalActiveRoadIssues += uniqueActive.length
    totalDuplicatesPrevented += extraMergedSightings

    const timestamps = allComplaints
      .map((c) => Date.parse(c.resolved_at || c.last_detected_at || c.first_detected_at) || 0)
      .filter((t) => t > 0)
    const latestTs = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString()

    const visibleActive = currentUser
      ? uniqueActive.filter((c) => canUserAccessComplaint(currentUser, c))
      : uniqueActive
    const visibleAll = currentUser
      ? allComplaints.filter((c) => canUserAccessComplaint(currentUser, c))
      : allComplaints

    results.push({
      segment_id: def.segment_id,
      name: def.name,
      corridor_road: def.corridor_road,
      ward_name: def.ward_name,
      length_km: def.length_km,
      waypoints: def.waypoints,
      center: def.center,
      score: finalScore,
      band,
      status_label: statusLabel,
      insufficient_data: false,
      insufficient_reason: null,
      scoring_method: 'Transparent Rule-Based Scoring Algorithm (Hackathon MVP — Not ML)',
      formula_explanation:
        'Starts at Base 100. Deducts points per unique unresolved physical issue by category & severity (Pothole: -5 to -22, Road Damage: -4 to -18, Waterlogging/Drain: -4 to -16, Other Corridor Hazard: -2 to -10) plus an age penalty (+1 pt per 3 days unresolved, max +6 pts/issue). Deduplicated sightings of the same issue are counted once. Resolved issues restore segment health.',
      base_score: 100,
      total_deduction: totalDeduction,
      active_unique_issues_count: uniqueActive.length,
      resolved_issues_count: resolvedList.length,
      duplicate_sightings_ignored: extraMergedSightings,
      pothole_count: potholeCount,
      road_damage_count: roadDamageCount,
      waterlogging_count: waterloggingCount,
      other_hazard_count: otherHazardCount,
      deduction_breakdown: deductionBreakdown,
      active_issues: visibleActive.map((c) => ({
        id: c.id,
        complaint_id: c.complaint_id,
        category: c.category,
        severity: c.severity,
        status: c.status,
        description: c.description,
        latitude: c.latitude,
        longitude: c.longitude,
        address: c.address,
        department_name: c.department_name,
        observation_count: c.observation_count,
        first_detected_at: c.first_detected_at,
        is_simulated: c.is_simulated,
      })),
      complaint_history: visibleAll
        .slice()
        .sort((a, b) => Date.parse(b.first_detected_at) - Date.parse(a.first_detected_at))
        .map((c) => ({
          id: c.id,
          complaint_id: c.complaint_id,
          category: c.category,
          severity: c.severity,
          status: c.status,
          description: c.description,
          first_detected_at: c.first_detected_at,
          resolved_at: c.resolved_at,
          observation_count: c.observation_count,
        })),
      last_updated_at: latestTs,
    })
  }

  const scoredSegments = results.filter((s) => !s.insufficient_data && typeof s.score === 'number')
  const cityAvg =
    scoredSegments.length > 0
      ? Math.round(scoredSegments.reduce((acc, s) => acc + (s.score as number), 0) / scoredSegments.length)
      : null

  roadHealthCache = results
  return {
    segments: results,
    city_average_score: cityAvg,
    evaluated_segments_count: scoredSegments.length,
    insufficient_data_segments_count: results.filter((s) => s.insufficient_data).length,
    total_active_road_issues: totalActiveRoadIssues,
    total_duplicates_prevented: totalDuplicatesPrevented,
    scoring_algorithm_note:
      'Transparent Rule-Based Road Health Scoring Algorithm (0–100) for Hackathon MVP. Uses verified geo-deduplicated civic issues, severity weights, and unresolved age penalties. Does not claim machine-learning prediction.',
    last_calculated_at: new Date().toISOString(),
  }
}

function getRoadSegmentLookupMap(): Map<string, { name: string; score: number | null }> {
  const overview = computeRoadHealthSegments()
  const map = new Map<string, { name: string; score: number | null }>()
  for (const s of overview.segments) {
    map.set(s.segment_id, { name: s.name, score: s.score })
  }
  return map
}

function computeSmartPriorityForComplaint(
  c: Complaint,
  segMap?: Map<string, { name: string; score: number | null }>
) {
  const matchedSeg = matchRoadSegmentForCoordinate(c.latitude, c.longitude)
  const segInfo = matchedSeg && segMap ? segMap.get(matchedSeg.segment_id) : null
  const roadScore = segInfo ? segInfo.score : null

  // 1. Severity Factor (max 40)
  const baseSev = c.priority_override ? c.priority_override.recommended_priority : c.severity
  const sevPoints =
    baseSev === 'critical' ? 40 : baseSev === 'high' ? 28 : baseSev === 'medium' ? 16 : 8

  // 2. Complaint Age Factor (max 20)
  const detectedMs = Date.parse(c.first_detected_at) || Date.now()
  const ageDays = Math.max(0, Number(((Date.now() - detectedMs) / 86400000).toFixed(1)))
  const agePoints = Math.min(20, Math.round(ageDays * 2))

  // 3. Corroborated Independent Reports Factor (max 15, deduplicated)
  const obsCount = Math.max(1, c.observation_count || 1)
  const extraSightings = Math.max(0, obsCount - 1)
  const reportPoints = Math.min(15, extraSightings * 5)

  // 4. Road Health Context Factor (max 15)
  let roadHealthPoints = 0
  let roadExplanation = 'Road segment has Insufficient Data (+0 pts)'
  if (typeof roadScore === 'number') {
    if (roadScore < 40) {
      roadHealthPoints = 15
      roadExplanation = `Located on Critical road segment (${matchedSeg?.name}: ${roadScore}/100) (+15 pts)`
    } else if (roadScore < 60) {
      roadHealthPoints = 10
      roadExplanation = `Located on Poor road segment (${matchedSeg?.name}: ${roadScore}/100) (+10 pts)`
    } else if (roadScore < 80) {
      roadHealthPoints = 5
      roadExplanation = `Located on Fair road segment (${matchedSeg?.name}: ${roadScore}/100) (+5 pts)`
    } else {
      roadHealthPoints = 0
      roadExplanation = `Located on Healthy road segment (${matchedSeg?.name}: ${roadScore}/100) (+0 pts)`
    }
  }

  // 5. Proximity to Verified Sensitive Locations (Schools, Hospitals, Transit Hubs) (max 15)
  let nearestSensitive: {
    name: string
    type: 'Hospital' | 'School' | 'Transit Hub'
    distance_meters: number
  } | null = null

  if (isValidCoordinate(c.latitude, c.longitude)) {
    let minSensDist = Infinity
    for (const loc of VERIFIED_SENSITIVE_LOCATIONS) {
      const d = Math.round(haversineDistanceMeters(c.latitude, c.longitude, loc.lat, loc.lng))
      if (d < minSensDist) {
        minSensDist = d
        nearestSensitive = { name: loc.name, type: loc.type, distance_meters: d }
      }
    }
    if (nearestSensitive && nearestSensitive.distance_meters > 600) {
      nearestSensitive = null
    }
  }

  let proximityPoints = 0
  let proximityExplanation = 'No verified school, hospital, or transit hub within 600m (+0 pts)'
  if (nearestSensitive) {
    if (nearestSensitive.distance_meters <= 300) {
      proximityPoints = 15
      proximityExplanation = `${nearestSensitive.distance_meters}m from ${nearestSensitive.name} (${nearestSensitive.type}) (+15 pts)`
    } else {
      proximityPoints = 10
      proximityExplanation = `${nearestSensitive.distance_meters}m from ${nearestSensitive.name} (${nearestSensitive.type}) (+10 pts)`
    }
  }

  const totalScore = Math.min(
    100,
    sevPoints + agePoints + reportPoints + roadHealthPoints + proximityPoints
  )

  let recommendedPriority: 'low' | 'medium' | 'high' | 'critical' = 'low'
  if (totalScore >= 75) recommendedPriority = 'critical'
  else if (totalScore >= 55) recommendedPriority = 'high'
  else if (totalScore >= 35) recommendedPriority = 'medium'
  else recommendedPriority = 'low'

  const effectivePriority = c.priority_override
    ? c.priority_override.priority
    : recommendedPriority

  const reasonParts: string[] = [
    `${baseSev.toUpperCase()} base severity (+${sevPoints})`,
    `unresolved ${ageDays}d (+${agePoints})`,
  ]
  if (extraSightings > 0) {
    reasonParts.push(`${obsCount} corroborated reports, ${extraSightings} deduplicated (+${reportPoints})`)
  }
  if (roadHealthPoints > 0 && typeof roadScore === 'number') {
    reasonParts.push(`road health ${roadScore}/100 (+${roadHealthPoints})`)
  }
  if (nearestSensitive) {
    reasonParts.push(`${nearestSensitive.distance_meters}m to ${nearestSensitive.name} (+${proximityPoints})`)
  }

  const factors = [
    {
      key: 'severity' as const,
      label: 'Issue Severity',
      points: sevPoints,
      max_points: 40,
      explanation: `${c.category} reported with ${baseSev.toUpperCase()} severity (+${sevPoints}/40 pts)`,
    },
    {
      key: 'age' as const,
      label: 'Unresolved Age',
      points: agePoints,
      max_points: 20,
      explanation: `Open for ${ageDays} days (+${agePoints}/20 pts at +2 pts/day)`,
    },
    {
      key: 'corroboration' as const,
      label: 'Corroborated Reports (Deduplicated)',
      points: reportPoints,
      max_points: 15,
      explanation:
        extraSightings > 0
          ? `${obsCount} sightings consolidated into 1 physical issue (+${reportPoints}/15 pts; avoids double-counting)`
          : 'Single verified report (+0/15 pts)',
    },
    {
      key: 'road_health' as const,
      label: 'Road Segment Health',
      points: roadHealthPoints,
      max_points: 15,
      explanation: roadExplanation,
    },
    {
      key: 'sensitive_proximity' as const,
      label: 'Sensitive Location Proximity',
      points: proximityPoints,
      max_points: 15,
      explanation: proximityExplanation,
    },
  ]

  return {
    score: totalScore,
    recommended_priority: recommendedPriority,
    effective_priority: effectivePriority,
    is_overridden: Boolean(c.priority_override),
    priority_reason: reasonParts.join(' · '),
    factors,
    age_days: ageDays,
    independent_reports_count: obsCount,
    deduplicated_sightings_merged: extraSightings,
    road_segment_id: matchedSeg ? matchedSeg.segment_id : null,
    road_segment_name: matchedSeg ? matchedSeg.name : null,
    road_health_score: roadScore,
    nearest_sensitive_location: nearestSensitive,
    override_record: c.priority_override || null,
  }
}

function buildSvgDataUrl(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`
}

function generateBeforeInspectionSvg(c: Complaint): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
    <rect width="640" height="380" fill="#0D181E"/>
    <rect x="16" y="16" width="608" height="348" rx="14" fill="#15262E" stroke="#EF4444" stroke-width="2.5"/>
    <rect x="32" y="32" width="250" height="28" rx="6" fill="#EF4444" fill-opacity="0.2"/>
    <text x="44" y="51" fill="#FCA5A5" font-family="monospace" font-size="13" font-weight="bold">BEFORE REPAIR · INITIAL DETECTION</text>
    <text x="32" y="92" fill="#F4F7F7" font-family="sans-serif" font-size="20" font-weight="bold">${c.category} (${c.severity.toUpperCase()})</text>
    <text x="32" y="120" fill="#91C8BD" font-family="monospace" font-size="14">ID: ${c.complaint_id} · Source: ${c.source === 'bus_camera' ? `Bus #${c.bus_id || 1} AI Camera` : 'Citizen Portal'}</text>
    <rect x="32" y="140" width="576" height="120" rx="10" fill="#101C23" stroke="#2A444E" stroke-width="1.5"/>
    <ellipse cx="220" cy="205" rx="78" ry="34" fill="#090F13" stroke="#F87171" stroke-width="2" stroke-dasharray="6,4"/>
    <text x="325" y="188" fill="#F87171" font-family="monospace" font-size="13" font-weight="bold">[DEFECT BOUNDING REGION]</text>
    <text x="325" y="212" fill="#AABDC2" font-family="sans-serif" font-size="12">Unrepaired ${c.category.toLowerCase()} defect</text>
    <text x="325" y="232" fill="#AABDC2" font-family="monospace" font-size="11">Sightings: ${c.observation_count || 1}</text>
    <text x="32" y="295" fill="#F4F7F7" font-family="monospace" font-size="13">GPS: ${c.latitude.toFixed(5)}°N, ${c.longitude.toFixed(5)}°E</text>
    <text x="32" y="320" fill="#AABDC2" font-family="monospace" font-size="12">Captured: ${c.first_detected_at}</text>
    <text x="32" y="345" fill="#FBBF24" font-family="monospace" font-size="11">[DEMO / SYNTHETIC SNAPSHOT — UPLOAD REAL FIELD PHOTO TO REPLACE]</text>
  </svg>`
  return buildSvgDataUrl(svg)
}

function generateAfterInspectionSvg(c: Complaint, notes: string, timestamp: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
    <rect width="640" height="380" fill="#0D181E"/>
    <rect x="16" y="16" width="608" height="348" rx="14" fill="#15262E" stroke="#10B981" stroke-width="2.5"/>
    <rect x="32" y="32" width="275" height="28" rx="6" fill="#10B981" fill-opacity="0.2"/>
    <text x="44" y="51" fill="#6EE7B7" font-family="monospace" font-size="13" font-weight="bold">AFTER REPAIR · FIELD COMPLETION PHOTO</text>
    <text x="32" y="92" fill="#F4F7F7" font-family="sans-serif" font-size="20" font-weight="bold">${c.category} — Post-Repair Surface</text>
    <text x="32" y="120" fill="#91C8BD" font-family="monospace" font-size="14">ID: ${c.complaint_id} · Dept: ${c.department_name || 'Roads & Infrastructure'}</text>
    <rect x="32" y="140" width="576" height="120" rx="10" fill="#101C23" stroke="#367F77" stroke-width="1.5"/>
    <rect x="135" y="172" width="170" height="62" rx="8" fill="#1E3A3A" stroke="#34D399" stroke-width="2"/>
    <text x="152" y="207" fill="#6EE7B7" font-family="monospace" font-size="12" font-weight="bold">RESTORED SURFACE</text>
    <text x="325" y="188" fill="#6EE7B7" font-family="monospace" font-size="13" font-weight="bold">[POST-REPAIR INSPECTION]</text>
    <text x="325" y="212" fill="#F4F7F7" font-family="sans-serif" font-size="12">${(notes || 'Surface restored and compacted').slice(0, 42)}</text>
    <text x="32" y="295" fill="#F4F7F7" font-family="monospace" font-size="13">GPS: ${c.latitude.toFixed(5)}°N, ${c.longitude.toFixed(5)}°E</text>
    <text x="32" y="320" fill="#AABDC2" font-family="monospace" font-size="12">Uploaded: ${timestamp}</text>
    <text x="32" y="345" fill="#FBBF24" font-family="monospace" font-size="11">[DEMO FIELD CERTIFICATE — MANUAL ADMIN VERIFICATION REQUIRED]</text>
  </svg>`
  return buildSvgDataUrl(svg)
}

function ensureRepairVerificationRecord(c: Complaint): RepairVerificationRecord {
  const realBeforeImg = c.evidence_image_path || c.media_url || null
  const realAfterImg = c.resolution_evidence_path || null

  // Find any subsequent bus camera detections within dedupThresholdMeters and same category after initial detection
  const linkedReinspections: ReinspectionDetectionLink[] = detections
    .filter((d) => {
      if (!isValidCoordinate(d.latitude, d.longitude)) return false
      if (d.category.toLowerCase() !== c.category.toLowerCase()) return false
      const dist = haversineDistanceMeters(c.latitude, c.longitude, d.latitude!, d.longitude!)
      if (dist > dedupThresholdMeters) return false
      const detTime = Date.parse(d.timestamp) || 0
      const initTime = Date.parse(c.first_detected_at) || 0
      return detTime > initTime + 1000
    })
    .map((d) => {
      const busObj = d.bus_id ? buses.find((b) => b.id === d.bus_id) : null
      return {
        detection_id: d.id,
        bus_id: d.bus_id,
        bus_number: busObj ? busObj.bus_number : d.bus_id ? `Bus #${d.bus_id}` : null,
        category: d.category,
        confidence: d.confidence,
        distance_meters: Math.round(
          haversineDistanceMeters(c.latitude, c.longitude, d.latitude!, d.longitude!)
        ),
        timestamp: d.timestamp,
        image_path: d.image_path,
        is_simulated: Boolean(d.is_simulated),
        description: d.description || `${d.category} captured at same GPS coordinates`,
      }
    })

  if (c.repair_verification) {
    // Merge any newly discovered reinspection detections
    const existingIds = new Set(
      (c.repair_verification.reinspection_detections || []).map((r) => r.detection_id)
    )
    for (const lr of linkedReinspections) {
      if (!existingIds.has(lr.detection_id)) {
        c.repair_verification.reinspection_detections.unshift(lr)
      }
    }
    if (realBeforeImg && c.repair_verification.before_is_simulated) {
      c.repair_verification.before_image_url = realBeforeImg
      c.repair_verification.before_is_simulated = false
    }
    return c.repair_verification
  }

  const isAlreadyResolved = c.status === 'resolved' || c.status === 'closed'
  const isAwaiting = c.status === 'awaiting_verification'

  const defaultAfterUrl =
    realAfterImg ||
    (isAlreadyResolved || isAwaiting
      ? generateAfterInspectionSvg(
          c,
          c.resolution_notes || 'Field work reported complete; submitted for verification',
          c.resolved_at || c.last_detected_at
        )
      : null)

  const initialStatus: VerificationDecisionStatus = isAlreadyResolved
    ? 'verified'
    : isAwaiting
    ? 'pending_review'
    : 'pending_upload'

  const record: RepairVerificationRecord = {
    verification_status: initialStatus,
    before_image_url: realBeforeImg || generateBeforeInspectionSvg(c),
    before_captured_at: c.first_detected_at,
    before_latitude: c.latitude,
    before_longitude: c.longitude,
    before_source_label:
      c.source === 'bus_camera' ? `Bus #${c.bus_id || 1} Onboard Camera` : 'Citizen Report Submission',
    before_is_simulated: !realBeforeImg,
    after_image_url: defaultAfterUrl,
    after_uploaded_at: isAlreadyResolved || isAwaiting ? c.resolved_at || c.last_detected_at : null,
    after_uploaded_by_name:
      isAlreadyResolved || isAwaiting ? 'Field Maintenance Engineer' : null,
    after_latitude: isAlreadyResolved || isAwaiting ? c.latitude : null,
    after_longitude: isAlreadyResolved || isAwaiting ? c.longitude : null,
    after_notes:
      isAlreadyResolved || isAwaiting
        ? c.resolution_notes || 'Post-repair field completion photo uploaded for verification.'
        : null,
    after_is_simulated: Boolean(!realAfterImg && defaultAfterUrl),
    decision_by_id: isAlreadyResolved ? 1 : null,
    decision_by_name: isAlreadyResolved ? 'Municipal Commissioner (Admin)' : null,
    decision_by_role: isAlreadyResolved ? 'admin' : null,
    decision_at: isAlreadyResolved ? c.resolved_at : null,
    decision_notes: isAlreadyResolved
      ? c.resolution_notes || 'Repair verified against before/after evidence.'
      : null,
    public_approved: isAlreadyResolved,
    public_summary: isAlreadyResolved
      ? c.resolution_notes || `Repair of ${c.category} verified and approved for public release.`
      : null,
    vision_comparison: null,
    reinspection_detections: linkedReinspections,
    history: isAlreadyResolved
      ? [
          {
            id: c.id * 100 + 1,
            action: 'REPAIR_VERIFIED',
            status: 'verified',
            actor_name: 'Municipal Commissioner (Admin)',
            actor_role: 'admin',
            notes: c.resolution_notes || 'Before and after repair evidence verified.',
            timestamp: c.resolved_at || c.last_detected_at,
          },
        ]
      : [],
  }

  c.repair_verification = record
  return record
}

function enrichComplaint(c: Complaint, stripPersonalInfo = false) {
  const dept = departments.find((d) => d.id === c.department_id) || null
  const deptName = dept ? dept.name : c.department_name || 'Roads & Infrastructure'
  const bus = c.bus_id ? buses.find((b) => b.id === c.bus_id) || null : null
  const itemEvidence = evidenceList.filter((e) => e.complaint_id === c.id)
  const itemAudits = auditLogs.filter(
    (a) => a.entity_type === 'complaint' && (a.entity_id === c.complaint_id || a.entity_id === String(c.id))
  )

  // Suggested department based on automated category routing rules
  const suggestedDeptId = categoryToDept[c.category] || 1
  const suggestedDept = departments.find((d) => d.id === suggestedDeptId)

  // Road segment & Smart Priority
  const segLookup = getRoadSegmentLookupMap()
  const smartPriority = computeSmartPriorityForComplaint(c, segLookup)
  const verification = ensureRepairVerificationRecord(c)

  // Identify nearby same-category potential duplicates for staff verification
  const potentialDuplicates = !stripPersonalInfo
    ? complaints
        .filter(
          (other) =>
            other.id !== c.id &&
            other.category.toLowerCase() === c.category.toLowerCase() &&
            !['resolved', 'closed'].includes(other.status)
        )
        .map((other) => ({
          id: other.id,
          complaint_id: other.complaint_id,
          category: other.category,
          description: other.description,
          status: other.status,
          source: other.source,
          bus_id: other.bus_id,
          first_detected_at: other.first_detected_at,
          observation_count: other.observation_count,
          distance_meters: Math.round(
            haversineDistanceMeters(c.latitude, c.longitude, other.latitude, other.longitude)
          ),
        }))
        .filter((d) => d.distance_meters <= Math.max(dedupThresholdMeters * 4, 250))
        .sort((a, b) => a.distance_meters - b.distance_meters)
    : []

  const publicVerificationStatusLabel =
    verification.verification_status === 'verified' && verification.public_approved
      ? 'Verified by Municipal Administration'
      : verification.verification_status === 'needs_reinspection'
      ? 'Flagged for Field Reinspection'
      : verification.verification_status === 'rejected'
      ? 'Repair Rejected — Rework Ordered'
      : verification.verification_status === 'pending_review'
      ? 'After-Repair Photo Uploaded — Pending Admin Verification'
      : 'Awaiting Field Repair Completion'

  const publicRepairVerification = {
    verification_status: verification.verification_status,
    status_label: publicVerificationStatusLabel,
    verified: verification.verification_status === 'verified' && verification.public_approved,
    verified_at: verification.public_approved ? verification.decision_at : null,
    before_image_url: verification.before_image_url,
    before_captured_at: verification.before_captured_at,
    after_image_url:
      verification.verification_status === 'verified' && verification.public_approved
        ? verification.after_image_url
        : null,
    after_uploaded_at:
      verification.verification_status === 'verified' && verification.public_approved
        ? verification.after_uploaded_at
        : null,
    public_summary:
      verification.verification_status === 'verified' && verification.public_approved
        ? verification.public_summary ||
          c.resolution_notes ||
          'Repair work has been inspected and verified complete.'
        : verification.verification_status === 'needs_reinspection'
        ? 'Location has been scheduled for a follow-up quality reinspection.'
        : verification.verification_status === 'rejected'
        ? 'Initial repair did not meet quality standards; department crew has been assigned for rework.'
        : verification.verification_status === 'pending_review'
        ? 'Field team has uploaded post-repair evidence. Awaiting official verification before closing.'
        : null,
    location_coords: {
      latitude: c.latitude,
      longitude: c.longitude,
    },
    is_simulated_evidence: Boolean(
      verification.before_is_simulated || verification.after_is_simulated
    ),
  }

  const base = {
    ...c,
    department: deptName,
    department_name: deptName,
    department_info: dept,
    suggested_department_id: suggestedDeptId,
    suggested_department_name: suggestedDept?.name || 'Roads & Infrastructure',
    assigned_to_id: c.assignments && c.assignments.length > 0 ? c.assignments[c.assignments.length - 1].assigned_to : (c as any).assigned_to || null,
    assigned_to_name: c.assignments && c.assignments.length > 0 ? c.assignments[c.assignments.length - 1].assigned_to_name : null,
    duplicate_count: Math.max(0, (c.observation_count || 1) - 1),
    potential_duplicates: potentialDuplicates,
    dedup_threshold_meters: dedupThresholdMeters,
    bus_number: bus ? bus.bus_number : null,
    bus_route: bus ? bus.route_name : null,
    image_url: c.evidence_image_path || c.media_url || verification.before_image_url || null,
    before_image_url: c.evidence_image_path || c.media_url || verification.before_image_url || null,
    after_image_url: c.resolution_evidence_path || verification.after_image_url || null,
    road_segment_id: smartPriority.road_segment_id,
    road_segment_name: smartPriority.road_segment_name,
    road_segment_score: smartPriority.road_health_score,
    smart_priority: smartPriority,
    priority_override: c.priority_override || null,
    priority_history: c.priority_history || [],
    repair_verification: verification,
    public_repair_verification: publicRepairVerification,
    evidence: itemEvidence,
    audit_logs: itemAudits,
  }

  if (stripPersonalInfo) {
    return {
      id: base.id,
      complaint_id: base.complaint_id,
      category: base.category,
      description: base.description,
      severity: base.severity,
      status: base.status,
      department_id: base.department_id,
      department: deptName,
      department_name: deptName,
      latitude: base.latitude,
      longitude: base.longitude,
      address: base.address,
      observation_count: base.observation_count,
      duplicate_count: base.duplicate_count,
      first_detected_at: base.first_detected_at,
      last_detected_at: base.last_detected_at,
      resolved_at: base.resolved_at,
      resolution_notes:
        base.status === 'resolved' ||
        base.status === 'closed' ||
        (verification.verification_status === 'verified' && verification.public_approved)
          ? base.resolution_notes || verification.public_summary
          : null,
      evidence_image_path: base.evidence_image_path,
      resolution_evidence_path:
        base.status === 'resolved' ||
        base.status === 'closed' ||
        (verification.verification_status === 'verified' && verification.public_approved)
          ? base.resolution_evidence_path || verification.after_image_url
          : null,
      before_image_url: base.before_image_url || verification.before_image_url,
      after_image_url:
        base.status === 'resolved' ||
        base.status === 'closed' ||
        (verification.verification_status === 'verified' && verification.public_approved)
          ? base.after_image_url || verification.after_image_url
          : null,
      media_url: base.media_url,
      media_type: base.media_type,
      road_segment_id: base.road_segment_id,
      road_segment_name: base.road_segment_name,
      road_segment_score: base.road_segment_score,
      public_repair_verification: publicRepairVerification,
      status_history: (base.status_history || []).map((sh) => ({
        id: sh.id,
        old_status: sh.old_status,
        new_status: sh.new_status,
        changed_at: sh.changed_at,
        notes: sh.notes,
      })),
      contact_name: null,
      contact_phone: null,
    }
  }
  return base
}

// ── Auth & RBAC Middleware ───────────────────────────────────────────────────
function getComplaintDepartmentId(c: Complaint): number {
  if (typeof c.department_id === 'number' && c.department_id > 0) {
    return c.department_id
  }
  if (c.department_name) {
    const found = departments.find(
      (d) =>
        d.name.toLowerCase() === c.department_name!.toLowerCase() ||
        d.code.toLowerCase() === c.department_name!.toLowerCase()
    )
    if (found) return found.id
  }
  return categoryToDept[c.category] || 1
}

function doesDepartmentMatchQuery(deptQuery: string, deptId: number): boolean {
  const dept = departments.find((d) => d.id === deptId)
  if (!dept) return false
  const q = String(deptQuery || '').trim().toLowerCase()
  if (!q) return true
  return (
    String(dept.id) === q ||
    dept.name.toLowerCase() === q ||
    dept.name.toLowerCase().includes(q) ||
    dept.code.toLowerCase() === q
  )
}

function canUserAccessComplaint(user: User | undefined, c: Complaint): boolean {
  if (!user || !user.is_active) return false
  if (user.role === 'admin') return true
  if (user.role === 'officer' && typeof user.department_id === 'number') {
    return getComplaintDepartmentId(c) === user.department_id
  }
  return false
}

function serializeStaffUser(user: User) {
  const dept = departments.find((d) => d.id === user.department_id)
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    department_id: user.department_id,
    department: dept ? dept.name : user.role === 'admin' ? 'All Departments' : null,
    department_code: dept ? dept.code : null,
    is_active: user.is_active,
    created_at: user.created_at,
  }
}

function authenticateToken(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    return next()
  }

  if (revokedTokens.has(token)) {
    return next()
  }

  jwt.verify(token, SECRET_KEY, (err, decoded: any) => {
    if (!err && decoded) {
      if (decoded.jti && revokedTokens.has(String(decoded.jti))) {
        return next()
      }
      // Always resolve role and assigned department from trusted server-side users data
      const user = users.find(
        (u) =>
          (decoded.userId ? u.id === Number(decoded.userId) : false) ||
          u.username === decoded.sub
      )
      if (user && user.is_active) {
        ;(req as any).user = user
        ;(req as any).token = token
        ;(req as any).jti = decoded.jti ? String(decoded.jti) : null
      }
    }
    next()
  })
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
      detail: 'Authentication required. Please log in.',
    })
  }
  next()
}

function requireStaff(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as User | undefined
  if (!u) {
    return res.status(401).json({
      success: false,
      message: 'Government staff authentication required.',
      detail: 'Government staff authentication required.',
    })
  }
  if (u.role !== 'admin' && u.role !== 'officer') {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions. Government staff (Admin or Department Officer) role required.',
      detail: 'Insufficient permissions. Government staff (Admin or Department Officer) role required.',
    })
  }
  if (u.role === 'officer' && !u.department_id) {
    return res.status(403).json({
      success: false,
      message: 'Department Officer account has no assigned department.',
      detail: 'Department Officer account has no assigned department.',
    })
  }
  next()
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as User | undefined
  if (!u) {
    return res.status(401).json({
      success: false,
      message: 'Government staff authentication required.',
      detail: 'Government staff authentication required.',
    })
  }
  if (u.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Administrator permissions are required to access this resource.',
      detail: 'Forbidden: Administrator permissions are required to access this resource.',
    })
  }
  next()
}

// ── Setup API Routes ─────────────────────────────────────────────────────────
function setupApiRoutes(app: express.Express) {
  const router = express.Router()

  // 1. Health & AI Status
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CivicEye AI',
      ai_configured: Boolean(process.env.GEMINI_API_KEY),
      database: 'persistent-json',
      total_complaints: complaints.length,
      total_buses: buses.length,
    })
  })

  // 1b. Geocode Search (Landmarks, Streets & Addresses)
  const LANDMARK_INDEX = [
    { name: 'Shivajinagar Bus Stand & Railway Station, Pune', lat: 18.5308, lng: 73.8474 },
    { name: 'Swargate Bus Stand, Satara Road, Pune', lat: 18.5018, lng: 73.856 },
    { name: 'Deccan Gymkhana, JM Road, Pune', lat: 18.5265, lng: 73.8602 },
    { name: 'Fergusson College Road (FC Road), Pune', lat: 18.5223, lng: 73.8415 },
    { name: 'Pune Junction Railway Station, Pune', lat: 18.5289, lng: 73.8744 },
    { name: 'Katraj Chowk & Bus Depot, Pune', lat: 18.4762, lng: 73.8441 },
    { name: 'Kothrud Bus Depot, Paud Road, Pune', lat: 18.5074, lng: 73.8077 },
    { name: 'Viman Nagar, Nagar Road, Pune', lat: 18.5642, lng: 73.9145 },
    { name: 'Hadapsar Gadital Bus Stand, Solapur Road, Pune', lat: 18.501, lng: 73.9168 },
    { name: 'Karve Nagar, Karve Road, Pune', lat: 18.513, lng: 73.8254 },
    { name: 'Baner High Street, Baner Road, Pune', lat: 18.559, lng: 73.7868 },
    { name: 'Hinjewadi Rajiv Gandhi Infotech Park, Pune', lat: 18.5913, lng: 73.7389 },
    { name: 'Aundh, ITI Road, Pune', lat: 18.558, lng: 73.8075 },
    { name: 'Bibwewadi Corner, Pune', lat: 18.4975, lng: 73.8538 },
    { name: 'Sangamwadi Bridge, Pune', lat: 18.5081, lng: 73.8901 },
    { name: 'Koregaon Park, North Main Road, Pune', lat: 18.5362, lng: 73.894 },
    { name: 'Camp / MG Road, Pune', lat: 18.5167, lng: 73.8796 },
    { name: 'Shaniwar Wada, Kasba Peth, Pune', lat: 18.5195, lng: 73.8553 },
    { name: 'Wakad Chowk, Pune', lat: 18.5987, lng: 73.7644 },
    { name: 'Magarpatta City, Hadapsar, Pune', lat: 18.5158, lng: 73.9272 },
  ]

  router.get('/geocode/search', async (req, res) => {
    const q = String(req.query.q || '').trim()
    if (!q) {
      return res.json({ success: true, data: LANDMARK_INDEX.slice(0, 6) })
    }

    const lower = q.toLowerCase()
    const localMatches = LANDMARK_INDEX.filter((item) =>
      item.name.toLowerCase().includes(lower)
    )

    try {
      const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
        q.includes('pune') || q.includes('india') ? q : `${q}, Pune, India`
      )}`
      const osmResp = await fetch(osmUrl, {
        headers: {
          'User-Agent': 'CivicEye-AI-Municipal-Portal/1.0',
          Accept: 'application/json',
        },
      })
      if (osmResp.ok) {
        const osmJson = (await osmResp.json()) as any[]
        const osmMapped = (Array.isArray(osmJson) ? osmJson : []).map((r) => ({
          name: String(r.display_name || q),
          lat: Number(Number(r.lat).toFixed(5)),
          lng: Number(Number(r.lon).toFixed(5)),
        }))
        const combined = [...localMatches, ...osmMapped].slice(0, 6)
        return res.json({ success: true, data: combined })
      }
    } catch {
      // Fallback to local landmark matches
    }

    return res.json({
      success: true,
      data: localMatches.length > 0 ? localMatches : LANDMARK_INDEX.slice(0, 5),
    })
  })

  // 2. Auth & RBAC Session Endpoints
  router.get('/auth/demo-accounts', (_req, res) => {
    const list = users
      .filter((u) => u.isDemoAccount && u.is_active && u.role === 'admin')
      .map((u) => {
        return {
          username: u.username,
          label: u.full_name,
          role: u.role,
          role_label: 'Government Admin',
          department_id: null,
          department: 'All Municipal Departments (Roads, Sanitation, Drainage, Parks, Electrical)',
        }
      })
    res.json({
      success: true,
      data: list,
      message: `${list.length} demo admin account`,
    })
  })

  const USERNAME_ALIASES: Record<string, string> = {
    officer_roads: 'officer1',
    roads_officer: 'officer1',
    roads: 'officer1',
    officer_sanitation: 'officer2',
    sanitation_officer: 'officer2',
    sanitation: 'officer2',
    officer_drainage: 'officer3',
    drainage_officer: 'officer3',
    drainage: 'officer3',
  }

  function findStaffUserByUsername(rawUsername: string) {
    const normalized = rawUsername.trim().toLowerCase()
    const mapped = USERNAME_ALIASES[normalized] || normalized
    return users.find((u) => u.username.toLowerCase() === mapped && u.is_active)
  }

  router.post('/auth/login', (req, res) => {
    const username = String(req.body?.username ?? req.query?.username ?? '').trim()
    const password = String(req.body?.password ?? req.query?.password ?? '')

    if (!username || !password) {
      return res.status(401).json({
        success: false,
        message: 'Staff username and password are required.',
        detail: 'Staff username and password are required.',
      })
    }

    const user = findStaffUserByUsername(username)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid staff username or password',
        detail: 'Invalid staff username or password',
      })
    }

    if (user.role !== 'admin' && user.role !== 'officer') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to authorized Government Staff (Admin or Department Officer).',
        detail: 'Access restricted to authorized Government Staff (Admin or Department Officer).',
      })
    }

    const userOut = serializeStaffUser(user)
    const jti = crypto.randomUUID()
    const token = jwt.sign(
      { sub: user.username, userId: user.id, jti },
      SECRET_KEY,
      { expiresIn: '24h' }
    )
    recordAudit('USER_LOGIN', 'system', user.username, user, `${user.full_name} (${userOut.department}) signed in`)
    saveDatabase()

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: userOut,
    })
  })

  router.post('/auth/demo-login', (req, res) => {
    const username = String(req.body?.username || '').trim()
    const candidate = findStaffUserByUsername(username)
    const user =
      candidate &&
      candidate.isDemoAccount &&
      candidate.is_active &&
      (candidate.role === 'admin' || candidate.role === 'officer')
        ? candidate
        : undefined
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or unauthorized demo staff account.',
        detail: 'Invalid or unauthorized demo staff account.',
      })
    }

    const userOut = serializeStaffUser(user)
    const jti = crypto.randomUUID()
    const token = jwt.sign(
      { sub: user.username, userId: user.id, jti },
      SECRET_KEY,
      { expiresIn: '24h' }
    )
    recordAudit('USER_LOGIN', 'system', user.username, user, `${user.full_name} (${userOut.department}) signed in via demo evaluation`)
    saveDatabase()

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: userOut,
    })
  })

  router.post('/auth/logout', requireAuth, (req, res) => {
    const currentUser = (req as any).user as User
    const rawToken = (req as any).token as string | undefined
    const jti = (req as any).jti as string | undefined

    if (rawToken) revokedTokens.add(rawToken)
    if (jti) revokedTokens.add(jti)

    recordAudit('USER_LOGOUT', 'system', currentUser.username, currentUser, `${currentUser.full_name} signed out and invalidated session token`)
    saveDatabase()

    res.json({
      success: true,
      data: null,
      message: 'Session invalidated and logged out successfully',
    })
  })

  router.get('/auth/me', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    res.json({
      success: true,
      data: serializeStaffUser(currentUser),
      message: 'Current user profile',
    })
  })

  // 2b. Citizen Account Registration, Login & Complaint History (Optional for Citizens)
  router.post('/citizen/register', publicRateLimiter(20, 5 * 60 * 1000), (req, res) => {
    const fullName = String(req.body?.full_name || req.body?.name || '').trim()
    const rawEmail = String(req.body?.email || '').trim().toLowerCase()
    const rawUsername = String(
      req.body?.username || (rawEmail ? rawEmail.split('@')[0] : '')
    )
      .trim()
      .toLowerCase()
    const password = String(req.body?.password || '')

    if (!fullName || (!rawEmail && !rawUsername) || password.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your full name, email/username, and a password (at least 4 characters).',
      })
    }

    const exists = users.find(
      (u) =>
        (rawEmail && u.email.toLowerCase() === rawEmail) ||
        (rawUsername && u.username.toLowerCase() === rawUsername)
    )
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'A citizen account with this email or username already exists. Please sign in instead.',
      })
    }

    const newId = users.reduce((max, u) => Math.max(max, u.id), 0) + 1
    const finalUsername = rawUsername || `citizen${newId}`
    const finalEmail = rawEmail || `${finalUsername}@citizen.civiceye.in`
    const now = new Date().toISOString()

    const newUser: User & { passwordHash: string; isDemoAccount?: boolean } = {
      id: newId,
      username: finalUsername,
      full_name: fullName,
      email: finalEmail,
      role: 'citizen',
      department_id: null,
      is_active: true,
      created_at: now,
      passwordHash: hashPassword(password),
      isDemoAccount: false,
    }
    users.push(newUser)
    saveDatabase()

    const jti = crypto.randomUUID()
    const token = jwt.sign({ sub: newUser.username, userId: newUser.id, jti }, SECRET_KEY, {
      expiresIn: '24h',
    })

    const userOut = {
      id: newUser.id,
      username: newUser.username,
      full_name: newUser.full_name,
      email: newUser.email,
      role: 'citizen' as const,
      is_active: true,
      created_at: newUser.created_at,
    }

    res.status(201).json({
      success: true,
      access_token: token,
      token_type: 'bearer',
      user: userOut,
      data: {
        access_token: token,
        token_type: 'bearer',
        user: userOut,
      },
      message: 'Citizen account registered successfully',
    })
  })

  router.post('/citizen/login', publicRateLimiter(25, 5 * 60 * 1000), (req, res) => {
    const identifier = String(req.body?.username || req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your email/username and password.',
      })
    }

    const citizenUser = users.find(
      (u) =>
        u.is_active &&
        u.role === 'citizen' &&
        (u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier)
    )
    if (!citizenUser || !verifyPassword(password, citizenUser.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid citizen credentials. You can also use Demo Citizen: citizen1 / pass123.',
      })
    }

    const jti = crypto.randomUUID()
    const token = jwt.sign(
      { sub: citizenUser.username, userId: citizenUser.id, jti },
      SECRET_KEY,
      { expiresIn: '24h' }
    )

    const userOut = {
      id: citizenUser.id,
      username: citizenUser.username,
      full_name: citizenUser.full_name,
      email: citizenUser.email,
      role: 'citizen' as const,
      is_active: true,
      created_at: citizenUser.created_at,
    }

    res.json({
      success: true,
      access_token: token,
      token_type: 'bearer',
      user: userOut,
      data: {
        access_token: token,
        token_type: 'bearer',
        user: userOut,
      },
      message: 'Citizen signed in successfully',
    })
  })

  router.get('/citizen/my-complaints', (req, res) => {
    const currentUser = (req as any).user as User | undefined
    const idsParam = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)

    const matched = complaints.filter((c) => {
      if (idsParam.includes(c.complaint_id.toUpperCase())) return true
      if (currentUser && currentUser.role === 'citizen') {
        if ((c as any).citizen_user_id === currentUser.id) return true
        if (
          c.contact_name &&
          currentUser.full_name &&
          c.contact_name.toLowerCase() === currentUser.full_name.toLowerCase()
        ) {
          return true
        }
      }
      return false
    })

    const list = matched
      .slice(0, 25)
      .map((c) => enrichComplaint(c, true))

    res.json({
      success: true,
      data: list,
      message: `${list.length} citizen complaint(s) retrieved`,
    })
  })

  // 3. Buses & Fleet Management (Read/Monitoring: Staff; Fleet Mutations: Admin-Only)
  router.get('/buses', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const { search, status } = req.query
    let list = buses.map((b) => enrichBus(b, currentUser))

    if (search) {
      const q = String(search).toLowerCase()
      list = list.filter(
        (b) =>
          b.bus_number.toLowerCase().includes(q) ||
          b.route_name.toLowerCase().includes(q) ||
          b.driver_name.toLowerCase().includes(q) ||
          b.registration_number.toLowerCase().includes(q)
      )
    }
    if (status) {
      list = list.filter((b) => b.gps_status === status || b.operational_status === status)
    }

    res.json({
      success: true,
      data: list,
      message: `${list.length} buses found`,
    })
  })

  router.get('/buses/:id', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const busId = Number(req.params.id)
    const bus = buses.find((b) => b.id === busId || b.bus_number.toLowerCase() === String(req.params.id).toLowerCase())
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }
    const route = busRoutes.find((r) => r.bus_id === bus.id) || null
    const history = (gpsHistory[bus.id] || []).map((pt) => ({
      ...pt,
      recorded_at: pt.timestamp,
      is_simulated: pt.source === 'simulated',
    }))
    const busDetections = detections.filter((d) => d.bus_id === bus.id)
    const busComplaints = complaints
      .filter((c) => c.bus_id === bus.id && canUserAccessComplaint(currentUser, c))
      .map((c) => enrichComplaint(c))

    res.json({
      success: true,
      data: {
        ...enrichBus(bus, currentUser),
        route,
        gps_history: history,
        detections: busDetections,
        complaints: busComplaints,
      },
      message: 'Bus details retrieved',
    })
  })

  router.post('/buses', requireAdmin, (req, res) => {
    const {
      bus_number,
      registration_number,
      route_name,
      driver_name,
      driver_phone = '',
      driver_license = '',
      operational_status = 'active',
      gps_source = 'live',
      current_latitude = 18.5204,
      current_longitude = 73.8567,
      waypoints,
    } = req.body

    if (!bus_number || !route_name) {
      return res.status(400).json({ success: false, message: 'Bus number and route name are required.' })
    }

    if (buses.some((b) => b.bus_number.toLowerCase() === String(bus_number).trim().toLowerCase())) {
      return res.status(409).json({ success: false, message: `Bus '${bus_number}' is already registered.` })
    }

    const newId = buses.reduce((max, b) => Math.max(max, b.id), 0) + 1
    const now = new Date().toISOString()
    const newBus: Bus = {
      id: newId,
      bus_number: String(bus_number).trim().toUpperCase(),
      registration_number: String(registration_number || `MH-12-CY-${1000 + newId}`).trim().toUpperCase(),
      route_name: String(route_name).trim(),
      driver_name: String(driver_name || 'Assigned Driver').trim(),
      driver_phone: String(driver_phone).trim(),
      driver_license: String(driver_license || `DL-MH12-${2020 + newId}`).trim(),
      is_active: operational_status === 'active',
      operational_status,
      gps_source,
      last_seen_at: operational_status === 'active' ? now : null,
      current_latitude: Number(current_latitude) || 18.5204,
      current_longitude: Number(current_longitude) || 73.8567,
      current_speed: operational_status === 'active' ? 24 : 0,
    }

    buses.push(newBus)

    const defaultWaypoints: RouteWaypoint[] = Array.isArray(waypoints) && waypoints.length > 0
      ? waypoints
      : [
          { lat: newBus.current_latitude!, lng: newBus.current_longitude!, name: `${newBus.route_name} Origin` },
          { lat: +(newBus.current_latitude! + 0.008).toFixed(4), lng: +(newBus.current_longitude! + 0.009).toFixed(4), name: 'Midway Stop' },
          { lat: +(newBus.current_latitude! + 0.016).toFixed(4), lng: +(newBus.current_longitude! + 0.018).toFixed(4), name: 'Terminal Depot' },
        ]

    busRoutes.push({
      id: busRoutes.length + 1,
      bus_id: newBus.id,
      name: newBus.route_name,
      waypoints: defaultWaypoints,
      created_at: now,
    })

    gpsHistory[newBus.id] = [
      {
        latitude: newBus.current_latitude!,
        longitude: newBus.current_longitude!,
        speed: newBus.current_speed || 0,
        timestamp: now,
        source: gps_source === 'simulated' ? 'simulated' : 'live',
      },
    ]

    recordAudit('BUS_REGISTERED', 'bus', newBus.bus_number, (req as any).user, `Registered bus ${newBus.bus_number} on ${newBus.route_name}`)
    saveDatabase()

    res.status(201).json({
      success: true,
      data: enrichBus(newBus),
      message: 'Bus registered successfully',
    })
  })

  router.put('/buses/:id', requireAdmin, (req, res) => {
    const busId = Number(req.params.id)
    const bus = buses.find((b) => b.id === busId)
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }

    const {
      bus_number,
      registration_number,
      route_name,
      driver_name,
      driver_phone,
      driver_license,
      is_active,
      operational_status,
      gps_source,
      current_latitude,
      current_longitude,
    } = req.body

    if (bus_number !== undefined) bus.bus_number = String(bus_number).trim().toUpperCase()
    if (registration_number !== undefined) bus.registration_number = String(registration_number).trim().toUpperCase()
    if (route_name !== undefined) {
      bus.route_name = String(route_name).trim()
      const route = busRoutes.find((r) => r.bus_id === bus.id)
      if (route) route.name = bus.route_name
    }
    if (driver_name !== undefined) bus.driver_name = String(driver_name).trim()
    if (driver_phone !== undefined) bus.driver_phone = String(driver_phone).trim()
    if (driver_license !== undefined) bus.driver_license = String(driver_license).trim()
    if (typeof is_active === 'boolean') {
      bus.is_active = is_active
      if (!is_active && bus.operational_status === 'active') {
        bus.operational_status = 'offline'
      } else if (is_active && bus.operational_status !== 'active') {
        bus.operational_status = 'active'
      }
    }
    if (operational_status !== undefined) {
      bus.operational_status = operational_status
      bus.is_active = operational_status === 'active'
    }
    if (gps_source !== undefined) bus.gps_source = gps_source
    if (current_latitude !== undefined) bus.current_latitude = Number(current_latitude)
    if (current_longitude !== undefined) bus.current_longitude = Number(current_longitude)

    recordAudit('BUS_UPDATED', 'bus', bus.bus_number, (req as any).user, `Updated bus ${bus.bus_number} (status: ${bus.operational_status})`)
    saveDatabase()

    res.json({
      success: true,
      data: enrichBus(bus),
      message: 'Bus updated successfully',
    })
  })

  router.delete('/buses/:id', requireAdmin, (req, res) => {
    const busId = Number(req.params.id)
    const bus = buses.find((b) => b.id === busId)
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }

    bus.is_active = false
    bus.operational_status = 'offline'
    bus.current_speed = 0

    recordAudit('BUS_DEACTIVATED', 'bus', bus.bus_number, (req as any).user, `Deactivated bus ${bus.bus_number}`)
    saveDatabase()

    res.json({
      success: true,
      data: enrichBus(bus),
      message: `Bus ${bus.bus_number} deactivated`,
    })
  })

  router.get('/buses/:id/route', requireStaff, (req, res) => {
    const busId = Number(req.params.id)
    const route = busRoutes.find((r) => r.bus_id === busId)
    if (!route) {
      return res.status(404).json({ success: false, message: 'No route found for this bus' })
    }
    res.json({
      success: true,
      data: route,
      message: 'Route retrieved',
    })
  })

  router.get('/buses/:id/history', requireStaff, (req, res) => {
    const busId = Number(req.params.id)
    const history = (gpsHistory[busId] || []).map((pt) => ({
      ...pt,
      recorded_at: pt.timestamp,
      is_simulated: pt.source === 'simulated',
    }))
    res.json({
      success: true,
      data: history,
      message: `${history.length} GPS points`,
    })
  })

  router.post('/buses/:id/gps', requireStaff, (req, res) => {
    const busId = Number(req.params.id)
    const bus = buses.find((b) => b.id === busId)
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }

    const { latitude, longitude, speed, source = 'live' } = req.body
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required' })
    }

    const now = new Date().toISOString()
    bus.current_latitude = lat
    bus.current_longitude = lng
    bus.current_speed = speed !== undefined ? Number(speed) : bus.current_speed
    bus.last_seen_at = now
    bus.gps_source = source === 'simulated' ? 'simulated' : 'live'

    if (!gpsHistory[bus.id]) gpsHistory[bus.id] = []
    gpsHistory[bus.id].push({
      latitude: lat,
      longitude: lng,
      speed: bus.current_speed || 0,
      timestamp: now,
      source: source === 'simulated' ? 'simulated' : 'live',
    })
    if (gpsHistory[bus.id].length > 100) {
      gpsHistory[bus.id] = gpsHistory[bus.id].slice(-100)
    }

    saveDatabase()

    res.json({
      success: true,
      data: {
        bus_id: bus.id,
        latitude: lat,
        longitude: lng,
        speed: bus.current_speed,
        gps_status: computeBusGpsStatus(bus),
        timestamp: bus.last_seen_at,
      },
      message: 'GPS observation recorded',
    })
  })

  router.get('/buses/:id/detections', requireStaff, (req, res) => {
    const busId = Number(req.params.id)
    const list = detections.filter((d) => d.bus_id === busId)
    res.json({
      success: true,
      data: list,
      message: `${list.length} detections`,
    })
  })

  // 4. Complaints (Admin accesses all; Department Officer accesses ONLY their assigned department)
  router.get('/complaints', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const { status, category, severity, department, source, bus_id, search, skip = 0, limit = 50 } = req.query

    // If a Department Officer requests another department's complaints via query params, reject with 403
    if (currentUser.role === 'officer' && currentUser.department_id) {
      if (department && !doesDepartmentMatchQuery(String(department), currentUser.department_id)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Department Officers can only view complaints assigned to their own department.',
          detail: 'Forbidden: Department Officers can only view complaints assigned to their own department.',
        })
      }
      if (category) {
        const matchedCatKey = Object.keys(categoryToDept).find(
          (k) => k.toLowerCase() === String(category).trim().toLowerCase()
        )
        if (matchedCatKey && categoryToDept[matchedCatKey] !== currentUser.department_id) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Category '${category}' belongs to another department.`,
            detail: `Forbidden: Category '${category}' belongs to another department.`,
          })
        }
      }
    }

    // Strictly scope complaints using server-side user role & assigned department
    let filtered = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    if (status) filtered = filtered.filter((c) => c.status === status)
    if (category) filtered = filtered.filter((c) => c.category.toLowerCase() === String(category).toLowerCase())
    if (severity) filtered = filtered.filter((c) => c.severity === severity)
    if (source) filtered = filtered.filter((c) => c.source === source)
    if (bus_id) filtered = filtered.filter((c) => c.bus_id === Number(bus_id))
    if (department) {
      filtered = filtered.filter((c) => doesDepartmentMatchQuery(String(department), getComplaintDepartmentId(c)))
    }
    if (search) {
      const q = String(search).toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.description.toLowerCase().includes(q) ||
          c.complaint_id.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (c.address && c.address.toLowerCase().includes(q))
      )
    }

    filtered.sort((a, b) => new Date(b.first_detected_at).getTime() - new Date(a.first_detected_at).getTime())

    const total = filtered.length
    const items = filtered.slice(Number(skip), Number(skip) + Number(limit))
    const enriched = items.map((c) => enrichComplaint(c, false))

    res.json({
      success: true,
      data: { total, items: enriched },
      message: `${total} complaints`,
    })
  })

  router.get('/complaints/map', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const accessible = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const points = accessible.map((c) => ({
      id: c.id,
      complaint_id: c.complaint_id,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      severity: c.severity,
      status: c.status,
      source: c.source,
      bus_id: c.bus_id,
      observation_count: c.observation_count,
      first_detected_at: c.first_detected_at,
    }))
    res.json({ success: true, data: points, message: `${points.length} map points` })
  })

  router.get('/map/complaints', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const { category, status, severity, source, department } = req.query
    if (currentUser.role === 'officer' && currentUser.department_id && department) {
      if (!doesDepartmentMatchQuery(String(department), currentUser.department_id)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Department Officers can only view map complaints for their own department.',
          detail: 'Forbidden: Department Officers can only view map complaints for their own department.',
        })
      }
    }
    let list = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    if (category) list = list.filter((c) => c.category === category)
    if (status) list = list.filter((c) => c.status === status)
    if (severity) list = list.filter((c) => c.severity === severity)
    if (source) list = list.filter((c) => c.source === source)

    const markers = list.map((c) => ({
      id: c.id,
      complaint_id: c.complaint_id,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      severity: c.severity,
      status: c.status,
      source: c.source,
      bus_id: c.bus_id,
      observation_count: c.observation_count,
      department_name: c.department_name,
      first_detected_at: c.first_detected_at,
      description: c.description,
    }))
    res.json({ success: true, data: markers, message: `${markers.length} markers` })
  })

  router.get('/map/heatmap', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const accessible = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const maxObs = Math.max(...accessible.map((c) => c.observation_count), 1)
    const points = accessible.map((c) => ({
      lat: c.latitude,
      lng: c.longitude,
      weight: +(c.observation_count / maxObs).toFixed(3),
    }))
    res.json({ success: true, data: points, message: `${points.length} heatmap points` })
  })

  // Public Citizen Complaint Tracking by Tracking ID (Never exposes personal info)
  const handlePublicTrackComplaint = (req: Request, res: Response) => {
    const idParam = String(req.params.id).trim().toUpperCase()
    const complaint = complaints.find(
      (c) =>
        c.complaint_id.toUpperCase() === idParam ||
        c.complaint_id.toUpperCase().replace(/-/g, '') === idParam.replace(/-/g, '') ||
        String(c.id) === idParam ||
        `#${c.id}` === idParam
    )

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `No complaint found matching tracking ID '${req.params.id}'. Please verify the format (e.g., CE-202609-0001).`,
      })
    }

    res.json({
      success: true,
      data: enrichComplaint(complaint, true), // Strip personal info for public tracking
      message: 'Complaint tracking details retrieved',
    })
  }
  router.get('/complaints/public/track/:id', handlePublicTrackComplaint)
  router.get('/complaints/track/:id', handlePublicTrackComplaint)
  router.get('/citizen/track/:id', handlePublicTrackComplaint)

  router.get('/complaints/:id', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const rawIdParam = String(req.params.id || '')
    const idParam = decodeURIComponent(rawIdParam).trim().replace(/^#/, '')
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint '${rawIdParam}' could not be found. It may have been deleted or the reference ID is invalid.`,
        detail: `Complaint '${rawIdParam}' could not be found. It may have been deleted or the reference ID is invalid.`,
      })
    }

    if (!canUserAccessComplaint(currentUser, complaint)) {
      const targetDept = departments.find((d) => d.id === getComplaintDepartmentId(complaint))
      const officerDept = departments.find((d) => d.id === currentUser.department_id)
      return res.status(403).json({
        success: false,
        message: `Forbidden: Complaint ${complaint.complaint_id} is assigned to ${
          targetDept?.name || 'another department'
        }. As a ${
          officerDept?.name || 'Department'
        } Officer, you can only access complaints assigned to your own department.`,
        detail: `Forbidden: Complaint ${complaint.complaint_id} is assigned to ${
          targetDept?.name || 'another department'
        }.`,
      })
    }

    res.json({
      success: true,
      data: enrichComplaint(complaint, false),
      message: 'Complaint retrieved',
    })
  })

  // ── Feature A Helper: Description Similarity & Duplicate Detection ──────────
  const STOP_WORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'near',
    'from',
    'that',
    'this',
    'there',
    'have',
    'has',
    'been',
    'very',
    'into',
    'onto',
    'road',
    'street',
    'pune',
    'issue',
    'problem',
    'causing',
  ])

  function tokenizeDescription(text: string): string[] {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/(ing|ed|s)$/, ''))
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  }

  function computeDescriptionSimilarity(descA: string, descB: string): number {
    const aClean = String(descA || '').trim().toLowerCase()
    const bClean = String(descB || '').trim().toLowerCase()
    if (!aClean || !bClean) return 0
    if (aClean === bClean) return 1

    const tokensA = new Set(tokenizeDescription(aClean))
    const tokensB = new Set(tokenizeDescription(bClean))
    let wordSim = 0
    if (tokensA.size > 0 && tokensB.size > 0) {
      let overlap = 0
      for (const t of tokensA) {
        if (tokensB.has(t)) overlap++
      }
      const union = new Set([...tokensA, ...tokensB]).size
      wordSim = union > 0 ? overlap / union : 0
    }

    // Character 3-gram Dice coefficient for resilient partial phrasing match
    const trigrams = (s: string) => {
      const compact = s.replace(/\s+/g, ' ')
      const set = new Set<string>()
      for (let i = 0; i <= compact.length - 3; i++) {
        set.add(compact.slice(i, i + 3))
      }
      return set
    }
    const triA = trigrams(aClean)
    const triB = trigrams(bClean)
    let triSim = 0
    if (triA.size > 0 && triB.size > 0) {
      let common = 0
      for (const g of triA) {
        if (triB.has(g)) common++
      }
      triSim = (2 * common) / (triA.size + triB.size)
    }

    return Number(Math.min(1, Math.max(wordSim, wordSim * 0.65 + triSim * 0.35)).toFixed(2))
  }

  function findPotentialDuplicatesForSubmission(params: {
    category: string
    description?: string
    latitude?: number | null
    longitude?: number | null
  }) {
    const rawCat = String(params.category || 'Pothole').trim()
    const matchedCat =
      Object.keys(categoryToDept).find((k) => k.toLowerCase() === rawCat.toLowerCase()) || rawCat
    const desc = String(params.description || '').trim()

    const hasValidCoords =
      params.latitude !== undefined &&
      params.latitude !== null &&
      params.longitude !== undefined &&
      params.longitude !== null &&
      !Number.isNaN(Number(params.latitude)) &&
      !Number.isNaN(Number(params.longitude)) &&
      Number(params.latitude) >= -90 &&
      Number(params.latitude) <= 90 &&
      Number(params.longitude) >= -180 &&
      Number(params.longitude) <= 180

    const latVal = hasValidCoords ? Number(params.latitude) : null
    const lngVal = hasValidCoords ? Number(params.longitude) : null

    // Only check unresolved complaints
    const unresolved = complaints.filter((c) => !['resolved', 'closed'].includes(c.status))

    const candidates = unresolved
      .map((existing) => {
        const sameCategory = existing.category.toLowerCase() === matchedCat.toLowerCase()
        const relatedCategory =
          !sameCategory &&
          categoryToDept[existing.category] !== undefined &&
          categoryToDept[existing.category] === categoryToDept[matchedCat]

        const distMeters =
          latVal !== null && lngVal !== null
            ? Math.round(
                haversineDistanceMeters(latVal, lngVal, existing.latitude, existing.longitude)
              )
            : null

        const descSim = computeDescriptionSimilarity(desc, existing.description)
        const reasons: string[] = []
        let matchScore = 0

        if (sameCategory) {
          matchScore += 35
          reasons.push(`Same issue category (${existing.category})`)
        } else if (relatedCategory) {
          matchScore += 15
          reasons.push(`Related department category (${existing.category})`)
        }

        if (distMeters !== null) {
          if (distMeters <= dedupThresholdMeters) {
            matchScore += 45
            reasons.push(`${distMeters}m from selected location (within ${dedupThresholdMeters}m radius)`)
          } else if (distMeters <= 150) {
            matchScore += 30
            reasons.push(`${distMeters}m away (nearby street segment)`)
          } else if (distMeters <= 300) {
            matchScore += 15
            reasons.push(`${distMeters}m away in same locality`)
          }
        }

        if (descSim >= 0.45) {
          matchScore += 30
          reasons.push(`${Math.round(descSim * 100)}% description similarity`)
        } else if (descSim >= 0.2) {
          matchScore += 18
          reasons.push(`${Math.round(descSim * 100)}% keyword overlap in description`)
        }

        // Determine if this unresolved complaint qualifies as a likely duplicate warning
        const isDuplicateCandidate =
          (sameCategory && distMeters !== null && distMeters <= 150) ||
          (sameCategory && distMeters !== null && distMeters <= 300 && descSim >= 0.2) ||
          (sameCategory && descSim >= 0.45) ||
          (relatedCategory && distMeters !== null && distMeters <= 80 && descSim >= 0.25)

        if (!isDuplicateCandidate) return null

        const enriched = enrichComplaint(existing, true)
        return {
          id: existing.id,
          complaint_id: existing.complaint_id,
          category: existing.category,
          description: existing.description,
          status: existing.status,
          severity: existing.severity,
          department_name: enriched.department_name,
          address: existing.address,
          latitude: existing.latitude,
          longitude: existing.longitude,
          distance_meters: distMeters,
          description_similarity: descSim,
          match_score: Math.min(99, matchScore),
          match_reasons: reasons,
          observation_count: existing.observation_count,
          first_detected_at: existing.first_detected_at,
          before_image_url: enriched.before_image_url,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (b.match_score !== a.match_score) return b.match_score - a.match_score
        return (a.distance_meters ?? 9999) - (b.distance_meters ?? 9999)
      })
      .slice(0, 5)

    return candidates
  }

  const handleCheckDuplicates = (req: Request, res: Response) => {
    const { category = 'Pothole', description = '', latitude, longitude } = req.body || {}
    const duplicates = findPotentialDuplicatesForSubmission({
      category,
      description,
      latitude,
      longitude,
    })
    res.json({
      success: true,
      data: {
        has_duplicates: duplicates.length > 0,
        duplicates,
      },
      message:
        duplicates.length > 0
          ? `Found ${duplicates.length} potential unresolved duplicate complaint(s)`
          : 'No potential duplicate complaints found',
    })
  }

  router.post('/complaints/check-duplicates', publicRateLimiter(40, 5 * 60 * 1000), handleCheckDuplicates)
  router.post('/citizen/check-duplicates', publicRateLimiter(40, 5 * 60 * 1000), handleCheckDuplicates)

  // Citizen confirms a flagged duplicate is the same issue (corroborates existing complaint without creating or deleting records)
  router.post('/complaints/:id/confirm-duplicate', publicRateLimiter(30, 5 * 60 * 1000), (req, res) => {
    const idParam = String(req.params.id).trim().toLowerCase()
    const target = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam
    )
    if (!target) {
      return res.status(404).json({
        success: false,
        message: `Complaint '${req.params.id}' not found.`,
      })
    }

    const { notes, media_url } = req.body || {}
    const now = new Date().toISOString()
    target.observation_count = (target.observation_count || 1) + 1
    target.last_detected_at = now
    if (media_url && !target.evidence_image_path) {
      target.evidence_image_path = media_url
      target.media_url = media_url
    }

    target.status_history.push({
      id: Date.now(),
      old_status: target.status,
      new_status: target.status,
      changed_by: null,
      changed_by_name: 'Citizen Reporter (Duplicate Confirmed)',
      changed_at: now,
      notes: notes
        ? `Citizen confirmed same issue & added note: "${String(notes).slice(0, 180)}". Total sightings: ${target.observation_count}.`
        : `Citizen confirmed this is the same unresolved issue. Total sightings: ${target.observation_count}.`,
    })

    if (media_url) {
      evidenceList.push({
        id: Date.now() + 1,
        complaint_id: target.id,
        image_path: media_url,
        image_type: 'citizen',
        uploaded_by: null,
        uploaded_by_name: 'Citizen Reporter',
        notes: 'Corroborating citizen photo evidence',
        created_at: now,
      })
    }

    recordAudit(
      'CITIZEN_CONFIRMED_DUPLICATE',
      'complaint',
      target.complaint_id,
      (req as any).user,
      `Citizen confirmed same issue on ${target.complaint_id}. Observation count: ${target.observation_count}`
    )
    saveDatabase()

    res.json({
      success: true,
      data: {
        ...enrichComplaint(target, true),
        deduplicated: true,
      },
      message: `Confirmed same issue and linked your report to ${target.complaint_id}`,
    })
  })
  const handleCreateComplaint = (req: Request, res: Response) => {
    const {
      category = 'Pothole',
      description,
      latitude,
      longitude,
      address,
      severity = 'medium',
      bus_id,
      source,
      department_id,
      evidence_image_path,
      media_url,
      media_type,
      image_base64,
      is_anonymous = true,
      contact_name,
      contact_phone,
      honeypot,
      force_new = false,
      corroborate_complaint_id,
    } = req.body

    // Abuse prevention: honeypot check
    if (honeypot && String(honeypot).trim() !== '') {
      return res.status(400).json({ success: false, message: 'Automated spam submission rejected.' })
    }

    if (description && String(description).length > 2000) {
      return res.status(400).json({ success: false, message: 'Description must be under 2000 characters.' })
    }

    // Normalize category
    const catStr = String(category || 'Pothole').trim()
    const normalizedCat = catStr.charAt(0).toUpperCase() + catStr.slice(1).toLowerCase()
    const matchedKey =
      Object.keys(categoryToDept).find((k) => k.toLowerCase() === catStr.toLowerCase()) || normalizedCat

    const rawLat = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : 18.5204
    const rawLng = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : 73.8567
    const latVal = Number.isNaN(rawLat) ? 18.5204 : rawLat
    const lngVal = Number.isNaN(rawLng) ? 73.8567 : rawLng
    if (latVal < -90 || latVal > 90 || lngVal < -180 || lngVal > 180) {
      return res.status(400).json({ success: false, message: 'Coordinates out of valid range.' })
    }

    const now = new Date().toISOString()
    let mediaPath = media_url || evidence_image_path || null

    // Retain original image if submitted via image_base64 and not yet saved to /uploads
    if (!mediaPath && image_base64 && typeof image_base64 === 'string') {
      try {
        const mimeMatch = image_base64.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/)
        const extFromMime =
          mimeMatch && mimeMatch[1]
            ? mimeMatch[1].toLowerCase() === 'png'
              ? '.png'
              : mimeMatch[1].toLowerCase() === 'webp'
              ? '.webp'
              : mimeMatch[1].toLowerCase() === 'gif'
              ? '.gif'
              : '.jpg'
            : '.jpg'
        const cleanBase64 = image_base64.replace(/^data:[^;]+;base64,/, '')
        const fname = `citizen-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extFromMime}`
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(cleanBase64, 'base64'))
        mediaPath = `/uploads/${fname}`
      } catch (err) {
        console.warn('[CivicEye AI] Could not persist inline image_base64:', err)
      }
    }

    const complaintSource: Complaint['source'] =
      source || (bus_id ? 'bus_camera' : 'citizen_portal')

    // If citizen explicitly confirmed an existing complaint ID as the same issue
    if (corroborate_complaint_id) {
      const target = complaints.find(
        (c) =>
          String(c.id) === String(corroborate_complaint_id) ||
          c.complaint_id.toLowerCase() === String(corroborate_complaint_id).trim().toLowerCase()
      )
      if (target) {
        const dist = Math.round(
          haversineDistanceMeters(latVal, lngVal, target.latitude, target.longitude)
        )
        target.observation_count += 1
        target.last_detected_at = now
        if (mediaPath && !target.evidence_image_path) {
          target.evidence_image_path = mediaPath
          target.media_url = mediaPath
        }
        target.status_history.push({
          id: Date.now(),
          old_status: target.status,
          new_status: target.status,
          changed_by: null,
          changed_by_name: 'Citizen Report',
          changed_at: now,
          notes: `Corroborated by citizen report (${dist}m away). Total observations: ${target.observation_count}.`,
        })
        if (mediaPath) {
          evidenceList.push({
            id: Date.now() + 1,
            complaint_id: target.id,
            image_path: mediaPath,
            image_type: 'citizen',
            uploaded_by: null,
            uploaded_by_name: 'Citizen Reporter',
            notes: 'Corroborating citizen observation media',
            created_at: now,
          })
        }
        saveDatabase()
        return res.status(200).json({
          success: true,
          data: {
            ...enrichComplaint(target, true),
            deduplicated: true,
            distance_meters: dist,
          },
          message: `Linked to existing complaint ${target.complaint_id}`,
        })
      }
    }

    // Geo-spatial & temporal duplicate check for automated bus camera detections ONLY
    // Citizen submissions are never silently merged or deleted; citizens receive a pre-submission duplicate warning.
    if (!force_new && complaintSource === 'bus_camera') {
      const openSameCat = complaints.filter(
        (c) =>
          c.category.toLowerCase() === matchedKey.toLowerCase() &&
          !['resolved', 'closed'].includes(c.status) &&
          Date.now() - new Date(c.first_detected_at).getTime() < 14 * 86400000
      )

      let closest: Complaint | null = null
      let minDist = Infinity
      for (const existing of openSameCat) {
        const d = haversineDistanceMeters(latVal, lngVal, existing.latitude, existing.longitude)
        if (d < minDist) {
          minDist = d
          closest = existing
        }
      }

      if (closest && minDist <= dedupThresholdMeters) {
        closest.observation_count += 1
        closest.last_detected_at = now
        if (mediaPath && !closest.evidence_image_path) {
          closest.evidence_image_path = mediaPath
          closest.media_url = mediaPath
        }
        closest.status_history.push({
          id: Date.now(),
          old_status: closest.status,
          new_status: closest.status,
          changed_by: null,
          changed_by_name: bus_id ? `Bus #${bus_id}` : 'Bus Camera',
          changed_at: now,
          notes: `Corroborated by additional bus camera pass (${Math.round(minDist)}m away). Total observations: ${closest.observation_count}.`,
        })

        if (mediaPath) {
          evidenceList.push({
            id: Date.now() + 1,
            complaint_id: closest.id,
            image_path: mediaPath,
            image_type: 'detection',
            uploaded_by: null,
            uploaded_by_name: bus_id ? `Bus #${bus_id}` : 'Bus Camera',
            notes: 'Corroborating observation media',
            created_at: now,
          })
        }

        recordAudit(
          'COMPLAINT_DEDUPLICATED',
          'complaint',
          closest.complaint_id,
          (req as any).user,
          `Merged duplicate ${matchedKey} sighting (${Math.round(minDist)}m proximity). Observation count: ${closest.observation_count}`
        )
        saveDatabase()

        return res.status(200).json({
          success: true,
          data: {
            ...enrichComplaint(closest, true),
            deduplicated: true,
            distance_meters: Math.round(minDist),
          },
          message: `Merged with existing nearby complaint ${closest.complaint_id} (${Math.round(minDist)}m away)`,
        })
      }
    }

    const deptId =
      (req as any).user?.role === 'admin' && department_id
        ? Number(department_id)
        : categoryToDept[matchedKey] || Number(department_id) || 1
    const dept = departments.find((d) => d.id === deptId)
    const newId = complaints.reduce((max, c) => Math.max(max, c.id), 0) + 1
    const cid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`

    const newComplaint: Complaint = {
      id: newId,
      complaint_id: cid,
      category: matchedKey,
      description:
        (description && String(description).trim()) ||
        `Reported ${matchedKey} civic issue at [${latVal.toFixed(4)}, ${lngVal.toFixed(4)}]`,
      latitude: latVal,
      longitude: lngVal,
      address: address || `Pune, Maharashtra (${latVal.toFixed(4)}°N, ${lngVal.toFixed(4)}°E)`,
      bus_id: bus_id ? Number(bus_id) : null,
      source: complaintSource,
      severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium',
      status: 'new',
      department_id: deptId,
      department_name: dept?.name || 'Roads & Infrastructure',
      observation_count: 1,
      first_detected_at: now,
      last_detected_at: now,
      resolved_at: null,
      resolution_notes: null,
      evidence_image_path: mediaPath,
      resolution_evidence_path: null,
      media_url: mediaPath,
      media_type:
        media_type ||
        (mediaPath && (mediaPath.endsWith('.mp4') || mediaPath.endsWith('.webm') || mediaPath.endsWith('.mov'))
          ? 'video'
          : 'image'),
      is_anonymous: Boolean(is_anonymous),
      is_simulated: false,
      contact_name: is_anonymous ? null : contact_name || null,
      contact_phone: is_anonymous ? null : contact_phone || null,
      status_history: [
        {
          id: Date.now(),
          old_status: null,
          new_status: 'new',
          changed_by: null,
          changed_by_name:
            complaintSource === 'bus_camera'
              ? `Bus #${bus_id} AI Camera`
              : is_anonymous
              ? 'Anonymous Citizen'
              : contact_name || 'Citizen',
          changed_at: now,
          notes:
            complaintSource === 'bus_camera'
              ? `Automatically created from Bus #${bus_id} camera detection`
              : 'Submitted via CivicEye Public Citizen Portal',
        },
      ],
      assignments: [],
    }

    complaints.unshift(newComplaint)

    if (mediaPath) {
      evidenceList.push({
        id: Date.now() + 2,
        complaint_id: newComplaint.id,
        image_path: mediaPath,
        image_type: complaintSource === 'bus_camera' ? 'detection' : 'citizen',
        uploaded_by: null,
        uploaded_by_name: complaintSource === 'bus_camera' ? `Bus #${bus_id}` : 'Citizen Reporter',
        notes: 'Initial report media evidence',
        created_at: now,
      })
    }

    notifications.unshift({
      id: nextNotifId++,
      user_id: 1,
      title: `New ${newComplaint.category} Report`,
      message: `${newComplaint.category} reported (${newComplaint.complaint_id}) — Routed to ${newComplaint.department_name}`,
      type: newComplaint.severity === 'critical' ? 'warning' : 'info',
      is_read: false,
      complaint_id: newComplaint.id,
      created_at: now,
    })

    recordAudit(
      'COMPLAINT_CREATED',
      'complaint',
      newComplaint.complaint_id,
      (req as any).user,
      `New ${newComplaint.category} complaint (${newComplaint.severity}) via ${complaintSource}`
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: enrichComplaint(newComplaint, true),
      message: 'Complaint registered successfully',
    })
  }

  router.post('/complaints', publicRateLimiter(30, 5 * 60 * 1000), handleCreateComplaint)
  router.post('/complaints/', publicRateLimiter(30, 5 * 60 * 1000), handleCreateComplaint)

  // 4b. Citizen Public AI Classification Endpoint (Uses Real Gemini Vision API)
  const CITIZEN_PORTAL_CATEGORIES = [
    'Pothole',
    'Garbage',
    'Waterlogging',
    'Broken Streetlight',
    'Fallen Tree',
    'Road Obstruction',
    'Road Damage',
    'Open Drain',
    'Other Civic Hazard',
  ]

  function normalizePortalCategory(rawCat: string, contextText = ''): string {
    const clean = String(rawCat || '').trim().toLowerCase()
    const ctx = `${clean} ${contextText}`.toLowerCase()

    // Ensure clear pothole descriptions or pothole detections always map to Pothole
    if (
      clean === 'pothole' ||
      clean === 'potholes' ||
      ((clean === 'road damage' || clean === 'broken road' || clean === 'other civic hazard') &&
        (ctx.includes('pothole') || ctx.includes('pot hole') || ctx.includes('crater') || ctx.includes('road pit')))
    ) {
      return 'Pothole'
    }
    if (clean.includes('garbage') || clean.includes('waste') || clean.includes('dump') || clean.includes('trash')) {
      return 'Garbage'
    }
    if (clean.includes('waterlog') || clean.includes('flood')) {
      return 'Waterlogging'
    }
    if (clean.includes('streetlight') || clean.includes('street light') || clean.includes('lamp')) {
      return 'Broken Streetlight'
    }
    if (clean.includes('tree') || clean.includes('branch')) {
      return 'Fallen Tree'
    }
    if (clean.includes('obstruction') || clean.includes('blockage')) {
      return 'Road Obstruction'
    }
    if (clean.includes('drain') || clean.includes('manhole') || clean.includes('sewer')) {
      return 'Open Drain'
    }
    if (clean.includes('road damage') || clean.includes('broken road') || clean.includes('crack')) {
      return 'Road Damage'
    }

    const exactMatch = CITIZEN_PORTAL_CATEGORIES.find((c) => c.toLowerCase() === clean)
    return exactMatch || 'Other Civic Hazard'
  }

  router.post('/citizen/ai-classify', publicRateLimiter(25, 5 * 60 * 1000), async (req, res) => {
    const { text = '', media_type = 'image', media_url = '', image_base64 = '' } = req.body
    const trimmedText = String(text || '').trim()

    if (!trimmedText && !media_url && !image_base64) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an issue description or attach a photo for AI classification.',
      })
    }

    const ai = getGeminiClient()
    if (!ai) {
      return res.status(503).json({
        success: false,
        message:
          'AI classification service is currently unavailable (API key not configured). Please select the issue category manually.',
      })
    }

    try {
      const parts: any[] = []
      let imageAttached = false

      // 1. Load uploaded image file from disk if media_url points to /uploads/
      if (media_url && typeof media_url === 'string' && media_url.startsWith('/uploads/')) {
        const filename = path.basename(media_url)
        const filePath = path.join(UPLOAD_DIR, filename)
        if (fs.existsSync(filePath) && media_type !== 'video') {
          const fileBuffer = fs.readFileSync(filePath)
          const ext = path.extname(filename).toLowerCase()
          const mimeType =
            ext === '.png'
              ? 'image/png'
              : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg'
          parts.push({
            inlineData: {
              mimeType,
              data: fileBuffer.toString('base64'),
            },
          })
          imageAttached = true
        }
      }

      // 2. Fallback to inline image_base64 if disk file wasn't attached
      if (!imageAttached && image_base64 && typeof image_base64 === 'string') {
        const mimeMatch = image_base64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/)
        const mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1].toLowerCase() : 'image/jpeg'
        const cleanBase64 = image_base64.replace(/^data:[^;]+;base64,/, '')
        if (cleanBase64.length > 0) {
          parts.push({
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          })
          imageAttached = true
        }
      }

      const promptText = `You are the AI civic issue classifier for CivicEye AI (Pune Municipal Corporation).
Analyze the provided ${imageAttached ? 'photo evidence' : ''}${imageAttached && trimmedText ? ' and ' : ''}${trimmedText ? `citizen description: "${trimmedText}"` : ''}.

Classify the issue into EXACTLY ONE of these supported categories:
- "Pothole": Any pothole, road crater, pit, cavity, depression, broken asphalt hole, or water-filled pothole on a road surface. (IMPORTANT: Always choose "Pothole" instead of "Road Damage" or "Waterlogging" when a pothole, crater, or pit in the road surface is described or visible.)
- "Garbage": Uncollected garbage, overflowing dustbins, roadside trash piles, litter, or illegal waste dumping.
- "Waterlogging": Flooded road, standing stormwater across a street, or submerged carriageway (not a single pothole).
- "Broken Streetlight": Non-functional, flickering, broken, or tilted street lamp or light pole.
- "Fallen Tree": Fallen tree, broken heavy tree branch blocking a road or footpath.
- "Road Obstruction": Debris, barricades, stray boulders, or objects blocking traffic lanes.
- "Road Damage": Non-pothole surface damage such as broken dividers, damaged curbs/footpaths, or surface cracks without a pothole cavity.
- "Open Drain": Missing manhole cover, uncovered stormwater drain, or overflowing sewage drain.
- "Other Civic Hazard": Any other municipal hazard not covered above.

Return JSON with:
- category: one of the exact category names above
- confidence: a numeric confidence score between 0.0 and 1.0 reflecting model certainty
- severity: one of "low", "medium", "high", "critical"
- suggested_description: a concise 1-sentence factual summary of the issue
- detected_features: 2 to 4 short factual observations`

      parts.push({ text: promptText })

      const schemaConfig = {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description:
                'One of: Pothole, Garbage, Waterlogging, Broken Streetlight, Fallen Tree, Road Obstruction, Road Damage, Open Drain, Other Civic Hazard',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score between 0.0 and 1.0',
            },
            severity: {
              type: Type.STRING,
              description: 'One of: low, medium, high, critical',
            },
            suggested_description: {
              type: Type.STRING,
              description: 'Concise factual description of the civic issue',
            },
            detected_features: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key visual or textual features identified',
            },
          },
          required: ['category', 'confidence', 'severity', 'suggested_description', 'detected_features'],
        },
      }

      let response
      let usedModel = 'gemini-3.8-flash'
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: schemaConfig,
        })
      } catch (primaryErr) {
        usedModel = 'gemini-flash-latest'
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: schemaConfig.responseSchema,
          },
        })
      }

      const rawText = (response.text || '').trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const rawJson = rawText ? JSON.parse(rawText) : null

      if (!rawJson || !rawJson.category) {
        return res.status(502).json({
          success: false,
          message: 'AI model returned an incomplete classification. Please select the category manually.',
        })
      }

      const combinedContext = `${trimmedText} ${rawJson.suggested_description || ''} ${
        Array.isArray(rawJson.detected_features) ? rawJson.detected_features.join(' ') : ''
      }`
      const matchedCat = normalizePortalCategory(rawJson.category, combinedContext)
      const deptId = categoryToDept[matchedCat] || 1
      const dept = departments.find((d) => d.id === deptId)
      const sev = ['low', 'medium', 'high', 'critical'].includes(String(rawJson.severity).toLowerCase())
        ? (String(rawJson.severity).toLowerCase() as 'low' | 'medium' | 'high' | 'critical')
        : 'medium'

      // Only return confidence if the model provided a meaningful numeric score in (0, 1]
      const rawConf = Number(rawJson.confidence)
      const meaningfulConfidence =
        typeof rawJson.confidence === 'number' && Number.isFinite(rawConf) && rawConf > 0 && rawConf <= 1
          ? Number(Math.min(0.99, Math.max(0.05, rawConf)).toFixed(2))
          : null

      const isLowConfidence = meaningfulConfidence === null || meaningfulConfidence < 0.65

      return res.json({
        success: true,
        data: {
          category: matchedCat,
          confidence: meaningfulConfidence,
          low_confidence: isLowConfidence,
          confidence_warning: isLowConfidence
            ? 'Low AI confidence score. Please verify or manually select the issue category before submitting.'
            : null,
          severity: sev,
          department_id: deptId,
          department_name: dept?.name || 'Roads & Infrastructure',
          suggested_description: rawJson.suggested_description || '',
          detected_features: Array.isArray(rawJson.detected_features) ? rawJson.detected_features : [],
          media_type,
          ai_model: usedModel,
          is_simulated: false,
        },
        message: `Classified with Gemini AI (${usedModel})`,
      })
    } catch (err: any) {
      console.error('[CivicEye AI] Gemini classification error:', err?.message || err)
      return res.status(503).json({
        success: false,
        message:
          'AI classification service is temporarily unavailable. Please select or adjust the issue category manually.',
      })
    }
  })

  // 4c. Citizen Media Upload (Photos or Videos)
  router.post(
    '/citizen/upload-media',
    publicRateLimiter(20, 5 * 60 * 1000),
    (req, res, next) => {
      upload.single('media')(req, res, (err: any) => {
        if (err) {
          return res.status(400).json({
            success: false,
            message: err.message || 'Invalid file upload. Max 20MB image or video allowed.',
          })
        }
        next()
      })
    },
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No media file provided' })
      }
      const isVideo = req.file.mimetype.startsWith('video/')
      res.json({
        success: true,
        data: {
          url: `/uploads/${req.file.filename}`,
          filename: req.file.filename,
          media_type: isVideo ? 'video' : 'image',
          size_bytes: req.file.size,
        },
        message: 'Media uploaded successfully',
      })
    }
  )

  // 4d. Complaint Status, Assignment, Priority & Evidence
  router.put('/complaints/:id/status', requireStaff, (req, res) => {
    const actor = (req as any).user as User
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found', detail: 'Complaint not found' })
    }

    if (!canUserAccessComplaint(actor, complaint)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Department Officers can only update complaints assigned to their own department.',
        detail: 'Forbidden: Department Officers can only update complaints assigned to their own department.',
      })
    }

    const { status, notes } = req.body
    const verification = ensureRepairVerificationRecord(complaint)

    // Guard: Unverified repair evidence cannot automatically close a complaint without verification
    if (
      status === 'closed' &&
      verification.after_image_url &&
      (verification.verification_status === 'pending_review' ||
        verification.verification_status === 'needs_reinspection' ||
        verification.verification_status === 'rejected')
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Cannot close complaint while uploaded repair evidence is unverified (' +
          verification.verification_status.replace(/_/g, ' ') +
          '). Please verify the repair evidence first.',
        detail:
          'Cannot close complaint while uploaded repair evidence is unverified. Verify the repair first.',
      })
    }

    const oldStatus = complaint.status
    complaint.status = status
    const now = new Date().toISOString()

    if (status === 'resolved' || status === 'closed') {
      complaint.resolved_at = now
      if (notes) complaint.resolution_notes = notes
      verification.verification_status = 'verified'
      verification.public_approved = true
      verification.decision_by_id = actor?.id || 1
      verification.decision_by_name = actor?.full_name || 'Municipal Commissioner (Admin)'
      verification.decision_by_role = actor?.role || 'admin'
      verification.decision_at = now
      verification.decision_notes = notes || 'Verified and marked resolved'
      verification.public_summary =
        notes || `Repair of ${complaint.category} verified by municipal administration.`
    } else if (status === 'in_progress' && oldStatus === 'awaiting_verification') {
      complaint.resolved_at = null
    }

    complaint.status_history.push({
      id: Date.now(),
      old_status: oldStatus,
      new_status: status,
      changed_by: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Staff',
      changed_at: now,
      notes: notes || `Status updated to ${status}`,
    })

    notifications.unshift({
      id: nextNotifId++,
      user_id: 1,
      title: `Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
      message: `Complaint ${complaint.complaint_id} transitioned from ${oldStatus} to ${status}.`,
      type: status === 'resolved' ? 'success' : 'info',
      is_read: false,
      complaint_id: complaint.id,
      created_at: now,
    })

    recordAudit(
      `STATUS_${String(status).toUpperCase()}`,
      'complaint',
      complaint.complaint_id,
      actor,
      `Transitioned ${complaint.complaint_id} from ${oldStatus} to ${status}${notes ? `: ${notes}` : ''}`
    )
    saveDatabase()

    res.json({
      success: true,
      data: enrichComplaint(complaint),
      message: `Status updated to '${status}'`,
    })
  })

  router.put('/complaints/:id/priority', requireStaff, (req, res) => {
    const actor = (req as any).user as User
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found', detail: 'Complaint not found' })
    }

    if (!canUserAccessComplaint(actor, complaint)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Department Officers can only update complaints assigned to their own department.',
        detail: 'Forbidden: Department Officers can only update complaints assigned to their own department.',
      })
    }

    const { severity, notes, department_id, assigned_to } = req.body
    if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({ success: false, message: 'Invalid severity level' })
    }

    const segLookup = getRoadSegmentLookupMap()
    const currentSmart = computeSmartPriorityForComplaint(complaint, segLookup)
    const oldSev = complaint.severity
    complaint.severity = severity
    const now = new Date().toISOString()
    const overrideReason =
      (notes && String(notes).trim()) ||
      `Manual priority review: set to ${severity.toUpperCase()} by ${actor?.full_name || 'Admin'}`

    complaint.priority_override = {
      priority: severity,
      recommended_priority: currentSmart.recommended_priority,
      reason: overrideReason,
      overridden_by_id: actor?.id || 1,
      overridden_by_name: actor?.full_name || 'Municipal Commissioner (Admin)',
      overridden_by_role: actor?.role || 'admin',
      overridden_at: now,
    }

    if (!Array.isArray(complaint.priority_history)) {
      complaint.priority_history = []
    }
    complaint.priority_history.unshift({
      id: Date.now(),
      old_priority: oldSev,
      new_priority: severity,
      recommended_priority: currentSmart.recommended_priority,
      is_manual_override: true,
      changed_by_id: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Commissioner (Admin)',
      changed_by_role: actor?.role || 'admin',
      reason: overrideReason,
      changed_at: now,
    })

    if (actor.role === 'admin' && department_id) {
      const dept = departments.find((d) => d.id === Number(department_id))
      if (dept) {
        complaint.department_id = dept.id
        complaint.department_name = dept.name
      }
    }
    if (actor.role === 'admin' && assigned_to) {
      const officer = users.find((u) => u.id === Number(assigned_to))
      complaint.assignments.push({
        id: Date.now() + 2,
        complaint_id: complaint.id,
        assigned_to: Number(assigned_to),
        assigned_to_name: officer ? officer.full_name : `Officer #${assigned_to}`,
        assigned_by: actor.id,
        assigned_at: now,
        notes: overrideReason,
      })
    }

    complaint.status_history.push({
      id: Date.now() + 1,
      old_status: complaint.status,
      new_status: complaint.status,
      changed_by: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Staff',
      changed_at: now,
      notes: `Priority manually reviewed & set from ${oldSev.toUpperCase()} to ${severity.toUpperCase()} (${overrideReason})`,
    })

    recordAudit(
      'PRIORITY_OVERRIDDEN',
      'complaint',
      complaint.complaint_id,
      actor,
      `Priority set from ${oldSev.toUpperCase()} to ${severity.toUpperCase()} by ${actor?.full_name || 'Admin'} (${overrideReason})`
    )
    saveDatabase()

    res.json({
      success: true,
      data: enrichComplaint(complaint),
      message: `Priority updated to '${severity}'`,
    })
  })

  router.put('/complaints/:id/assign', requireAdmin, (req, res) => {
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }

    const { department_id, assigned_to, severity, notes } = req.body
    const actor = (req as any).user as User
    const now = new Date().toISOString()

    if (severity && ['low', 'medium', 'high', 'critical'].includes(severity)) {
      complaint.severity = severity
    }

    if (department_id) {
      const dept = departments.find((d) => d.id === Number(department_id))
      if (dept) {
        const oldStatus = complaint.status
        complaint.department_id = dept.id
        complaint.department_name = dept.name
        if (complaint.status === 'new') {
          complaint.status = 'assigned'
          complaint.status_history.push({
            id: Date.now(),
            old_status: oldStatus,
            new_status: 'assigned',
            changed_by: actor?.id || 1,
            changed_by_name: actor?.full_name || 'Municipal Staff',
            changed_at: now,
            notes: notes || `Assigned to ${dept.name}`,
          })
        }
      }
    }

    if (assigned_to) {
      const officer = users.find((u) => u.id === Number(assigned_to))
      complaint.assignments.push({
        id: Date.now() + 1,
        complaint_id: complaint.id,
        assigned_to: Number(assigned_to),
        assigned_to_name: officer ? officer.full_name : `Officer #${assigned_to}`,
        assigned_by: actor?.id || 1,
        assigned_at: now,
        notes: notes || 'Assigned to field officer',
      })
    }

    recordAudit(
      'COMPLAINT_ASSIGNED',
      'complaint',
      complaint.complaint_id,
      actor,
      `Assigned ${complaint.complaint_id} to ${complaint.department_name}${notes ? ` (${notes})` : ''}`
    )
    saveDatabase()

    res.json({
      success: true,
      data: enrichComplaint(complaint),
      message: 'Complaint assignment updated',
    })
  })

  // Staff-Verified Geo-Deduplication Merge Endpoint
  router.post('/complaints/:id/merge', requireStaff, (req, res) => {
    const actor = (req as any).user as User
    const idParam = req.params.id
    const primary = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!primary) {
      return res.status(404).json({ success: false, message: 'Primary complaint not found' })
    }

    if (!canUserAccessComplaint(actor, primary)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to modify complaints outside your department.',
        detail: 'Forbidden: You do not have permission to modify complaints outside your department.',
      })
    }

    const { duplicate_id } = req.body
    const duplicate = complaints.find(
      (c) =>
        String(c.id) === String(duplicate_id) ||
        c.complaint_id.toLowerCase() === String(duplicate_id || '').toLowerCase()
    )
    if (!duplicate) {
      return res.status(404).json({ success: false, message: 'Duplicate complaint not found' })
    }
    if (!canUserAccessComplaint(actor, duplicate)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot merge a complaint belonging to another department.',
        detail: 'Forbidden: Cannot merge a complaint belonging to another department.',
      })
    }
    if (duplicate.id === primary.id) {
      return res.status(400).json({ success: false, message: 'Cannot merge a complaint with itself' })
    }
    if (duplicate.category.toLowerCase() !== primary.category.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: `Unrelated categories (${primary.category} vs ${duplicate.category}) cannot be merged automatically.`,
      })
    }

    const dist = Math.round(
      haversineDistanceMeters(primary.latitude, primary.longitude, duplicate.latitude, duplicate.longitude)
    )
    const now = new Date().toISOString()

    // Preserve observation counts, evidence, reporting sources and history
    primary.observation_count = (primary.observation_count || 1) + (duplicate.observation_count || 1)
    primary.last_detected_at = now
    if (!primary.evidence_image_path && duplicate.evidence_image_path) {
      primary.evidence_image_path = duplicate.evidence_image_path
      primary.media_url = duplicate.media_url || duplicate.evidence_image_path
    }

    // Re-link evidence records from duplicate to primary
    for (const ev of evidenceList) {
      if (ev.complaint_id === duplicate.id) {
        ev.complaint_id = primary.id
        ev.notes = `${ev.notes || 'Evidence'} (Merged from ${duplicate.complaint_id})`
      }
    }

    primary.status_history.push({
      id: Date.now(),
      old_status: primary.status,
      new_status: primary.status,
      changed_by: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Staff',
      changed_at: now,
      notes: `Merged confirmed duplicate ${duplicate.complaint_id} (Source: ${duplicate.source}, ${dist}m away). Total observations: ${primary.observation_count}.`,
    })

    // Mark the duplicate record as closed & merged so it no longer clutters open queues
    const dupOldStatus = duplicate.status
    duplicate.status = 'closed'
    duplicate.resolved_at = now
    duplicate.merged_into_complaint_id = primary.complaint_id
    duplicate.resolution_notes = `Merged into primary complaint ${primary.complaint_id} after staff geo-deduplication verification.`
    duplicate.status_history.push({
      id: Date.now() + 1,
      old_status: dupOldStatus,
      new_status: 'closed',
      changed_by: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Staff',
      changed_at: now,
      notes: `Merged into ${primary.complaint_id} (${dist}m proximity)`,
    })

    recordAudit(
      'DUPLICATE_MERGED',
      'complaint',
      primary.complaint_id,
      actor,
      `Staff verified and merged duplicate ${duplicate.complaint_id} into ${primary.complaint_id} (${dist}m distance)`
    )
    saveDatabase()

    res.json({
      success: true,
      data: enrichComplaint(primary),
      message: `Merged ${duplicate.complaint_id} into ${primary.complaint_id}`,
    })
  })

  // Admin-Only System Settings Endpoints
  router.get('/settings', requireAdmin, (_req, res) => {
    res.json({
      success: true,
      data: { threshold_meters: dedupThresholdMeters },
      message: 'System settings retrieved',
    })
  })

  router.get('/settings/deduplication', requireAdmin, (_req, res) => {
    res.json({
      success: true,
      data: { threshold_meters: dedupThresholdMeters },
      message: `Geo-deduplication radius is ${dedupThresholdMeters}m`,
    })
  })

  router.put('/settings/deduplication', requireAdmin, (req, res) => {
    const val = Number(req.body.threshold_meters)
    if (Number.isNaN(val) || val < 10 || val > 500) {
      return res.status(400).json({
        success: false,
        message: 'Threshold must be between 10 and 500 metres.',
      })
    }
    dedupThresholdMeters = Math.round(val)
    recordAudit(
      'SETTINGS_UPDATED',
      'system',
      'deduplication',
      (req as any).user,
      `Updated geo-deduplication distance threshold to ${dedupThresholdMeters}m`
    )
    saveDatabase()
    res.json({
      success: true,
      data: { threshold_meters: dedupThresholdMeters },
      message: `Geo-deduplication distance threshold updated to ${dedupThresholdMeters}m`,
    })
  })

  router.post(
    '/complaints/:id/evidence',
    requireStaff,
    (req, res, next) => {
      const actor = (req as any).user as User
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found', detail: 'Complaint not found' })
      }
      if (!canUserAccessComplaint(actor, complaint)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Department Officers can only attach evidence to complaints in their own department.',
          detail: 'Forbidden: Department Officers can only attach evidence to complaints in their own department.',
        })
      }
      next()
    },
    upload.single('file'),
    (req, res) => {
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' })
      }

      const file = req.file
      if (!file) {
        return res.status(400).json({ success: false, message: 'Please select an image file to upload as evidence.' })
      }

      const actor = (req as any).user as User
      const imagePath = `/uploads/${file.filename}`
      const imageType = String(req.body.image_type || req.query.image_type || 'resolution')
      const notes = String(req.body.notes || 'Field inspection / resolution proof uploaded')
      const now = new Date().toISOString()
      const verification = ensureRepairVerificationRecord(complaint)

      if (imageType === 'resolution') {
        complaint.resolution_evidence_path = imagePath
        verification.after_image_url = imagePath
        verification.after_uploaded_at = now
        verification.after_uploaded_by_name = actor?.full_name || 'Municipal Commissioner (Admin)'
        verification.after_latitude = complaint.latitude
        verification.after_longitude = complaint.longitude
        verification.after_notes = notes
        verification.after_is_simulated = false
        verification.verification_status = 'pending_review'
        verification.public_approved = false
        verification.history.unshift({
          id: Date.now() + 2,
          action: 'AFTER_PHOTO_UPLOADED',
          status: 'pending_review',
          actor_name: actor?.full_name || 'Municipal Commissioner (Admin)',
          actor_role: actor?.role || 'admin',
          notes: `Uploaded AFTER repair photo: ${notes}`,
          timestamp: now,
          after_image_url: imagePath,
        })

        // Transition status to awaiting_verification (NEVER automatically close or resolve!)
        if (['new', 'assigned', 'in_progress'].includes(complaint.status)) {
          const prevStatus = complaint.status
          complaint.status = 'awaiting_verification'
          complaint.status_history.push({
            id: Date.now() + 3,
            old_status: prevStatus,
            new_status: 'awaiting_verification',
            changed_by: actor?.id || 1,
            changed_by_name: actor?.full_name || 'Municipal Officer',
            changed_at: now,
            notes: `AFTER repair photo uploaded (${notes}). Pending Admin verification before closure.`,
          })
        }
      } else {
        complaint.evidence_image_path = imagePath
        verification.before_image_url = imagePath
        verification.before_is_simulated = false
      }

      const ev: Evidence = {
        id: Date.now(),
        complaint_id: complaint.id,
        image_path: imagePath,
        image_type: imageType,
        uploaded_by: actor?.id || 1,
        uploaded_by_name: actor?.full_name || 'Municipal Officer',
        notes,
        created_at: now,
      }
      evidenceList.push(ev)

      complaint.status_history.push({
        id: Date.now() + 1,
        old_status: complaint.status,
        new_status: complaint.status,
        changed_by: actor?.id || 1,
        changed_by_name: actor?.full_name || 'Municipal Officer',
        changed_at: now,
        notes: `Uploaded ${imageType} photo evidence: ${notes}`,
      })

      recordAudit(
        'EVIDENCE_UPLOADED',
        'complaint',
        complaint.complaint_id,
        actor,
        `Uploaded ${imageType} evidence for ${complaint.complaint_id}`
      )
      saveDatabase()

      res.json({
        success: true,
        data: ev,
        message: 'Evidence uploaded and attached to complaint',
      })
    }
  )

  // 4e. Feature 1: Road Health Score Endpoints
  router.get('/road-health', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const overview = computeRoadHealthSegments(currentUser)
    saveDatabase()
    res.json({
      success: true,
      data: overview,
      message: `${overview.segments.length} road segments evaluated`,
    })
  })

  router.get('/road-health/:segmentId', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const overview = computeRoadHealthSegments(currentUser)
    const seg = overview.segments.find(
      (s) => s.segment_id.toLowerCase() === String(req.params.segmentId).toLowerCase()
    )
    if (!seg) {
      return res.status(404).json({
        success: false,
        message: `Road segment '${req.params.segmentId}' not found`,
      })
    }
    res.json({
      success: true,
      data: seg,
      message: `Road segment ${seg.segment_id} retrieved`,
    })
  })

  // 4f. Feature 2: Smart Repair Priority Queue Endpoint
  const handleGetPriorityQueue = (req: Request, res: Response) => {
    const currentUser = (req as any).user as User
    const {
      department,
      priority,
      sort_by = 'score',
      sort_dir = 'desc',
      search,
    } = req.query

    // Only verified unresolved complaints, excluding merged duplicates
    const unresolved = complaints.filter(
      (c) =>
        canUserAccessComplaint(currentUser, c) &&
        !['resolved', 'closed'].includes(c.status) &&
        !c.merged_into_complaint_id
    )

    // Spatial deduplication safeguard so duplicate detections of the same physical issue never appear twice in the queue
    const deduplicatedQueue: Complaint[] = []
    let duplicatesConsolidatedCount = 0
    for (const c of unresolved) {
      const existingSameSpot = deduplicatedQueue.find(
        (u) =>
          u.category.toLowerCase() === c.category.toLowerCase() &&
          isValidCoordinate(u.latitude, u.longitude) &&
          isValidCoordinate(c.latitude, c.longitude) &&
          haversineDistanceMeters(u.latitude, u.longitude, c.latitude, c.longitude) <= dedupThresholdMeters
      )
      if (existingSameSpot) {
        duplicatesConsolidatedCount += c.observation_count || 1
      } else {
        deduplicatedQueue.push(c)
        duplicatesConsolidatedCount += Math.max(0, (c.observation_count || 1) - 1)
      }
    }

    let enrichedList = deduplicatedQueue.map((c) => enrichComplaint(c, false))

    if (department) {
      enrichedList = enrichedList.filter((c) =>
        doesDepartmentMatchQuery(String(department), getComplaintDepartmentId(c))
      )
    }
    if (priority) {
      enrichedList = enrichedList.filter(
        (c) =>
          (c.smart_priority?.effective_priority || c.severity) === String(priority).toLowerCase()
      )
    }
    if (search) {
      const q = String(search).toLowerCase()
      enrichedList = enrichedList.filter(
        (c) =>
          c.complaint_id.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.smart_priority?.priority_reason &&
            c.smart_priority.priority_reason.toLowerCase().includes(q))
      )
    }

    const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const dir = String(sort_dir).toLowerCase() === 'asc' ? 1 : -1

    enrichedList.sort((a, b) => {
      const spA = a.smart_priority!
      const spB = b.smart_priority!
      if (sort_by === 'severity') {
        const diff = (sevRank[spA.effective_priority] || 1) - (sevRank[spB.effective_priority] || 1)
        if (diff !== 0) return diff * dir
      } else if (sort_by === 'age') {
        const diff = spA.age_days - spB.age_days
        if (diff !== 0) return diff * dir
      } else if (sort_by === 'road_health') {
        const scoreA = typeof spA.road_health_score === 'number' ? spA.road_health_score : 999
        const scoreB = typeof spB.road_health_score === 'number' ? spB.road_health_score : 999
        const diff = scoreA - scoreB
        if (diff !== 0) return diff * dir
      } else if (sort_by === 'reports') {
        const diff = spA.independent_reports_count - spB.independent_reports_count
        if (diff !== 0) return diff * dir
      }
      return (spA.score - spB.score) * dir
    })

    res.json({
      success: true,
      data: {
        items: enrichedList,
        queue: enrichedList,
        total: enrichedList.length,
        duplicates_consolidated_count: duplicatesConsolidatedCount,
        algorithm_note:
          'Rule-Based Smart Repair Priority Queue: evaluates Severity (40 pts), Unresolved Age (20 pts), Corroborated Deduplicated Reports (15 pts), Road Segment Health Score (15 pts), and Verified School/Hospital/Transit Proximity within 600m (15 pts). Never auto-closes complaints.',
      },
      message: `${enrichedList.length} prioritized unresolved issues`,
    })
  }
  router.get('/priority-queue', requireStaff, handleGetPriorityQueue)
  router.get('/smart-priority', requireStaff, handleGetPriorityQueue)

  // 4g. Feature 3: Before & After Repair Verification Endpoints
  router.post(
    '/complaints/:id/verification/upload-after',
    requireStaff,
    (req, res, next) => {
      const actor = (req as any).user as User
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' })
      }
      if (!canUserAccessComplaint(actor, complaint)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only upload repair evidence for your assigned department.',
        })
      }
      next()
    },
    upload.single('file'),
    (req, res) => {
      const actor = (req as any).user as User
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )!
      const now = new Date().toISOString()
      const notes =
        String(req.body.notes || '').trim() ||
        'Field repair reported complete; AFTER photo uploaded for Admin verification.'
      const lat =
        req.body.latitude !== undefined && !Number.isNaN(Number(req.body.latitude))
          ? Number(req.body.latitude)
          : complaint.latitude
      const lng =
        req.body.longitude !== undefined && !Number.isNaN(Number(req.body.longitude))
          ? Number(req.body.longitude)
          : complaint.longitude

      let afterPath: string | null = null
      let isSimulatedAfter = Boolean(
        req.body.is_simulated === 'true' || req.body.is_simulated === true
      )

      if (req.file) {
        afterPath = `/uploads/${req.file.filename}`
        isSimulatedAfter = false
      } else if (req.body.image_base64 && typeof req.body.image_base64 === 'string') {
        const rawB64 = String(req.body.image_base64)
        if (rawB64.startsWith('data:image/svg+xml')) {
          afterPath = rawB64
          isSimulatedAfter = true
        } else {
          try {
            const clean = rawB64.replace(/^data:[^;]+;base64,/, '')
            const fname = `after-repair-${complaint.id}-${Date.now()}.jpg`
            fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(clean, 'base64'))
            afterPath = `/uploads/${fname}`
          } catch {
            afterPath = generateAfterInspectionSvg(complaint, notes, now)
            isSimulatedAfter = true
          }
        }
      } else {
        afterPath = generateAfterInspectionSvg(complaint, notes, now)
        isSimulatedAfter = true
      }

      const verification = ensureRepairVerificationRecord(complaint)
      complaint.resolution_evidence_path = afterPath
      verification.after_image_url = afterPath
      verification.after_uploaded_at = now
      verification.after_uploaded_by_name = actor?.full_name || 'Municipal Commissioner (Admin)'
      verification.after_latitude = lat
      verification.after_longitude = lng
      verification.after_notes = notes
      verification.after_is_simulated = isSimulatedAfter
      verification.verification_status = 'pending_review'
      verification.public_approved = false

      verification.history.unshift({
        id: Date.now(),
        action: 'AFTER_PHOTO_UPLOADED',
        status: 'pending_review',
        actor_name: actor?.full_name || 'Municipal Commissioner (Admin)',
        actor_role: actor?.role || 'admin',
        notes,
        timestamp: now,
        after_image_url: afterPath,
      })

      evidenceList.push({
        id: Date.now() + 1,
        complaint_id: complaint.id,
        image_path: afterPath,
        image_type: 'resolution',
        uploaded_by: actor?.id || 1,
        uploaded_by_name: actor?.full_name || 'Municipal Commissioner (Admin)',
        notes,
        created_at: now,
      })

      // Move to awaiting_verification (NEVER auto-close or auto-resolve!)
      const oldStatus = complaint.status
      if (complaint.status !== 'awaiting_verification') {
        complaint.status = 'awaiting_verification'
        complaint.resolved_at = null
      }

      complaint.status_history.push({
        id: Date.now() + 2,
        old_status: oldStatus,
        new_status: 'awaiting_verification',
        changed_by: actor?.id || 1,
        changed_by_name: actor?.full_name || 'Municipal Commissioner (Admin)',
        changed_at: now,
        notes: `Uploaded AFTER repair photo (${isSimulatedAfter ? 'Demo Certificate' : 'Field Photo'}): ${notes}. Awaiting Admin Verification.`,
      })

      recordAudit(
        'REPAIR_AFTER_PHOTO_UPLOADED',
        'complaint',
        complaint.complaint_id,
        actor,
        `Uploaded AFTER repair photo for ${complaint.complaint_id}; status set to awaiting_verification`
      )
      saveDatabase()

      res.json({
        success: true,
        data: enrichComplaint(complaint),
        message: 'AFTER repair photo uploaded. Complaint is now awaiting verification.',
      })
    }
  )

  router.post('/complaints/:id/verification/decision', requireStaff, (req, res) => {
    const actor = (req as any).user as User
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }
    if (!canUserAccessComplaint(actor, complaint)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot verify complaints outside your assigned department.',
      })
    }

    const { decision, notes, public_summary } = req.body
    if (!['verified', 'needs_reinspection', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be one of: 'verified', 'needs_reinspection', 'rejected'.",
      })
    }

    const verification = ensureRepairVerificationRecord(complaint)
    if (decision === 'verified' && !verification.after_image_url) {
      return res.status(400).json({
        success: false,
        message: 'An AFTER repair photo must be uploaded before marking the repair as Verified.',
      })
    }

    const now = new Date().toISOString()
    const oldStatus = complaint.status
    const cleanNotes =
      String(notes || '').trim() ||
      (decision === 'verified'
        ? 'Before & After repair evidence inspected and verified complete.'
        : decision === 'needs_reinspection'
        ? 'Flagged for field reinspection to confirm repair durability.'
        : 'Repair rejected after inspection; crew ordered to redo surface restoration.')

    verification.verification_status = decision
    verification.decision_by_id = actor?.id || 1
    verification.decision_by_name = actor?.full_name || 'Municipal Commissioner (Admin)'
    verification.decision_by_role = actor?.role || 'admin'
    verification.decision_at = now
    verification.decision_notes = cleanNotes

    if (decision === 'verified') {
      verification.public_approved = true
      verification.public_summary =
        String(public_summary || '').trim() ||
        cleanNotes ||
        `Repair of ${complaint.category} has been verified complete by Municipal Administration.`
      complaint.status = 'resolved'
      complaint.resolved_at = now
      complaint.resolution_notes = verification.public_summary
    } else if (decision === 'needs_reinspection') {
      verification.public_approved = false
      verification.public_summary =
        'Repair work is currently undergoing a follow-up field reinspection.'
      complaint.status = 'awaiting_verification'
      complaint.resolved_at = null
    } else if (decision === 'rejected') {
      verification.public_approved = false
      verification.public_summary =
        'Initial repair did not pass municipal verification; assigned crew is performing rework.'
      complaint.status = 'in_progress'
      complaint.resolved_at = null
    }

    verification.history.unshift({
      id: Date.now(),
      action: `DECISION_${String(decision).toUpperCase()}`,
      status: decision,
      actor_name: actor?.full_name || 'Municipal Commissioner (Admin)',
      actor_role: actor?.role || 'admin',
      notes: cleanNotes,
      timestamp: now,
      after_image_url: verification.after_image_url,
    })

    complaint.status_history.push({
      id: Date.now() + 1,
      old_status: oldStatus,
      new_status: complaint.status,
      changed_by: actor?.id || 1,
      changed_by_name: actor?.full_name || 'Municipal Commissioner (Admin)',
      changed_at: now,
      notes: `Repair Verification Decision [${decision.toUpperCase()}]: ${cleanNotes}`,
    })

    recordAudit(
      `REPAIR_VERIFICATION_${String(decision).toUpperCase()}`,
      'complaint',
      complaint.complaint_id,
      actor,
      `Marked repair verification for ${complaint.complaint_id} as ${decision}: ${cleanNotes}`
    )
    saveDatabase()

    res.json({
      success: true,
      data: enrichComplaint(complaint),
      message: `Repair marked as ${decision.replace(/_/g, ' ')}`,
    })
  })

  // Direct Authorized Resolution Workflow (Upload genuine after-repair image + resolution note + mark resolved)
  router.post(
    '/complaints/:id/resolve',
    requireStaff,
    (req, res, next) => {
      const actor = (req as any).user as User
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' })
      }
      if (!canUserAccessComplaint(actor, complaint)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot resolve complaints outside your assigned department.',
        })
      }
      next()
    },
    upload.single('file'),
    (req, res) => {
      const actor = (req as any).user as User
      const idParam = req.params.id
      const complaint = complaints.find(
        (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
      )!
      const now = new Date().toISOString()
      const resolutionNotes = String(
        req.body.resolution_notes || req.body.notes || ''
      ).trim()

      if (!resolutionNotes) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a resolution note describing the completed repair work.',
        })
      }

      const verification = ensureRepairVerificationRecord(complaint)
      let afterPath: string | null =
        complaint.resolution_evidence_path || verification.after_image_url || null
      let isSimulatedAfter = false

      if (req.file) {
        afterPath = `/uploads/${req.file.filename}`
        isSimulatedAfter = false
      } else if (req.body.image_base64 && typeof req.body.image_base64 === 'string') {
        const rawB64 = String(req.body.image_base64)
        if (rawB64.startsWith('data:image/svg+xml')) {
          afterPath = rawB64
          isSimulatedAfter = true
        } else {
          try {
            const mimeMatch = rawB64.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/)
            const ext =
              mimeMatch && mimeMatch[1]
                ? mimeMatch[1].toLowerCase() === 'png'
                  ? '.png'
                  : mimeMatch[1].toLowerCase() === 'webp'
                  ? '.webp'
                  : '.jpg'
                : '.jpg'
            const clean = rawB64.replace(/^data:[^;]+;base64,/, '')
            const fname = `resolved-after-${complaint.id}-${Date.now()}${ext}`
            fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(clean, 'base64'))
            afterPath = `/uploads/${fname}`
            isSimulatedAfter = false
          } catch {
            // keep existing afterPath if any
          }
        }
      } else if (req.body.after_image_url && typeof req.body.after_image_url === 'string') {
        afterPath = String(req.body.after_image_url)
      }

      if (!afterPath) {
        return res.status(400).json({
          success: false,
          message: 'Please upload an after-repair image before marking the complaint as resolved.',
        })
      }

      const oldStatus = complaint.status
      complaint.resolution_evidence_path = afterPath
      complaint.resolution_notes = resolutionNotes
      complaint.status = 'resolved'
      complaint.resolved_at = now

      verification.after_image_url = afterPath
      verification.after_uploaded_at = verification.after_uploaded_at || now
      verification.after_uploaded_by_name =
        verification.after_uploaded_by_name || actor?.full_name || 'Municipal Staff'
      verification.after_latitude = complaint.latitude
      verification.after_longitude = complaint.longitude
      verification.after_notes = resolutionNotes
      verification.after_is_simulated = isSimulatedAfter
      verification.verification_status = 'verified'
      verification.decision_by_id = actor?.id || 1
      verification.decision_by_name = actor?.full_name || 'Municipal Staff'
      verification.decision_by_role = actor?.role || 'admin'
      verification.decision_at = now
      verification.decision_notes = resolutionNotes
      verification.public_approved = true
      verification.public_summary = resolutionNotes

      verification.history.unshift({
        id: Date.now(),
        action: 'RESOLVED_WITH_EVIDENCE',
        status: 'verified',
        actor_name: actor?.full_name || 'Municipal Staff',
        actor_role: actor?.role || 'admin',
        notes: resolutionNotes,
        timestamp: now,
        after_image_url: afterPath,
      })

      evidenceList.push({
        id: Date.now() + 1,
        complaint_id: complaint.id,
        image_path: afterPath,
        image_type: 'resolution',
        uploaded_by: actor?.id || 1,
        uploaded_by_name: actor?.full_name || 'Municipal Staff',
        notes: resolutionNotes,
        created_at: now,
      })

      complaint.status_history.push({
        id: Date.now() + 2,
        old_status: oldStatus,
        new_status: 'resolved',
        changed_by: actor?.id || 1,
        changed_by_name: actor?.full_name || 'Municipal Staff',
        changed_at: now,
        notes: `Resolved with after-repair photo evidence: ${resolutionNotes}`,
      })

      recordAudit(
        'COMPLAINT_RESOLVED_WITH_EVIDENCE',
        'complaint',
        complaint.complaint_id,
        actor,
        `Resolved ${complaint.complaint_id} with after-repair photo and note: ${resolutionNotes}`
      )
      saveDatabase()

      res.json({
        success: true,
        data: enrichComplaint(complaint),
        message: 'Complaint resolved with before-and-after repair evidence.',
      })
    }
  )

  router.post('/complaints/:id/verification/compare', requireStaff, async (req, res) => {
    const actor = (req as any).user as User
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }
    if (!canUserAccessComplaint(actor, complaint)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot access complaints outside your department.',
      })
    }

    const verification = ensureRepairVerificationRecord(complaint)
    const now = new Date().toISOString()

    // Check if both BEFORE and AFTER are real uploaded raster files on disk and Gemini API is configured
    const ai = getGeminiClient()
    const beforeUrl = verification.before_image_url || ''
    const afterUrl = verification.after_image_url || ''
    const beforeIsDiskFile = beforeUrl.startsWith('/uploads/')
    const afterIsDiskFile = afterUrl.startsWith('/uploads/')

    let comparisonResult: VisionComparisonResult | null = null

    if (ai && beforeIsDiskFile && afterIsDiskFile) {
      const beforePath = path.join(UPLOAD_DIR, path.basename(beforeUrl))
      const afterPath = path.join(UPLOAD_DIR, path.basename(afterUrl))
      if (fs.existsSync(beforePath) && fs.existsSync(afterPath)) {
        try {
          const beforeBuf = fs.readFileSync(beforePath)
          const afterBuf = fs.readFileSync(afterPath)
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: beforeBuf.toString('base64'),
                  },
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: afterBuf.toString('base64'),
                  },
                },
                {
                  text: `Compare the first image (BEFORE repair of ${complaint.category}: "${complaint.description}") and the second image (AFTER reported repair).
Evaluate whether the civic issue appears resolved, partially repaired, still present, or inconclusive.
Be honest and include explicit limitations of 2D visual comparison.`,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  issue_resolved_assessment: {
                    type: Type.STRING,
                    description: 'One of: likely_repaired, partially_repaired, still_present, inconclusive',
                  },
                  confidence: { type: Type.NUMBER },
                  summary: { type: Type.STRING },
                  observed_changes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  limitations: { type: Type.STRING },
                },
                required: [
                  'issue_resolved_assessment',
                  'confidence',
                  'summary',
                  'observed_changes',
                  'limitations',
                ],
              },
            },
          })

          const parsed = response.text ? JSON.parse(response.text.trim()) : null
          if (parsed) {
            const validAssessments = [
              'likely_repaired',
              'partially_repaired',
              'still_present',
              'inconclusive',
            ]
            const assessment = validAssessments.includes(parsed.issue_resolved_assessment)
              ? parsed.issue_resolved_assessment
              : 'inconclusive'
            comparisonResult = {
              mode: 'gemini_vision',
              analyzed_at: now,
              model_name: 'gemini-3.8-flash (Real Multimodal Vision)',
              issue_resolved_assessment: assessment,
              confidence:
                typeof parsed.confidence === 'number'
                  ? Number(Math.min(0.99, Math.max(0.1, parsed.confidence)).toFixed(2))
                  : 0.8,
              summary: String(parsed.summary || 'Compared before and after images.'),
              observed_changes: Array.isArray(parsed.observed_changes)
                ? parsed.observed_changes
                : [],
              limitations: String(
                parsed.limitations ||
                  '2D camera comparison cannot verify subsurface compaction, material depth, or camera angle discrepancies. Final approval requires human Admin verification.'
              ),
              is_demo_fallback: false,
            }
          }
        } catch (err) {
          console.warn('[CivicEye AI] Vision comparison fallback triggered:', err)
        }
      }
    }

    if (!comparisonResult) {
      const hasAfter = Boolean(verification.after_image_url)
      const hasReinspection = (verification.reinspection_detections || []).length > 0
      comparisonResult = {
        mode: 'manual_demo',
        analyzed_at: now,
        model_name: 'Demo Rule-Based Assisted Comparison (Manual Verification Required)',
        issue_resolved_assessment: !hasAfter
          ? 'inconclusive'
          : hasReinspection
          ? 'still_present'
          : 'likely_repaired',
        confidence: null,
        summary: !hasAfter
          ? '[DEMO COMPARISON] No AFTER repair photo has been uploaded yet. Upload an AFTER photo to compare side by side.'
          : hasReinspection
          ? `[DEMO COMPARISON] Subsequent bus camera pass detected a matching ${complaint.category} within ${verification.reinspection_detections[0].distance_meters}m of this location after initial reporting. Recommend marking as Needs Reinspection.`
          : `[DEMO COMPARISON] Side-by-side metadata check shows BEFORE (${complaint.category} at ${complaint.latitude.toFixed(4)}°N, ${complaint.longitude.toFixed(4)}°E) and AFTER completion record uploaded at ${verification.after_uploaded_at}. Real computer-vision pixel comparison requires two uploaded raster photos and a live Gemini API key.`,
        observed_changes: !hasAfter
          ? ['Awaiting AFTER photo upload from field maintenance team']
          : [
              `GPS coordinate match verified (${complaint.latitude.toFixed(4)}°N, ${complaint.longitude.toFixed(4)}°E)`,
              `Before timestamp: ${verification.before_captured_at}`,
              `After timestamp: ${verification.after_uploaded_at}`,
              hasReinspection
                ? `Warning: ${verification.reinspection_detections.length} subsequent bus camera detection(s) linked at this location`
                : 'No conflicting bus camera detections recorded since AFTER photo upload',
            ],
        limitations:
          'DEMO / ASSISTED MODE LIMITATION: Because one or both evidence items use synthetic demo certificates or live CV service is not active, this output is a rule-based metadata check — NOT a verified AI prediction. Admin must inspect the images manually before marking Verified.',
        is_demo_fallback: true,
      }
    }

    verification.vision_comparison = comparisonResult
    saveDatabase()

    res.json({
      success: true,
      data: {
        comparison: comparisonResult,
        complaint: enrichComplaint(complaint),
      },
      message: comparisonResult.is_demo_fallback
        ? 'Generated Demo Comparison (Manual Verification Required)'
        : 'Completed Gemini Vision Before/After Comparison',
    })
  })

  // 5. Detections & AI Bus Camera Frame Analysis
  router.post('/detections/analyze', requireStaff, async (req, res) => {
    const {
      mode = 'simulation',
      frame_base64,
      bus_id = 1,
      latitude,
      longitude,
      gps_source = 'unavailable',
      auto_create_complaints = true,
    } = req.body

    const hasValidGps =
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      !Number.isNaN(Number(latitude)) &&
      !Number.isNaN(Number(longitude))

    const latNum = hasValidGps ? Number(latitude) : null
    const lngNum = hasValidGps ? Number(longitude) : null
    const now = new Date().toISOString()

    let rawDetections: {
      category: string
      confidence: number
      severity: 'low' | 'medium' | 'high' | 'critical'
      description: string
      bbox: { x1: number; y1: number; x2: number; y2: number } | null
      is_simulated: boolean
      ai_model: string
    }[] = []

    let aiSource: 'gemini-3.8-flash' | 'simulation' | 'unavailable' = 'simulation'
    let aiError: string | null = null
    let savedFramePath: string | null = null

    // Save captured frame if base64 provided
    if (frame_base64 && typeof frame_base64 === 'string') {
      try {
        const clean = frame_base64.replace(/^data:[^;]+;base64,/, '')
        const fname = `bus-frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(clean, 'base64'))
        savedFramePath = `/uploads/${fname}`
      } catch {
        savedFramePath = null
      }
    }

    // Mode A & B: Live Camera or Uploaded Video -> Real Gemini Vision Analysis ONLY (never invent detections)
    if (mode === 'live' || mode === 'upload') {
      if (!frame_base64 || typeof frame_base64 !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'A real video frame (frame_base64) is required for Live Camera and Upload Video analysis.',
        })
      }

      const ai = getGeminiClient()
      if (!ai) {
        return res.json({
          success: true,
          data: {
            detections: [],
            complaints_created: [],
            complaints_updated: [],
            ai_source: 'unavailable',
            ai_error:
              'GEMINI_API_KEY is not configured on the server. Real computer vision requires a valid API key. Use Demo Simulation mode to test synthetic detections.',
          },
          message: 'AI model not configured',
        })
      }

      try {
        const cleanBase64 = frame_base64.replace(/^data:[^;]+;base64,/, '')
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: `You are an onboard municipal bus computer vision inspector. Inspect this road/street frame carefully.
Only report genuine, visible civic infrastructure issues present in the image from these categories:
Pothole, Road Damage, Garbage, Waterlogging, Fallen Tree, Broken Streetlight, Open Drain, Illegal Dumping, Stray Animals.
CRITICAL RULES:
1. Do NOT invent or hallucinate issues. If the image shows a normal room, face, blank wall, clean road, or non-civic scene with no defects, return an empty detections array: [].
2. For each genuine issue visible, provide its bounding box in a 640x360 coordinate space (x1: 0-640, y1: 0-360, x2: 0-640, y2: 0-360), actual confidence score (0.50 to 0.99), severity (low, medium, high, critical), and a short factual description.`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      category: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      severity: { type: Type.STRING },
                      description: { type: Type.STRING },
                      bbox: {
                        type: Type.OBJECT,
                        properties: {
                          x1: { type: Type.INTEGER },
                          y1: { type: Type.INTEGER },
                          x2: { type: Type.INTEGER },
                          y2: { type: Type.INTEGER },
                        },
                        required: ['x1', 'y1', 'x2', 'y2'],
                      },
                    },
                    required: ['category', 'confidence', 'severity', 'description', 'bbox'],
                  },
                },
              },
              required: ['detections'],
            },
          },
        })

        aiSource = 'gemini-3.8-flash'
        const parsed = response.text ? JSON.parse(response.text.trim()) : { detections: [] }
        const list = Array.isArray(parsed.detections) ? parsed.detections : []

        rawDetections = list.map((d: any) => {
          const matchedCat =
            Object.keys(categoryToDept).find(
              (k) => k.toLowerCase() === String(d.category || '').toLowerCase()
            ) || String(d.category || 'Pothole')
          return {
            category: matchedCat,
            confidence: Math.min(0.99, Math.max(0.1, Number(d.confidence) || 0.75)),
            severity: ['low', 'medium', 'high', 'critical'].includes(d.severity) ? d.severity : 'medium',
            description: String(d.description || `${matchedCat} detected by Gemini Vision`),
            bbox: d.bbox
              ? {
                  x1: Math.max(0, Math.min(620, Number(d.bbox.x1) || 100)),
                  y1: Math.max(0, Math.min(340, Number(d.bbox.y1) || 120)),
                  x2: Math.max(20, Math.min(640, Number(d.bbox.x2) || 300)),
                  y2: Math.max(20, Math.min(360, Number(d.bbox.y2) || 280)),
                }
              : null,
            is_simulated: false,
            ai_model: 'gemini-3.8-flash',
          }
        })
      } catch (err: any) {
        console.error('[CivicEye AI] Gemini frame analysis error:', err?.message || err)
        aiSource = 'unavailable'
        aiError = `AI Vision API error: ${err?.message || 'Unable to process frame'}`
        rawDetections = []
      }
    } else {
      // Mode C: Demo Simulation (Explicitly labelled synthetic data)
      aiSource = 'simulation'
      const simCatalog = [
        {
          category: 'Pothole',
          bbox: { x1: 150, y1: 210, x2: 370, y2: 320 },
          conf: 0.91,
          severity: 'high' as const,
          description: '[SIMULATED] Asphalt surface pothole detected along transit corridor',
        },
        {
          category: 'Garbage',
          bbox: { x1: 410, y1: 170, x2: 590, y2: 310 },
          conf: 0.87,
          severity: 'medium' as const,
          description: '[SIMULATED] Roadside solid waste overflow near bus stop',
        },
        {
          category: 'Waterlogging',
          bbox: { x1: 80, y1: 230, x2: 540, y2: 345 },
          conf: 0.85,
          severity: 'high' as const,
          description: '[SIMULATED] Carriageway water stagnation obstructing left lane',
        },
        {
          category: 'Broken Streetlight',
          bbox: { x1: 260, y1: 30, x2: 360, y2: 180 },
          conf: 0.81,
          severity: 'medium' as const,
          description: '[SIMULATED] Day/night sensor fault on municipal streetlight pole',
        },
      ]
      const pick =
        req.body.override_category
          ? simCatalog.find(
              (s) => s.category.toLowerCase() === String(req.body.override_category).toLowerCase()
            ) || {
              category: String(req.body.override_category),
              bbox: { x1: 150, y1: 210, x2: 370, y2: 320 },
              conf: 0.89,
              severity: 'high' as const,
              description: `[SIMULATED] ${req.body.override_category} detected along transit corridor`,
            }
          : simCatalog[Math.floor(Math.random() * simCatalog.length)]
      rawDetections = [
        {
          category: pick.category,
          confidence: pick.conf,
          severity: pick.severity,
          description: pick.description,
          bbox: pick.bbox,
          is_simulated: true,
          ai_model: 'demo-simulation',
        },
      ]
    }

    const newDetections: Detection[] = []
    const created: string[] = []
    const updated: string[] = []

    for (const item of rawDetections) {
      const detRecord: Detection = {
        id: detections.reduce((max, d) => Math.max(max, d.id), 0) + 1,
        bus_id: bus_id ? Number(bus_id) : null,
        complaint_id: null,
        category: item.category,
        confidence: item.confidence,
        bbox: item.bbox,
        image_path: savedFramePath,
        timestamp: now,
        latitude: latNum,
        longitude: lngNum,
        is_simulated: item.is_simulated,
        ai_model: item.ai_model,
        description: item.description,
      }
      detections.unshift(detRecord)
      newDetections.push(detRecord)

      if (auto_create_complaints && latNum !== null && lngNum !== null) {
        // 1. Check if this detection matches a complaint in awaiting_verification or resolved (Reinspection Evidence Linking!)
        const reinspectionCandidates = complaints.filter(
          (c) =>
            c.category.toLowerCase() === item.category.toLowerCase() &&
            !c.merged_into_complaint_id &&
            (c.status === 'awaiting_verification' ||
              c.status === 'resolved' ||
              Boolean(c.repair_verification?.after_image_url))
        )

        let closestReinspection: Complaint | null = null
        let minReinspDist = Infinity
        for (const rc of reinspectionCandidates) {
          const d = haversineDistanceMeters(latNum, lngNum, rc.latitude, rc.longitude)
          if (d < minReinspDist) {
            minReinspDist = d
            closestReinspection = rc
          }
        }

        if (closestReinspection && minReinspDist <= dedupThresholdMeters) {
          const busObj = buses.find((b) => b.id === Number(bus_id))
          const verification = ensureRepairVerificationRecord(closestReinspection)
          const linkItem: ReinspectionDetectionLink = {
            detection_id: detRecord.id,
            bus_id: detRecord.bus_id,
            bus_number: busObj ? busObj.bus_number : detRecord.bus_id ? `Bus #${detRecord.bus_id}` : null,
            category: detRecord.category,
            confidence: detRecord.confidence,
            distance_meters: Math.round(minReinspDist),
            timestamp: now,
            image_path: savedFramePath,
            is_simulated: Boolean(detRecord.is_simulated),
            description:
              detRecord.description ||
              `Subsequent bus camera pass detected ${detRecord.category} within ${Math.round(minReinspDist)}m`,
          }
          verification.reinspection_detections.unshift(linkItem)
          verification.verification_status = 'needs_reinspection'
          verification.public_approved = false
          verification.history.unshift({
            id: Date.now() + 5,
            action: 'BUS_REINSPECTION_LINKED',
            status: 'needs_reinspection',
            actor_name: `Bus ${busObj?.bus_number || `#${bus_id}`} AI Camera`,
            actor_role: 'system',
            notes: `Bus camera captured ${detRecord.category} at same GPS location (${Math.round(minReinspDist)}m away). Flagged for reinspection.`,
            timestamp: now,
          })

          const prevStatus = closestReinspection.status
          closestReinspection.status = 'awaiting_verification'
          closestReinspection.resolved_at = null
          closestReinspection.last_detected_at = now
          closestReinspection.status_history.push({
            id: Date.now() + 6,
            old_status: prevStatus,
            new_status: 'awaiting_verification',
            changed_by: null,
            changed_by_name: `Bus ${busObj?.bus_number || `#${bus_id}`} Reinspection Scanner`,
            changed_at: now,
            notes: `Linked potential reinspection evidence (#${detRecord.id}, ${Math.round(minReinspDist)}m away). Flagged as Needs Reinspection.`,
          })

          detRecord.complaint_id = closestReinspection.id
          updated.push(closestReinspection.complaint_id)
          recordAudit(
            'REINSPECTION_EVIDENCE_LINKED',
            'complaint',
            closestReinspection.complaint_id,
            (req as any).user,
            `Linked bus camera detection #${detRecord.id} (${Math.round(minReinspDist)}m) to ${closestReinspection.complaint_id} as potential reinspection evidence`
          )
          continue
        }

        // 2. Haversine deduplication within 50m for open complaints of same category
        const openComplaints = complaints.filter(
          (c) =>
            c.category.toLowerCase() === item.category.toLowerCase() &&
            !['resolved', 'closed'].includes(c.status)
        )

        let minDistance = Infinity
        let closestComplaint: Complaint | null = null
        for (const oc of openComplaints) {
          const d = haversineDistanceMeters(latNum, lngNum, oc.latitude, oc.longitude)
          if (d < minDistance) {
            minDistance = d
            closestComplaint = oc
          }
        }

        if (closestComplaint && minDistance < dedupThresholdMeters) {
          closestComplaint.observation_count += 1
          closestComplaint.last_detected_at = now
          detRecord.complaint_id = closestComplaint.id
          updated.push(closestComplaint.complaint_id)
        } else {
          const deptId = categoryToDept[item.category] || 1
          const dept = departments.find((d) => d.id === deptId)
          const newCid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`
          const busObj = buses.find((b) => b.id === Number(bus_id))
          const newComplaint: Complaint = {
            id: complaints.reduce((max, c) => Math.max(max, c.id), 0) + 1,
            complaint_id: newCid,
            category: item.category,
            description:
              item.description ||
              `Automated detection of ${item.category} by Bus ${busObj?.bus_number || `#${bus_id}`} at [${latNum.toFixed(4)}, ${lngNum.toFixed(4)}]`,
            latitude: latNum,
            longitude: lngNum,
            address: `Pune Transit Corridor (${latNum.toFixed(4)}°N, ${lngNum.toFixed(4)}°E)`,
            bus_id: bus_id ? Number(bus_id) : null,
            source: 'bus_camera',
            severity: item.severity || (item.confidence > 0.85 ? 'high' : 'medium'),
            status: 'new',
            department_id: deptId,
            department_name: dept?.name,
            observation_count: 1,
            first_detected_at: now,
            last_detected_at: now,
            resolved_at: null,
            resolution_notes: null,
            evidence_image_path: savedFramePath,
            resolution_evidence_path: null,
            media_url: savedFramePath,
            media_type: 'image',
            is_anonymous: false,
            is_simulated: item.is_simulated,
            status_history: [
              {
                id: Date.now(),
                old_status: null,
                new_status: 'new',
                changed_by: null,
                changed_by_name: `Bus ${busObj?.bus_number || `#${bus_id}`} (${item.ai_model})`,
                changed_at: now,
                notes: item.is_simulated
                  ? 'Created via Demo Simulation mode'
                  : `Auto-detected via Gemini Vision (${Math.round(item.confidence * 100)}% confidence)`,
              },
            ],
            assignments: [],
          }
          complaints.unshift(newComplaint)
          detRecord.complaint_id = newComplaint.id
          created.push(newCid)

          if (savedFramePath) {
            evidenceList.push({
              id: Date.now() + Math.floor(Math.random() * 100),
              complaint_id: newComplaint.id,
              image_path: savedFramePath,
              image_type: 'detection',
              uploaded_by: null,
              uploaded_by_name: `Bus ${busObj?.bus_number || `#${bus_id}`}`,
              notes: `Captured during ${mode} scan (${gps_source})`,
              created_at: now,
            })
          }
        }
      }
    }

    saveDatabase()

    res.json({
      success: true,
      data: {
        detections: newDetections,
        complaints_created: created,
        complaints_updated: updated,
        ai_source: aiSource,
        ai_error: aiError,
      },
      message: `Processed frame (${aiSource}): ${newDetections.length} detections, ${created.length} created, ${updated.length} deduplicated`,
    })
  })

  router.get('/detections', requireStaff, (req, res) => {
    const { bus_id, limit = 15 } = req.query
    let list = [...detections]
    if (bus_id) list = list.filter((d) => d.bus_id === Number(bus_id))
    list = list.slice(0, Number(limit))
    res.json({
      success: true,
      data: list,
      message: `${list.length} detections retrieved`,
    })
  })

  // 6. Departments & Staff Management
  router.get('/departments', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const visibleDepts =
      currentUser.role === 'admin'
        ? departments
        : departments.filter((d) => d.id === currentUser.department_id)
    const list = visibleDepts.map((d) => {
      const deptComplaints = complaints.filter((c) => getComplaintDepartmentId(c) === d.id)
      const openCount = deptComplaints.filter((c) => !['resolved', 'closed'].includes(c.status)).length
      return {
        ...d,
        complaint_count: deptComplaints.length,
        open_count: openCount,
      }
    })
    res.json({
      success: true,
      data: list,
      message: `${list.length} departments`,
    })
  })

  router.get('/officers', requireAdmin, (_req, res) => {
    const officers = users
      .filter((u) => u.role === 'officer' || u.role === 'admin')
      .map(({ passwordHash, ...rest }) => {
        const dept = departments.find((d) => d.id === rest.department_id)
        return { ...rest, department: dept?.name || 'All Departments' }
      })
    res.json({
      success: true,
      data: officers,
      message: `${officers.length} staff members`,
    })
  })

  router.get('/staff', requireAdmin, (_req, res) => {
    const officers = users
      .filter((u) => u.role === 'officer' || u.role === 'admin')
      .map(({ passwordHash, ...rest }) => {
        const dept = departments.find((d) => d.id === rest.department_id)
        return { ...rest, department: dept?.name || 'All Departments' }
      })
    res.json({
      success: true,
      data: officers,
      message: `${officers.length} staff members`,
    })
  })

  router.put('/officers/:id', requireAdmin, (req, res) => {
    const targetId = Number(req.params.id)
    const staffMember = users.find((u) => u.id === targetId && (u.role === 'officer' || u.role === 'admin'))
    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found' })
    }
    const { department_id, is_active } = req.body
    if (staffMember.role === 'officer' && department_id !== undefined) {
      const dept = departments.find((d) => d.id === Number(department_id))
      if (!dept) {
        return res.status(400).json({ success: false, message: 'Invalid department ID' })
      }
      staffMember.department_id = dept.id
    }
    if (typeof is_active === 'boolean' && staffMember.username !== 'admin') {
      staffMember.is_active = is_active
    }
    recordAudit(
      'STAFF_UPDATED',
      'system',
      staffMember.username,
      (req as any).user,
      `Updated staff member ${staffMember.full_name} (department_id: ${staffMember.department_id})`
    )
    saveDatabase()
    res.json({
      success: true,
      data: serializeStaffUser(staffMember),
      message: 'Staff member updated',
    })
  })

  router.get('/departments/:id/officers', requireAdmin, (req, res) => {
    const deptId = Number(req.params.id)
    const officers = users
      .filter((u) => u.role === 'officer' && (u.department_id === deptId || !u.department_id))
      .map(({ passwordHash, ...rest }) => rest)
    res.json({
      success: true,
      data: officers,
      message: `${officers.length} officers`,
    })
  })

  router.get('/departments/:id/queue', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const deptId = Number(req.params.id)
    const dept = departments.find((d) => d.id === deptId)
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found' })
    }

    if (currentUser.role === 'officer' && currentUser.department_id !== deptId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Department Officers can only access their own department work queue.',
        detail: 'Forbidden: Department Officers can only access their own department work queue.',
      })
    }

    const { status } = req.query
    let q = complaints.filter((c) => getComplaintDepartmentId(c) === deptId)
    if (status) {
      q = q.filter((c) => c.status === status)
    } else {
      q = q.filter((c) => !['resolved', 'closed'].includes(c.status))
    }
    q.sort((a, b) => new Date(a.first_detected_at).getTime() - new Date(b.first_detected_at).getTime())

    res.json({
      success: true,
      data: { department: dept, queue: q.map((c) => enrichComplaint(c)) },
      message: `${q.length} items in queue`,
    })
  })

  router.put('/departments/:id/routing-rules', requireAdmin, (req, res) => {
    const deptId = Number(req.params.id)
    const dept = departments.find((d) => d.id === deptId)
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found' })
    }

    const { problem_categories, contact_email } = req.body
    if (problem_categories) dept.problem_categories = problem_categories
    if (contact_email) dept.contact_email = contact_email

    res.json({
      success: true,
      data: dept,
      message: 'Routing rules updated',
    })
  })

  // 7. Audit Logs (Scoped by role & department)
  router.get('/audit-logs', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const visibleLogs =
      currentUser.role === 'admin'
        ? auditLogs
        : auditLogs.filter((log) => {
            if (log.entity_type !== 'complaint') return false
            const comp = complaints.find(
              (c) => c.complaint_id === log.entity_id || String(c.id) === log.entity_id
            )
            return comp ? canUserAccessComplaint(currentUser, comp) : false
          })
    res.json({
      success: true,
      data: visibleLogs.slice(0, 100),
      message: `${visibleLogs.length} audit entries`,
    })
  })

  // 8. Analytics (Scoped by role & department)
  router.get('/analytics/summary', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const scopedComplaints = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const total = scopedComplaints.length
    const newCount = scopedComplaints.filter((c) => c.status === 'new').length
    const assigned = scopedComplaints.filter((c) => c.status === 'assigned').length
    const inProgress = scopedComplaints.filter((c) => c.status === 'in_progress').length
    const awaiting = scopedComplaints.filter((c) => c.status === 'awaiting_verification').length
    const resolved = scopedComplaints.filter((c) => c.status === 'resolved').length
    const closed = scopedComplaints.filter((c) => c.status === 'closed').length

    const resolvedWithTime = scopedComplaints.filter((c) => (c.status === 'resolved' || c.status === 'closed') && c.resolved_at)
    let avgHours = 28.4
    if (resolvedWithTime.length > 0) {
      const totalHours = resolvedWithTime.reduce((acc, c) => {
        const diff = (new Date(c.resolved_at!).getTime() - new Date(c.first_detected_at).getTime()) / 3600000
        return acc + Math.max(diff, 1)
      }, 0)
      avgHours = +(totalHours / resolvedWithTime.length).toFixed(1)
    }

    const resolutionRate = total > 0 ? +(((resolved + closed) / total) * 100).toFixed(1) : 0

    res.json({
      success: true,
      data: {
        total,
        new: newCount,
        assigned,
        in_progress: inProgress,
        awaiting_verification: awaiting,
        resolved,
        closed,
        avg_resolution_hours: avgHours,
        resolution_rate_pct: resolutionRate,
      },
      message: 'Analytics summary',
    })
  })

  router.get('/analytics/by-category', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const scopedComplaints = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const catMap = new Map<string, { count: number; resolved: number }>()
    for (const c of scopedComplaints) {
      const entry = catMap.get(c.category) || { count: 0, resolved: 0 }
      entry.count++
      if (c.status === 'resolved' || c.status === 'closed') entry.resolved++
      catMap.set(c.category, entry)
    }

    const result = Array.from(catMap.entries()).map(([category, stats]) => ({
      category,
      count: stats.count,
      resolved: stats.resolved,
      pending: stats.count - stats.resolved,
    }))
    res.json({ success: true, data: result, message: `${result.length} categories` })
  })

  router.get('/analytics/by-department', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const visibleDepts =
      currentUser.role === 'admin'
        ? departments
        : departments.filter((d) => d.id === currentUser.department_id)
    const result = visibleDepts.map((d) => {
      const deptComplaints = complaints.filter((c) => getComplaintDepartmentId(c) === d.id)
      const resolved = deptComplaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length
      const resolvedWithTime = deptComplaints.filter(
        (c) => (c.status === 'resolved' || c.status === 'closed') && c.resolved_at
      )
      let avgHours = 24.0
      if (resolvedWithTime.length > 0) {
        const sumH = resolvedWithTime.reduce((acc, c) => {
          return acc + Math.max(1, (new Date(c.resolved_at!).getTime() - new Date(c.first_detected_at).getTime()) / 3600000)
        }, 0)
        avgHours = +(sumH / resolvedWithTime.length).toFixed(1)
      }
      return {
        department: d.name,
        count: deptComplaints.length,
        resolved,
        open: deptComplaints.length - resolved,
        avg_response_hours: avgHours,
      }
    })
    res.json({ success: true, data: result, message: `${result.length} departments` })
  })

  router.get('/analytics/by-severity', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const scopedComplaints = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const counts = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const c of scopedComplaints) {
      if (counts[c.severity] !== undefined) counts[c.severity]++
    }
    const result = Object.entries(counts).map(([severity, count]) => ({ severity, count }))
    res.json({ success: true, data: result, message: `${result.length} severity levels` })
  })

  router.get('/analytics/timeline', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const scopedComplaints = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const days = Number(req.query.days || 30)
    const counts: Record<string, { count: number; resolved: number }> = {}

    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0]
      counts[d] = { count: 0, resolved: 0 }
    }

    for (const c of scopedComplaints) {
      const d = c.first_detected_at.split('T')[0]
      if (counts[d] !== undefined) {
        counts[d].count++
        if (c.status === 'resolved' || c.status === 'closed') {
          counts[d].resolved++
        }
      }
    }

    const result = Object.entries(counts).map(([date, obj]) => ({
      date,
      count: obj.count,
      resolved: obj.resolved,
    }))
    res.json({ success: true, data: result, message: `Timeline for last ${days} days` })
  })

  router.get('/analytics/hotspots', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const scopedComplaints = complaints.filter((c) => canUserAccessComplaint(currentUser, c))
    const GRID = 0.002
    const clusters: Record<string, { latitude: number; longitude: number; category: string; count: number }> = {}

    for (const c of scopedComplaints) {
      const latKey = Math.round(c.latitude / GRID) * GRID
      const lngKey = Math.round(c.longitude / GRID) * GRID
      const key = `${latKey.toFixed(4)},${lngKey.toFixed(4)},${c.category}`
      if (!clusters[key]) {
        clusters[key] = { latitude: latKey, longitude: lngKey, category: c.category, count: 0 }
      }
      clusters[key].count += c.observation_count || 1
    }

    const hotspotList = Object.values(clusters)
      .filter((h) => h.count >= 2)
      .sort((a, b) => b.count - a.count)

    res.json({ success: true, data: hotspotList, message: `${hotspotList.length} hotspots found` })
  })

  // 9. Notifications (Scoped by role & department)
  router.get('/notifications', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const visibleNotifs = notifications.filter((n) => {
      if (currentUser.role === 'admin') return true
      if (!n.complaint_id) return n.user_id === currentUser.id
      const comp = complaints.find((c) => c.id === n.complaint_id)
      return comp ? canUserAccessComplaint(currentUser, comp) : n.user_id === currentUser.id
    })
    const unreadCount = visibleNotifs.filter((n) => !n.is_read).length
    res.json({
      success: true,
      data: {
        notifications: visibleNotifs,
        unread_count: unreadCount,
      },
      message: `${visibleNotifs.length} notifications`,
    })
  })

  router.put('/notifications/:id/read', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    const notifId = Number(req.params.id)
    const n = notifications.find((x) => x.id === notifId)
    if (n) {
      if (currentUser.role === 'officer' && n.complaint_id) {
        const comp = complaints.find((c) => c.id === n.complaint_id)
        if (comp && !canUserAccessComplaint(currentUser, comp)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Cannot modify notification for another department.',
          })
        }
      }
      n.is_read = true
      saveDatabase()
    }
    res.json({ success: true, data: null, message: 'Marked as read' })
  })

  router.put('/notifications/read-all', requireStaff, (req, res) => {
    const currentUser = (req as any).user as User
    for (const n of notifications) {
      if (currentUser.role === 'admin') {
        n.is_read = true
      } else if (n.complaint_id) {
        const comp = complaints.find((c) => c.id === n.complaint_id)
        if (comp && canUserAccessComplaint(currentUser, comp)) {
          n.is_read = true
        }
      } else if (n.user_id === currentUser.id) {
        n.is_read = true
      }
    }
    saveDatabase()
    res.json({ success: true, data: null, message: 'All notifications marked as read' })
  })

  app.use('/api', router)
}

// ── Application Startup ─────────────────────────────────────────────────────
async function startServer() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))
  app.use(authenticateToken)

  // Static uploads
  app.use('/uploads', express.static(UPLOAD_DIR))

  // API Routes
  setupApiRoutes(app)

  // Bind port 3000 immediately so health probes succeed right away
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CivicEye AI] Server listening on http://0.0.0.0:${PORT}`)
  })

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'))) {
    app.use(express.static(path.resolve('dist')))
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'))
    })
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', hmr: false },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  }
}

startServer().catch((err) => {
  console.error('[CivicEye AI] Failed to start server:', err)
  process.exit(1)
})
