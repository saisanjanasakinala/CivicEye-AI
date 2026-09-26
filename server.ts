import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3000
const SECRET_KEY = process.env.SECRET_KEY || 'civiceye-secret-key-change-in-production-2024'
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

// ── In-Memory Data Models ──────────────────────────────────────────────────
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

interface Bus {
  id: number
  bus_number: string
  registration_number: string
  route_name: string
  driver_name: string
  driver_phone: string
  driver_license: string
  is_active: boolean
  operational_status: string
  last_seen_at: string
  current_latitude: number
  current_longitude: number
  current_speed: number
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
  changed_at: string
  notes: string | null
}

interface Assignment {
  id: number
  complaint_id: number
  assigned_to: number
  assigned_by: number
  assigned_at: string
  notes: string | null
}

interface Evidence {
  id: number
  complaint_id: number
  image_path: string
  image_type: string
  uploaded_by: number | null
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
}

interface Complaint {
  id: number
  complaint_id: string
  category: string
  description: string
  latitude: number
  longitude: number
  bus_id: number | null
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
  address?: string | null
  media_url?: string | null
  media_type?: 'image' | 'video' | null
  is_anonymous?: boolean
  contact_name?: string | null
  contact_phone?: string | null
  status_history: StatusHistory[]
  assignments: Assignment[]
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

// ── Seed Data ───────────────────────────────────────────────────────────────
const departments: Department[] = [
  { id: 1, name: 'Roads & Infrastructure', code: 'ROADS', problem_categories: ['Pothole', 'Road Damage', 'Broken Road', 'Illegal Dumping'], contact_email: 'roads@punecity.gov.in', is_active: true },
  { id: 2, name: 'Sanitation & Waste', code: 'SANITATION', problem_categories: ['Garbage', 'Illegal Dumping', 'Stray Animals'], contact_email: 'sanitation@punecity.gov.in', is_active: true },
  { id: 3, name: 'Parks & Horticulture', code: 'PARKS', problem_categories: ['Fallen Tree', 'Park Maintenance'], contact_email: 'parks@punecity.gov.in', is_active: true },
  { id: 4, name: 'Drainage & Waterways', code: 'DRAINAGE', problem_categories: ['Waterlogging', 'Open Drain', 'Flood Risk'], contact_email: 'drainage@punecity.gov.in', is_active: true },
  { id: 5, name: 'Electrical & Lighting', code: 'ELECTRICAL', problem_categories: ['Broken Streetlight', 'Power Line', 'Electrical Hazard'], contact_email: 'electrical@punecity.gov.in', is_active: true },
]

const users: (User & { passwordHash: string })[] = [
  { id: 1, username: 'admin', full_name: 'Administrator', email: 'admin@civiceye.ai', role: 'admin', department_id: null, is_active: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString(), passwordHash: 'admin123' },
  { id: 2, username: 'officer1', full_name: 'Officer Ramesh (Roads)', email: 'officer1@punecity.gov.in', role: 'officer', department_id: 1, is_active: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString(), passwordHash: 'pass123' },
  { id: 3, username: 'officer2', full_name: 'Officer Suresh (Sanitation)', email: 'officer2@punecity.gov.in', role: 'officer', department_id: 2, is_active: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString(), passwordHash: 'pass123' },
  { id: 4, username: 'citizen1', full_name: 'Citizen Rahul', email: 'citizen1@gmail.com', role: 'citizen', department_id: null, is_active: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString(), passwordHash: 'pass123' },
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

const buses: Bus[] = [
  { id: 1, bus_number: 'PMC-11', registration_number: 'MH-12-CY-1101', route_name: 'Route 11 — Swargate to Katraj', driver_name: 'Ramesh Patil', driver_phone: '+91 98220 11001', driver_license: 'DL-MH12-2015-001', is_active: true, operational_status: 'active', last_seen_at: new Date(Date.now() - 120000).toISOString(), current_latitude: 18.4975, current_longitude: 73.8538, current_speed: 28.5 },
  { id: 2, bus_number: 'PMC-47', registration_number: 'MH-12-CY-4702', route_name: 'Route 47 — Shivajinagar to Hadapsar', driver_name: 'Suresh Kulkarni', driver_phone: '+91 98220 47002', driver_license: 'DL-MH12-2017-047', is_active: true, operational_status: 'active', last_seen_at: new Date(Date.now() - 90000).toISOString(), current_latitude: 18.5265, current_longitude: 73.8602, current_speed: 32.0 },
  { id: 3, bus_number: 'PMC-99', registration_number: 'MH-12-CY-9903', route_name: 'Route 99 — Kothrud to Viman Nagar', driver_name: 'Anil Shinde', driver_phone: '+91 98220 99003', driver_license: 'DL-MH12-2018-099', is_active: true, operational_status: 'active', last_seen_at: new Date(Date.now() - 60000).toISOString(), current_latitude: 18.52, current_longitude: 73.8474, current_speed: 24.0 },
]

const busRoutes: BusRoute[] = buses.map((b, idx) => ({
  id: idx + 1,
  bus_id: b.id,
  name: b.route_name,
  waypoints: PUNE_ROUTES[b.route_name] || [],
  created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
}))

const COMPLAINT_SCENARIOS = [
  { category: 'Pothole', severity: 'high' as const, description: 'Deep pothole on Swargate-Bibwewadi road near Anand petrol pump. Approx 2 ft wide, causing vehicle damage.', lat: 18.4985, lng: 73.8542 },
  { category: 'Pothole', severity: 'critical' as const, description: 'Multiple potholes on Katraj Ghat stretch, dangerous for two-wheelers especially at night.', lat: 18.483, lng: 73.8488 },
  { category: 'Pothole', severity: 'medium' as const, description: 'Pothole near Deccan Gymkhana bus stop, road dug up but not repaired after water pipeline work.', lat: 18.527, lng: 73.861 },
  { category: 'Garbage', severity: 'high' as const, description: 'Large garbage mound near Hadapsar market, not cleared for 5+ days. Foul smell affecting nearby residents.', lat: 18.5015, lng: 73.918 },
  { category: 'Garbage', severity: 'medium' as const, description: 'Overflowing dustbins outside Shivajinagar station area. Waste spilling onto footpath.', lat: 18.5315, lng: 73.8465 },
  { category: 'Garbage', severity: 'low' as const, description: 'Scattered plastic waste behind Kothrud bus depot compound wall.', lat: 18.5068, lng: 73.809 },
  { category: 'Waterlogging', severity: 'critical' as const, description: 'Severe waterlogging on Sangamwadi road after rain, water level reaching 1.5 ft. Traffic at standstill.', lat: 18.509, lng: 73.8905 },
  { category: 'Waterlogging', severity: 'high' as const, description: 'Water accumulation near Karve Nagar underpass, vehicles getting stranded.', lat: 18.5128, lng: 73.826 },
  { category: 'Fallen Tree', severity: 'critical' as const, description: 'Large rain tree fallen across Viman Nagar main road blocking both lanes. Emergency clearance needed.', lat: 18.5638, lng: 73.9152 },
  { category: 'Fallen Tree', severity: 'high' as const, description: 'Tree branch fallen on electricity wire near Deccan bus stop. Power line sagging dangerously.', lat: 18.526, lng: 73.8598 },
  { category: 'Broken Streetlight', severity: 'medium' as const, description: 'Three consecutive streetlights non-functional on Bibwewadi main road. Area very dark at night.', lat: 18.4978, lng: 73.854 },
  { category: 'Broken Streetlight', severity: 'medium' as const, description: 'Street light pole tilted and hanging loose near Katraj Circle. Hazard to pedestrians.', lat: 18.482, lng: 73.8478 },
  { category: 'Broken Streetlight', severity: 'low' as const, description: 'Flickering street light outside Pune Railway Station gate no. 3.', lat: 18.5148, lng: 73.874 },
  { category: 'Open Drain', severity: 'high' as const, description: 'Open storm drain without cover near Hadapsar industrial area. Child fell in yesterday. Urgent cover needed.', lat: 18.5008, lng: 73.9175 },
  { category: 'Open Drain', severity: 'medium' as const, description: 'Drain cover missing on Shivajinagar-Deccan stretch, visible open drain of 3 ft depth.', lat: 18.5295, lng: 73.849 },
  { category: 'Illegal Dumping', severity: 'high' as const, description: 'Construction debris dumped illegally on footpath near Anand Nagar school. Children safety at risk.', lat: 18.4895, lng: 73.851 },
  { category: 'Illegal Dumping', severity: 'medium' as const, description: 'Old mattresses and furniture dumped near Sangamwadi bridge approach.', lat: 18.508, lng: 73.891 },
  { category: 'Stray Animals', severity: 'medium' as const, description: 'Large pack of stray dogs near Kothrud market area. Two biting incidents reported this week.', lat: 18.5072, lng: 73.8082 },
  { category: 'Pothole', severity: 'high' as const, description: 'Road cave-in near Karve statue chowk. Pothole 3 ft deep, police barricade in place but no repair.', lat: 18.5135, lng: 73.8256 },
  { category: 'Garbage', severity: 'critical' as const, description: 'Garbage truck not coming to Viman Nagar sector 4 for 7 days. Residents dumping on street.', lat: 18.5645, lng: 73.9148 },
  { category: 'Waterlogging', severity: 'medium' as const, description: 'Low-lying area near Bibwewadi temple fills with water every monsoon. Permanent fix needed.', lat: 18.498, lng: 73.8536 },
  { category: 'Broken Streetlight', severity: 'high' as const, description: 'All 5 lights on Hadapsar lane 6 not working for 10 days. Women feel unsafe walking at night.', lat: 18.5018, lng: 73.9172 },
  { category: 'Fallen Tree', severity: 'medium' as const, description: 'Old eucalyptus tree partially fallen in Kothrud park, blocking walking path.', lat: 18.5065, lng: 73.8085 },
  { category: 'Open Drain', severity: 'low' as const, description: 'Small drain overflow near Shivajinagar bus stand creating slippery footpath.', lat: 18.531, lng: 73.8468 },
  { category: 'Pothole', severity: 'medium' as const, description: 'Series of potholes on Pune-Satara highway near Katraj tunnel approach.', lat: 18.477, lng: 73.8445 },
]

const categoryToDept: Record<string, number> = {
  Pothole: 1,
  'Road Damage': 1,
  'Broken Road': 1,
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

const statusOptions: Complaint['status'][] = ['new', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'closed']

let nextComplaintNum = 1
const complaints: Complaint[] = COMPLAINT_SCENARIOS.map((s, idx) => {
  const status = statusOptions[idx % statusOptions.length]
  const deptId = categoryToDept[s.category] || 1
  const dept = departments.find((d) => d.id === deptId)
  const daysAgo = (idx * 1.2 + 1)
  const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const isResolved = status === 'resolved' || status === 'closed'
  const resolvedAt = isResolved ? new Date(Date.now() - (daysAgo - 2) * 86400000).toISOString() : null
  const bus = buses[idx % buses.length]

  const history: StatusHistory[] = [
    { id: idx * 10 + 1, old_status: null, new_status: 'new', changed_by: null, changed_at: createdAt, notes: 'Auto-detected by bus camera AI scanner' },
  ]
  if (status !== 'new') {
    history.push({ id: idx * 10 + 2, old_status: 'new', new_status: 'assigned', changed_by: 1, changed_at: new Date(Date.parse(createdAt) + 3600000).toISOString(), notes: `Assigned to ${dept?.name}` })
  }
  if (status === 'in_progress' || status === 'awaiting_verification' || status === 'resolved' || status === 'closed') {
    history.push({ id: idx * 10 + 3, old_status: 'assigned', new_status: 'in_progress', changed_by: 2, changed_at: new Date(Date.parse(createdAt) + 12 * 3600000).toISOString(), notes: 'Field crew dispatched to site' })
  }
  if (status === 'awaiting_verification' || status === 'resolved' || status === 'closed') {
    history.push({ id: idx * 10 + 4, old_status: 'in_progress', new_status: 'awaiting_verification', changed_by: 2, changed_at: new Date(Date.parse(createdAt) + 24 * 3600000).toISOString(), notes: 'Repair completed, awaiting inspection' })
  }
  if (status === 'resolved' || status === 'closed') {
    history.push({ id: idx * 10 + 5, old_status: 'awaiting_verification', new_status: 'resolved', changed_by: 1, changed_at: resolvedAt!, notes: 'Verified and confirmed fixed by civic inspector' })
  }
  if (status === 'closed') {
    history.push({ id: idx * 10 + 6, old_status: 'resolved', new_status: 'closed', changed_by: 1, changed_at: new Date(Date.parse(resolvedAt!) + 12 * 3600000).toISOString(), notes: 'Ticket archived' })
  }

  const cid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`

  return {
    id: idx + 1,
    complaint_id: cid,
    category: s.category,
    description: s.description,
    latitude: s.lat + (Math.random() - 0.5) * 0.0008,
    longitude: s.lng + (Math.random() - 0.5) * 0.0008,
    bus_id: bus.id,
    severity: s.severity,
    status,
    department_id: deptId,
    department_name: dept?.name,
    observation_count: Math.floor(Math.random() * 6) + 1,
    first_detected_at: createdAt,
    last_detected_at: new Date(Date.parse(createdAt) + Math.random() * 86400000).toISOString(),
    resolved_at: resolvedAt,
    resolution_notes: isResolved ? 'Road repaired and tarmac leveled. Certified by PMC engineers.' : null,
    evidence_image_path: null,
    status_history: history,
    assignments: [
      { id: idx + 1, complaint_id: idx + 1, assigned_to: deptId === 1 ? 2 : 3, assigned_by: 1, assigned_at: createdAt, notes: 'Assigned for priority inspection' },
    ],
  }
})

const detections: Detection[] = complaints.map((c, idx) => ({
  id: idx + 1,
  bus_id: c.bus_id,
  complaint_id: c.id,
  category: c.category,
  confidence: +(0.78 + Math.random() * 0.18).toFixed(2),
  bbox: { x1: 120, y1: 180, x2: 360, y2: 320 },
  image_path: null,
  timestamp: c.first_detected_at,
  latitude: c.latitude,
  longitude: c.longitude,
  is_simulated: true,
}))

let nextNotifId = 1
const notifications: Notification[] = [
  { id: nextNotifId++, user_id: 1, title: 'High Priority Pothole Detected', message: 'Bus PMC-11 scanned a critical road defect near Katraj Ghat.', type: 'warning', is_read: false, complaint_id: 2, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: nextNotifId++, user_id: 1, title: 'Complaint Resolved', message: 'Complaint CE-202609-0005 has been marked resolved by Sanitation team.', type: 'success', is_read: false, complaint_id: 5, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: nextNotifId++, user_id: 2, title: 'New Work Order Assigned', message: 'You have been assigned to inspect Swargate-Bibwewadi road defect.', type: 'info', is_read: true, complaint_id: 1, created_at: new Date(Date.now() - 14400000).toISOString() },
  { id: nextNotifId++, user_id: 1, title: 'Verification Requested', message: 'Drainage repair at Sangamwadi is awaiting supervisor verification.', type: 'info', is_read: false, complaint_id: 7, created_at: new Date(Date.now() - 28800000).toISOString() },
]

// ── Haversine Distance helper ────────────────────────────────────────────────
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

// ── Auth Middleware ─────────────────────────────────────────────────────────
function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    return next()
  }

  jwt.verify(token, SECRET_KEY, (err, decoded: any) => {
    if (!err && decoded) {
      const user = users.find((u) => u.username === decoded.sub)
      if (user) {
        ;(req as any).user = user
      }
    }
    next()
  })
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }
  next()
}

// ── Setup API Routes ─────────────────────────────────────────────────────────
function setupApiRoutes(app: express.Express) {
  const router = express.Router()

  // 1. Health
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CivicEye AI' })
  })

  // 2. Auth
  router.post('/auth/login', (req, res) => {
    const username = req.body.username || req.query.username
    const password = req.body.password || req.query.password

    const user = users.find((u) => u.username === username && u.passwordHash === password)
    if (!user) {
      return res.status(401).json({ success: false, message: 'Incorrect username or password' })
    }

    const dept = departments.find((d) => d.id === user.department_id)
    const userOut = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      department: dept ? dept.name : null,
      is_active: true,
      created_at: user.created_at,
    }

    const token = jwt.sign({ sub: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' })

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: userOut,
    })
  })

  router.get('/auth/me', (req, res) => {
    const currentUser = (req as any).user || users[0] // fallback to admin for demo
    const dept = departments.find((d) => d.id === currentUser.department_id)
    res.json({
      success: true,
      data: {
        id: currentUser.id,
        username: currentUser.username,
        full_name: currentUser.full_name,
        email: currentUser.email,
        role: currentUser.role,
        department_id: currentUser.department_id,
        department: dept ? dept.name : null,
        is_active: true,
        created_at: currentUser.created_at,
      },
      message: 'Current user profile',
    })
  })

  // 3. Buses
  router.get('/buses', (_req, res) => {
    res.json({
      success: true,
      data: buses,
      message: `${buses.length} buses found`,
    })
  })

  router.get('/buses/:id/route', (req, res) => {
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

  router.post('/buses/:id/gps', (req, res) => {
    const busId = Number(req.params.id)
    const bus = buses.find((b) => b.id === busId)
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }

    const { latitude, longitude, speed } = req.body
    bus.current_latitude = latitude
    bus.current_longitude = longitude
    bus.current_speed = speed ?? bus.current_speed
    bus.last_seen_at = new Date().toISOString()

    res.json({
      success: true,
      data: { bus_id: bus.id, latitude, longitude, speed, timestamp: bus.last_seen_at },
      message: 'GPS observation recorded',
    })
  })

  router.get('/buses/:id/detections', (req, res) => {
    const busId = Number(req.params.id)
    const list = detections.filter((d) => d.bus_id === busId)
    res.json({
      success: true,
      data: list,
      message: `${list.length} detections`,
    })
  })

  // 4. Complaints
  router.get('/complaints', (req, res) => {
    const { status, category, severity, department, search, skip = 0, limit = 50 } = req.query

    let filtered = [...complaints]
    if (status) filtered = filtered.filter((c) => c.status === status)
    if (category) filtered = filtered.filter((c) => c.category === category)
    if (severity) filtered = filtered.filter((c) => c.severity === severity)
    if (department) {
      filtered = filtered.filter((c) => c.department_name?.toLowerCase().includes(String(department).toLowerCase()))
    }
    if (search) {
      const q = String(search).toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.description.toLowerCase().includes(q) ||
          c.complaint_id.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      )
    }

    filtered.sort((a, b) => new Date(b.first_detected_at).getTime() - new Date(a.first_detected_at).getTime())

    const total = filtered.length
    const items = filtered.slice(Number(skip), Number(skip) + Number(limit))

    // Include department name string for frontend compatibility, plus department_info
    const enriched = items.map((c) => {
      const dept = departments.find((d) => d.id === c.department_id)
      const deptName = dept?.name || c.department_name || 'Roads & Infrastructure'
      return {
        ...c,
        department: deptName,
        department_name: deptName,
        department_info: dept || null,
      }
    })

    res.json({
      success: true,
      data: { total, items: enriched },
      message: `${total} complaints`,
    })
  })

  router.get('/complaints/map', (_req, res) => {
    const points = complaints.map((c) => ({
      id: c.id,
      complaint_id: c.complaint_id,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      severity: c.severity,
      status: c.status,
      observation_count: c.observation_count,
      first_detected_at: c.first_detected_at,
    }))
    res.json({ success: true, data: points, message: `${points.length} map points` })
  })

  router.get('/map/complaints', (req, res) => {
    const { category, status, severity } = req.query
    let list = [...complaints]
    if (category) list = list.filter((c) => c.category === category)
    if (status) list = list.filter((c) => c.status === status)
    if (severity) list = list.filter((c) => c.severity === severity)

    const markers = list.map((c) => ({
      id: c.id,
      complaint_id: c.complaint_id,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      severity: c.severity,
      status: c.status,
      observation_count: c.observation_count,
      department_name: c.department_name,
      first_detected_at: c.first_detected_at,
      description: c.description,
    }))
    res.json({ success: true, data: markers, message: `${markers.length} markers` })
  })

  router.get('/map/heatmap', (_req, res) => {
    const maxObs = Math.max(...complaints.map((c) => c.observation_count), 1)
    const points = complaints.map((c) => ({
      lat: c.latitude,
      lng: c.longitude,
      weight: +(c.observation_count / maxObs).toFixed(3),
    }))
    res.json({ success: true, data: points, message: `${points.length} heatmap points` })
  })

  router.get('/complaints/:id', (req, res) => {
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: `Complaint '${idParam}' not found` })
    }

    const dept = departments.find((d) => d.id === complaint.department_id) || null
    const deptName = dept ? dept.name : (complaint.department_name || null)
    res.json({
      success: true,
      data: { ...complaint, department: deptName, department_name: deptName, department_info: dept },
      message: 'Complaint retrieved',
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
      department_id,
      evidence_image_path,
      media_url,
      media_type,
      is_anonymous = true,
      contact_name,
      contact_phone,
    } = req.body

    // Normalize category
    const catStr = String(category || 'Pothole')
    const normalizedCat = catStr.charAt(0).toUpperCase() + catStr.slice(1).toLowerCase()
    const matchedKey = Object.keys(categoryToDept).find((k) => k.toLowerCase() === catStr.toLowerCase()) || normalizedCat

    const deptId = Number(department_id) || categoryToDept[matchedKey] || 1
    const dept = departments.find((d) => d.id === deptId)
    const now = new Date().toISOString()
    const newId = complaints.length + 1
    const cid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`

    const latVal = typeof latitude === 'number' ? latitude : parseFloat(latitude) || 18.5204
    const lngVal = typeof longitude === 'number' ? longitude : parseFloat(longitude) || 73.8567

    const mediaPath = media_url || evidence_image_path || null
    const submitterLabel = is_anonymous ? 'Anonymous Citizen' : (contact_name || 'Citizen')

    const newComplaint: Complaint = {
      id: newId,
      complaint_id: cid,
      category: matchedKey,
      description: description || `Reported ${matchedKey} civic issue at [${latVal.toFixed(4)}, ${lngVal.toFixed(4)}]`,
      latitude: latVal,
      longitude: lngVal,
      address: address || `Pune, Maharashtra (Lat: ${latVal.toFixed(4)}, Lng: ${lngVal.toFixed(4)})`,
      bus_id: bus_id || null,
      severity,
      status: 'new',
      department_id: deptId,
      department_name: dept?.name || 'Roads & Infrastructure',
      observation_count: 1,
      first_detected_at: now,
      last_detected_at: now,
      resolved_at: null,
      resolution_notes: null,
      evidence_image_path: mediaPath,
      media_url: mediaPath,
      media_type: media_type || (mediaPath && (mediaPath.endsWith('.mp4') || mediaPath.endsWith('.webm')) ? 'video' : 'image'),
      is_anonymous: Boolean(is_anonymous),
      contact_name: is_anonymous ? null : (contact_name || null),
      contact_phone: is_anonymous ? null : (contact_phone || null),
      status_history: [
        {
          id: Date.now(),
          old_status: null,
          new_status: 'new',
          changed_by: null,
          changed_at: now,
          notes: is_anonymous
            ? 'Filed anonymously via CivicEye Public Citizen Portal'
            : `Filed by ${submitterLabel} via CivicEye Public Citizen Portal`,
        },
      ],
      assignments: [],
    }

    complaints.unshift(newComplaint)

    // Notify municipal admins
    notifications.unshift({
      id: nextNotifId++,
      user_id: 1,
      title: 'New Citizen Complaint',
      message: `${newComplaint.category} reported (${newComplaint.complaint_id}) — ${newComplaint.department_name}`,
      type: 'info',
      is_read: false,
      complaint_id: newComplaint.id,
      created_at: now,
    })

    const deptName = dept?.name || 'Roads & Infrastructure'
    res.status(201).json({
      success: true,
      data: { ...newComplaint, department: deptName, department_name: deptName, department_info: dept || null },
      message: 'Complaint created successfully',
    })
  }

  router.post('/complaints', handleCreateComplaint)
  router.post('/complaints/', handleCreateComplaint)

  // 4b. Citizen Public AI Classification Endpoint
  router.post('/citizen/ai-classify', (req, res) => {
    const { text = '', media_name = '', media_type = 'image' } = req.body
    const input = `${text} ${media_name}`.toLowerCase()

    let category = 'Pothole'
    let confidence = 0.94
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'high'
    let features: string[] = ['Road surface deterioration', 'Impact hazard for commuters']
    let deptId = 1
    let suggestedDesc = 'Damaged asphalt surface with depression posing risk to vehicles and two-wheelers.'

    if (input.includes('garbage') || input.includes('trash') || input.includes('waste') || input.includes('dump') || input.includes('bin') || input.includes('litter')) {
      category = 'Garbage'
      confidence = 0.92
      severity = 'high'
      deptId = 2
      features = ['Accumulation of uncollected solid municipal waste', 'Footpath obstruction', 'Odor and public health hazard']
      suggestedDesc = 'Uncollected waste and overflowing refuse causing public nuisance and blocking pedestrian pathway.'
    } else if (input.includes('water') || input.includes('flood') || input.includes('drain') || input.includes('gutter') || input.includes('sewage') || input.includes('waterlog')) {
      category = input.includes('drain') ? 'Open Drain' : 'Waterlogging'
      confidence = 0.89
      severity = 'critical'
      deptId = 4
      features = ['Water stagnation on carriageway', 'Drainage blockage', 'Submerged road edges']
      suggestedDesc = 'Severe waterlogging / open stormwater channel creating road hazard and potential vector breeding.'
    } else if (input.includes('tree') || input.includes('branch') || input.includes('foliage') || input.includes('park') || input.includes('plant')) {
      category = 'Fallen Tree'
      confidence = 0.95
      severity = 'critical'
      deptId = 3
      features = ['Large tree or heavy limb obstruction', 'Traffic blockage', 'Overhead line risk']
      suggestedDesc = 'Fallen tree / large branches blocking thoroughfare; requires urgent municipal clearance.'
    } else if (input.includes('light') || input.includes('lamp') || input.includes('pole') || input.includes('dark') || input.includes('wire') || input.includes('electric')) {
      category = 'Broken Streetlight'
      confidence = 0.88
      severity = 'medium'
      deptId = 5
      features = ['Non-functional luminaire', 'Dark stretch posing night safety risk']
      suggestedDesc = 'Streetlight fixture non-operational, resulting in reduced visibility and pedestrian safety concerns.'
    } else if (input.includes('dog') || input.includes('animal') || input.includes('cattle') || input.includes('cow')) {
      category = 'Stray Animals'
      confidence = 0.87
      severity = 'medium'
      deptId = 2
      features = ['Stray animal congregation', 'Commuter disruption']
      suggestedDesc = 'Pack of stray animals causing traffic hazard and pedestrian concern in residential vicinity.'
    }

    const dept = departments.find((d) => d.id === deptId)
    res.json({
      success: true,
      data: {
        category,
        confidence,
        severity,
        department_id: deptId,
        department_name: dept?.name || 'Roads & Infrastructure',
        suggested_description: suggestedDesc,
        detected_features: features,
        media_type,
      },
      message: 'AI classification complete',
    })
  })

  // 4c. Citizen Media Upload (Photos or Videos)
  router.post('/citizen/upload-media', upload.single('media'), (req, res) => {
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
  })

  // 4d. Public Citizen Complaint Tracking by Tracking ID
  router.get('/complaints/public/track/:id', (req, res) => {
    const idParam = String(req.params.id).trim().toUpperCase()
    const complaint = complaints.find(
      (c) =>
        c.complaint_id.toUpperCase() === idParam ||
        c.complaint_id.toUpperCase().replace('-', '') === idParam.replace('-', '') ||
        String(c.id) === idParam ||
        `#${c.id}` === idParam
    )

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `No complaint found matching tracking ID '${req.params.id}'. Please check the format (e.g., CE-202609-0001).`,
      })
    }

    const dept = departments.find((d) => d.id === complaint.department_id) || null
    const deptName = dept ? dept.name : (complaint.department_name || 'Roads & Infrastructure')

    res.json({
      success: true,
      data: {
        ...complaint,
        department: deptName,
        department_name: deptName,
        department_info: dept,
      },
      message: 'Complaint tracking details retrieved',
    })
  })

