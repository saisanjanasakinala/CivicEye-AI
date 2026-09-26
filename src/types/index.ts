// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'officer' | 'citizen'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: UserRole
  department?: string
  is_active: boolean
  created_at: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

// ─── Bus ─────────────────────────────────────────────────────────────────────

export interface Bus {
  id: number
  bus_number: string
  route_name: string
  registration_number?: string
  driver_name?: string
  driver_phone?: string
  driver_license?: string
  is_active: boolean
  operational_status?: string
  last_seen_at?: string
  current_latitude?: number
  current_longitude?: number
  current_speed?: number
}

// ─── Complaint ────────────────────────────────────────────────────────────────

export type ComplaintCategory =
  | 'pothole'
  | 'garbage'
  | 'dustbin'
  | 'fallen_tree'
  | 'waterlogging'
  | 'streetlight'
  | 'other'

export type ComplaintStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_verification'
  | 'resolved'
  | 'closed'

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface StatusHistory {
  id: number
  complaint_id: number
  old_status: ComplaintStatus | null
  new_status: ComplaintStatus
  changed_by: number | null
  changed_by_name?: string
  notes?: string
  changed_at: string
}

export interface Complaint {
  id: number
  complaint_id: string
  category: ComplaintCategory
  description: string
  latitude: number
  longitude: number
  address?: string
  bus_id?: number
  detection_id?: number
  confidence?: number
  severity: ComplaintSeverity
  status: ComplaintStatus
  department?: string
  department_id?: number
  assigned_to?: number
  assigned_to_name?: string
  reported_by?: number
  reported_by_name?: string
  image_url?: string
  media_url?: string
  media_type?: 'image' | 'video'
  is_anonymous?: boolean
  contact_name?: string
  contact_phone?: string
  before_image_url?: string
  after_image_url?: string
  is_simulated?: boolean
  observation_count: number
  /** ISO datetime when complaint was first detected (created) */
  first_detected_at: string
  /** ISO datetime of last detection */
  last_detected_at: string
  resolved_at?: string
  resolution_notes?: string
  evidence_image_path?: string
  status_history?: StatusHistory[]
}

export interface ComplaintListResponse {
  items: Complaint[]
  total: number
}

export interface ComplaintFilters {
  category?: ComplaintCategory
  status?: ComplaintStatus
  severity?: ComplaintSeverity
  department?: string
  search?: string
  page?: number
  page_size?: number
}

// ─── Detection ───────────────────────────────────────────────────────────────

export interface DetectionResult {
  id?: number
  bus_id?: number
  complaint_id?: number
  category: ComplaintCategory | string
  confidence: number
  bbox?: { x1: number; y1: number; x2: number; y2: number } | null
  image_path?: string | null
  description?: string
  severity?: ComplaintSeverity
  is_simulated: boolean
  timestamp: string
  latitude?: number
  longitude?: number
}

export interface AnalyzeRequest {
  bus_id: number
  latitude: number
  longitude: number
  image_base64?: string
  auto_create_complaints?: boolean
}

// ─── Department ──────────────────────────────────────────────────────────────

export interface Department {
  id: string
  name: string
  head?: string
  complaint_count?: number
  pending_count?: number
  resolved_count?: number
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface CategoryStat {
  category: ComplaintCategory
  count: number
  resolved: number
  pending: number
}

export interface StatusStat {
  status: ComplaintStatus
  count: number
}

export interface DepartmentStat {
  department: string
  count: number
  resolved: number
}

export interface DailyStat {
  date: string
  count: number
  resolved: number
}

export interface SeverityStat {
  severity: ComplaintSeverity
  count: number
}

export interface HotspotLocation {
  latitude: number
  longitude: number
  count: number
  address?: string
}

export interface AnalyticsData {
  summary: {
    total_complaints: number
    resolved_complaints: number
    pending_complaints: number
    in_progress_complaints: number
    resolution_rate: number
    avg_resolution_hours: number
  }
  by_category: CategoryStat[]
  by_status: StatusStat[]
  by_department: DepartmentStat[]
  daily_trend: DailyStat[]
  by_severity: SeverityStat[]
  hotspots: HotspotLocation[]
}

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'complaint_created'
  | 'status_changed'
  | 'complaint_assigned'
  | 'complaint_resolved'
  | 'system'

export interface Notification {
  id: number
  user_id: number
  type: NotificationType
  title: string
  message: string
  complaint_id?: number
  is_read: boolean
  created_at: string
}

export interface NotificationListResponse {
  notifications: Notification[]
  unread_count: number
}

// ─── Map ─────────────────────────────────────────────────────────────────────

export interface MapComplaint {
  id: number
  complaint_id: string
  category: ComplaintCategory
  latitude: number
  longitude: number
  severity: ComplaintSeverity
  status: ComplaintStatus
  description?: string
  observation_count?: number
  department_name?: string
  first_detected_at: string
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}