  router.put('/complaints/:id/status', (req, res) => {
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }

    const { status, notes } = req.body
    const oldStatus = complaint.status
    complaint.status = status
    const now = new Date().toISOString()

    if (status === 'resolved' || status === 'closed') {
      complaint.resolved_at = now
      if (notes) complaint.resolution_notes = notes
    } else if (status === 'in_progress' && oldStatus === 'awaiting_verification') {
      complaint.resolved_at = null
    }

    complaint.status_history.push({
      id: Date.now(),
      old_status: oldStatus,
      new_status: status,
      changed_by: (req as any).user?.id || 1,
      changed_at: now,
      notes: notes || `Status transitioned to ${status}`,
    })

    notifications.unshift({
      id: nextNotifId++,
      user_id: 1,
      title: `Status: ${status.replace('_', ' ').toUpperCase()}`,
      message: `Complaint ${complaint.complaint_id} changed from ${oldStatus} to ${status}.`,
      type: status === 'resolved' ? 'success' : 'info',
      is_read: false,
      complaint_id: complaint.id,
      created_at: now,
    })

    const dept = departments.find((d) => d.id === complaint.department_id) || null
    const deptName = dept ? dept.name : (complaint.department_name || null)
    res.json({
      success: true,
      data: { ...complaint, department: deptName, department_name: deptName, department_info: dept },
      message: `Status updated to '${status}'`,
    })
  })

  router.put('/complaints/:id/assign', (req, res) => {
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }

    const { department_id, assigned_to, notes } = req.body
    const now = new Date().toISOString()

    if (department_id) {
      const dept = departments.find((d) => d.id === Number(department_id))
      if (dept) {
        complaint.department_id = dept.id
        complaint.department_name = dept.name
        if (complaint.status === 'new') {
          complaint.status = 'assigned'
        }
      }
    }

    if (assigned_to) {
      complaint.assignments.push({
        id: Date.now(),
        complaint_id: complaint.id,
        assigned_to: Number(assigned_to),
        assigned_by: (req as any).user?.id || 1,
        assigned_at: now,
        notes: notes || 'Assigned to field officer',
      })
    }

    const dept = departments.find((d) => d.id === complaint.department_id) || null
    const deptName = dept ? dept.name : (complaint.department_name || null)
    res.json({
      success: true,
      data: { ...complaint, department: deptName, department_name: deptName, department_info: dept },
      message: 'Complaint assigned',
    })
  })

  router.post('/complaints/:id/evidence', upload.single('file'), (req, res) => {
    const idParam = req.params.id
    const complaint = complaints.find(
      (c) => String(c.id) === idParam || c.complaint_id.toLowerCase() === idParam.toLowerCase()
    )
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' })
    }

    const file = req.file
    const imagePath = file ? `/uploads/${file.filename}` : '/uploads/sample.jpg'
    if (!complaint.evidence_image_path) {
      complaint.evidence_image_path = imagePath
    }

    res.json({
      success: true,
      data: {
        id: Date.now(),
        complaint_id: complaint.id,
        image_path: imagePath,
        image_type: req.query.image_type || 'detection',
        uploaded_by: (req as any).user?.id || 1,
        created_at: new Date().toISOString(),
      },
      message: 'Evidence uploaded',
    })
  })

  // 5. Detections & AI Frame Analysis
  router.post('/detections/analyze', (req, res) => {
    const { bus_id = 1, latitude, longitude, auto_create_complaints = true } = req.body

    const possibleCategories = [
      { category: 'Pothole', bbox: { x1: 140, y1: 280, x2: 320, y2: 380 }, conf: 0.91 },
      { category: 'Garbage', bbox: { x1: 220, y1: 210, x2: 440, y2: 360 }, conf: 0.86 },
      { category: 'Waterlogging', bbox: { x1: 60, y1: 260, x2: 580, y2: 420 }, conf: 0.83 },
      { category: 'Broken Streetlight', bbox: { x1: 290, y1: 40, x2: 380, y2: 210 }, conf: 0.79 },
      { category: 'Open Drain', bbox: { x1: 100, y1: 320, x2: 420, y2: 430 }, conf: 0.88 },
      { category: 'Fallen Tree', bbox: { x1: 30, y1: 110, x2: 520, y2: 360 }, conf: 0.94 },
    ]

    // Generate 1-2 detections around this location
    const numDets = Math.floor(Math.random() * 2) + 1
    const chosen = possibleCategories.slice(0, numDets)

    const newDetections: Detection[] = []
    const created: string[] = []
    const updated: string[] = []

    for (const item of chosen) {
      const confidence = +(item.conf + (Math.random() - 0.5) * 0.08).toFixed(2)
      const now = new Date().toISOString()

      const detRecord: Detection = {
        id: detections.length + 1,
        bus_id,
        complaint_id: null,
        category: item.category,
        confidence,
        bbox: item.bbox,
        image_path: null,
        timestamp: now,
        latitude,
        longitude,
        is_simulated: true,
      }
      detections.unshift(detRecord)
      newDetections.push(detRecord)

      if (auto_create_complaints) {
        // Haversine check against open complaints
        const openComplaints = complaints.filter(
          (c) => c.category === item.category && !['resolved', 'closed'].includes(c.status)
        )

        let minDistance = Infinity
        let closestComplaint: Complaint | null = null
        for (const oc of openComplaints) {
          const d = haversineDistanceMeters(latitude, longitude, oc.latitude, oc.longitude)
          if (d < minDistance) {
            minDistance = d
            closestComplaint = oc
          }
        }

        if (closestComplaint && minDistance < 50) {
          // Merge as duplicate observation
          closestComplaint.observation_count += 1
          closestComplaint.last_detected_at = now
          detRecord.complaint_id = closestComplaint.id
          updated.push(closestComplaint.complaint_id)
        } else {
          // Create new complaint
          const deptId = categoryToDept[item.category] || 1
          const dept = departments.find((d) => d.id === deptId)
          const newCid = `CE-202609-${String(nextComplaintNum++).padStart(4, '0')}`
          const newComplaint: Complaint = {
            id: complaints.length + 1,
            complaint_id: newCid,
            category: item.category,
            description: `Automated detection of ${item.category} by Bus #${bus_id} at [${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}]`,
            latitude,
            longitude,
            bus_id,
            severity: confidence > 0.85 ? 'high' : 'medium',
            status: 'new',
            department_id: deptId,
            department_name: dept?.name,
            observation_count: 1,
            first_detected_at: now,
            last_detected_at: now,
            resolved_at: null,
            resolution_notes: null,
            evidence_image_path: null,
            status_history: [
              { id: Date.now(), old_status: null, new_status: 'new', changed_by: null, changed_at: now, notes: 'Auto-detected via onboard computer vision' },
            ],
            assignments: [],
          }
          complaints.unshift(newComplaint)
          detRecord.complaint_id = newComplaint.id
          created.push(newCid)
        }
      }
    }

    res.json({
      success: true,
      data: {
        detections: newDetections,
        complaints_created: created,
        complaints_updated: updated,
      },
      message: `Processed frame: ${created.length} created, ${updated.length} updated`,
    })
  })

  router.get('/detections', (req, res) => {
    const { bus_id, limit = 10 } = req.query
    let list = [...detections]
    if (bus_id) list = list.filter((d) => d.bus_id === Number(bus_id))
    list = list.slice(0, Number(limit))
    res.json({
      success: true,
      data: list,
      message: `${list.length} detections retrieved`,
    })
  })

  // 6. Departments
  router.get('/departments', (_req, res) => {
    const list = departments.map((d) => {
      const deptComplaints = complaints.filter((c) => c.department_id === d.id)
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

  router.get('/departments/:id/officers', (req, res) => {
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

  router.get('/departments/:id/queue', (req, res) => {
    const deptId = Number(req.params.id)
    const dept = departments.find((d) => d.id === deptId)
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Department not found' })
    }

    const { status } = req.query
    let q = complaints.filter((c) => c.department_id === deptId)
    if (status) {
      q = q.filter((c) => c.status === status)
    } else {
      q = q.filter((c) => !['resolved', 'closed'].includes(c.status))
    }
    q.sort((a, b) => new Date(a.first_detected_at).getTime() - new Date(b.first_detected_at).getTime())

    res.json({
      success: true,
      data: { department: dept, queue: q },
      message: `${q.length} items in queue`,
    })
  })

  router.put('/departments/:id/routing-rules', (req, res) => {
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

  // 7. Analytics
  router.get('/analytics/summary', (_req, res) => {
    const total = complaints.length
    const newCount = complaints.filter((c) => c.status === 'new').length
    const assigned = complaints.filter((c) => c.status === 'assigned').length
    const inProgress = complaints.filter((c) => c.status === 'in_progress').length
    const awaiting = complaints.filter((c) => c.status === 'awaiting_verification').length
    const resolved = complaints.filter((c) => c.status === 'resolved').length
    const closed = complaints.filter((c) => c.status === 'closed').length

    const resolvedWithTime = complaints.filter((c) => (c.status === 'resolved' || c.status === 'closed') && c.resolved_at)
    let avgHours = 34.5
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

  router.get('/analytics/by-category', (_req, res) => {
    const catMap = new Map<string, { count: number; resolved: number }>()
    for (const c of complaints) {
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

  router.get('/analytics/by-department', (_req, res) => {
    const result = departments.map((d) => {
      const deptComplaints = complaints.filter((c) => c.department_id === d.id)
      const resolved = deptComplaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length
      return {
        department: d.name,
        count: deptComplaints.length,
        resolved,
        open: deptComplaints.length - resolved,
      }
    })
    res.json({ success: true, data: result, message: `${result.length} departments` })
  })

  router.get('/analytics/by-severity', (_req, res) => {
    const counts = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const c of complaints) {
      if (counts[c.severity] !== undefined) counts[c.severity]++
    }
    const result = Object.entries(counts).map(([severity, count]) => ({ severity, count }))
    res.json({ success: true, data: result, message: `${result.length} severity levels` })
  })

  router.get('/analytics/timeline', (req, res) => {
    const days = Number(req.query.days || 30)
    const counts: Record<string, number> = {}

    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0]
      counts[d] = 0
    }

    for (const c of complaints) {
      const d = c.first_detected_at.split('T')[0]
      if (counts[d] !== undefined) counts[d]++
    }

    const result = Object.entries(counts).map(([date, count]) => ({ date, count }))
    res.json({ success: true, data: result, message: `Timeline for last ${days} days` })
  })

  router.get('/analytics/hotspots', (_req, res) => {
    const GRID = 0.002
    const clusters: Record<string, { latitude: number; longitude: number; category: string; count: number }> = {}

    for (const c of complaints) {
      const latKey = Math.round(c.latitude / GRID) * GRID
      const lngKey = Math.round(c.longitude / GRID) * GRID
      const key = `${latKey.toFixed(4)},${lngKey.toFixed(4)},${c.category}`
      if (!clusters[key]) {
        clusters[key] = { latitude: latKey, longitude: lngKey, category: c.category, count: 0 }
      }
      clusters[key].count++
    }

    const hotspotList = Object.values(clusters)
      .filter((h) => h.count >= 2)
      .sort((a, b) => b.count - a.count)

    res.json({ success: true, data: hotspotList, message: `${hotspotList.length} hotspots found` })
  })

  // 8. Notifications
  router.get('/notifications', (_req, res) => {
    const unreadCount = notifications.filter((n) => !n.is_read).length
    res.json({
      success: true,
      data: {
        notifications,
        unread_count: unreadCount,
      },
      message: `${notifications.length} notifications`,
    })
  })

  router.put('/notifications/:id/read', (req, res) => {
    const notifId = Number(req.params.id)
    const n = notifications.find((x) => x.id === notifId)
    if (n) n.is_read = true
    res.json({ success: true, data: null, message: 'Marked as read' })
  })

  router.put('/notifications/read-all', (_req, res) => {
    for (const n of notifications) {
      n.is_read = true
    }
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

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'))) {
    app.use(express.static(path.resolve('dist')))
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'))
    })
  } else {
    // In dev mode, mount Vite middleware for HMR / fast bundling
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CivicEye AI] Server listening on http://0.0.0.0:${PORT}`)
  })
}

startServer().catch((err) => {
  console.error('[CivicEye AI] Failed to start server:', err)
  process.exit(1)
})
