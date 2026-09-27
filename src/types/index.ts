// ─── User & Auth ───────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'officer' | 'citizen'

export interface User {
  id: number
  username: string
  email: string
  full_name?: string
  role: UserRole
  department?: string | null
  department_id?: number | null
  department_code?: string | null
  is_active: boolean
  created_at: string
}

export interface DemoStaffAccount {
  username: string
  label: string
  role: UserRole
  role_label: string
  department_id: number | null
  department: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

// ─── Complaint ─────────────────────────────────────────────────────────────

export type ComplaintCategory =
  | 'Pothole'
  | 'Road Damage'
  | 'Garbage'
  | 'Waterlogging'
  | 'Fallen Tree'
  | 'Broken Streetlight'
  | 'Open Drain'
  | 'Illegal Dumping'
  | 'Stray Animals'
  | 'pothole'
  | 'garbage'
  | 'waterlogging'
  | 'fallen_tree'
  | 'broken_streetlight'
  | 'damaged_road'
  | 'illegal_dumping'
  | 'encroachment'
  | 'other'

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical'

export type ComplaintStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_verification'
  | 'resolved'
  | 'closed'

export type ComplaintSource = 'bus_camera' | 'citizen_portal' | 'officer_manual' | 'citizen'

export interface StatusHistoryItem {
  id: number
  old_status?: ComplaintStatus | string | null
  new_status: ComplaintStatus | string
  changed_by?: number | null
  changed_by_name?: string
  notes?: string | null
  changed_at: string
}

export interface Evidence {
  id: number
  complaint_id: number
  image_path: string
  image_type: 'detection' | 'citizen' | 'resolution' | string
  uploaded_by?: number | null
  uploaded_by_name?: string
  notes?: string | null
  created_at: string
  file_path?: string
  file_type?: string
  uploaded_at?: string
}

export interface AssignmentItem {
  id: number
  complaint_id: number
  assigned_to: number
  assigned_to_name?: string
  assigned_by: number
  assigned_at: string
  notes?: string | null
}

export interface Department {
  id: number
  name: string
  code: string
  description?: string
  contact_email?: string
  problem_categories?: string[]
  complaint_count?: number
  open_count?: number
  resolved_count?: number
}

export interface AuditLogItem {
  id: number
  action: string
  entity_type: 'complaint' | 'bus' | 'detection' | 'system'
  entity_id: string
  complaint_id?: number | string | null
  actor_name: string
  actor_role: string
  details: string
  old_value?: string | null
  new_value?: string | null
  timestamp: string
  created_at?: string
}

export interface Complaint {
  id: number
  complaint_id: string
  category: ComplaintCategory | string
  description: string
  severity: ComplaintSeverity
  status: ComplaintStatus
  source?: ComplaintSource
  department?: string
  department_name?: string
  department_id?: number | null
  department_info?: Department | null
  assigned_to?: number | null
  assigned_to_id?: number | null
  assigned_to_name?: string
  latitude: number
  longitude: number
  address?: string | null
  bus_id?: number | null
  bus_number?: string | null
  bus_route?: string | null
  observation_count: number
  duplicate_count?: number
  confidence?: number
  image_path?: string | null
  image_url?: string | null
  before_image_url?: string | null
  after_image_url?: string | null
  evidence_image_path?: string | null
  resolution_evidence_path?: string | null
  media_url?: string | null
  media_type?: 'image' | 'video' | null
  is_anonymous?: boolean
  is_simulated?: boolean
  contact_name?: string | null
  contact_phone?: string | null
  deduplicated?: boolean
  distance_meters?: number
  first_detected_at: string
  last_detected_at: string
  created_at?: string
  updated_at?: string
  resolved_at?: string | null
  resolution_notes?: string | null
  status_history?: StatusHistoryItem[]
  assignments?: AssignmentItem[]
  evidence?: Evidence[]
  audit_logs?: AuditLogItem[]
  suggested_department_id?: number
  suggested_department_name?: string
  dedup_threshold_meters?: number
  potential_duplicates?: {
    id: number
    complaint_id: string
    category: string
    description: string
    status: ComplaintStatus
    source: string
    bus_id?: number | null
    first_detected_at: string
    observation_count: number
    distance_meters: number
  }[]
  road_segment_id?: string | null
  road_segment_name?: string | null
  road_segment_score?: number | null
  smart_priority?: SmartPriorityRecommendation
  priority_override?: PriorityOverrideRecord | null
  priority_history?: PriorityHistoryEntry[]
  repair_verification?: RepairVerificationRecord
  public_repair_verification?: PublicRepairVerification | null
}

// ─── Feature 1: Road Health Score ──────────────────────────────────────────

export type RoadHealthBand = 'green' | 'yellow' | 'orange' | 'red' | 'insufficient_data'

export interface RoadHealthIssueDeduction {
  complaint_id: string
  id: number
  category: string
  severity: ComplaintSeverity
  status: ComplaintStatus
  description: string
  age_days: number
  observation_count: number
  base_deduction: number
  age_deduction: number
  total_deduction: number
  first_detected_at: string
  latitude: number
  longitude: number
  is_simulated?: boolean
}

export interface RoadSegmentHealth {
  segment_id: string
  name: string
  corridor_road: string
  ward_name: string
  length_km: number
  waypoints: [number, number][]
  center: [number, number]
  score: number | null
  band: RoadHealthBand
  status_label: string
  insufficient_data: boolean
  insufficient_reason?: string | null
  scoring_method: string
  formula_explanation: string
  base_score: number
  total_deduction: number
  active_unique_issues_count: number
  resolved_issues_count: number
  duplicate_sightings_ignored: number
  pothole_count: number
  road_damage_count: number
  waterlogging_count: number
  other_hazard_count: number
  deduction_breakdown: RoadHealthIssueDeduction[]
  active_issues: Complaint[]
  complaint_history: {
    id: number
    complaint_id: string
    category: string
    severity: ComplaintSeverity
    status: ComplaintStatus
    description: string
    first_detected_at: string
    resolved_at?: string | null
    observation_count: number
  }[]
  last_updated_at: string
}

export interface RoadHealthOverviewResponse {
  segments: RoadSegmentHealth[]
  city_average_score: number | null
  evaluated_segments_count: number
  insufficient_data_segments_count: number
  total_active_road_issues: number
  total_duplicates_prevented: number
  scoring_algorithm_note: string
  last_calculated_at: string
}

// ─── Feature 2: Smart Repair Priority ──────────────────────────────────────

export interface SmartPriorityFactor {
  key: 'severity' | 'age' | 'corroboration' | 'road_health' | 'sensitive_proximity'
  label: string
  points: number
  max_points: number
  explanation: string
}

export interface PriorityOverrideRecord {
  priority: ComplaintSeverity
  recommended_priority: ComplaintSeverity
  reason: string
  overridden_by_id: number
  overridden_by_name: string
  overridden_by_role: string
  overridden_at: string
}

export interface PriorityHistoryEntry {
  id: number
  old_priority: ComplaintSeverity
  new_priority: ComplaintSeverity
  recommended_priority: ComplaintSeverity
  is_manual_override: boolean
  changed_by_id: number
  changed_by_name: string
  changed_by_role: string
  reason: string
  changed_at: string
}

export interface SmartPriorityRecommendation {
  score: number
  recommended_priority: ComplaintSeverity
  effective_priority: ComplaintSeverity
  is_overridden: boolean
  priority_reason: string
  factors: SmartPriorityFactor[]
  age_days: number
  independent_reports_count: number
  deduplicated_sightings_merged: number
  road_segment_id: string | null
  road_segment_name: string | null
  road_health_score: number | null
  nearest_sensitive_location?: {
    name: string
    type: 'Hospital' | 'School' | 'Transit Hub'
    distance_meters: number
  } | null
  override_record?: PriorityOverrideRecord | null
}

// ─── Feature 3: Before & After Repair Verification ─────────────────────────

export type VerificationDecisionStatus =
  | 'pending_upload'
  | 'pending_review'
  | 'verified'
  | 'needs_reinspection'
  | 'rejected'

export interface ReinspectionDetectionLink {
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

export interface VisionComparisonResult {
  mode: 'gemini_vision' | 'manual_demo'
  analyzed_at: string
  model_name: string
  issue_resolved_assessment:
    | 'likely_repaired'
    | 'partially_repaired'
    | 'still_present'
    | 'inconclusive'
  confidence: number | null
  summary: string
  observed_changes: string[]
  limitations: string
  is_demo_fallback: boolean
}

export interface RepairVerificationHistoryItem {
  id: number
  action: string
  status: VerificationDecisionStatus
  actor_name: string
  actor_role: string
  notes: string
  timestamp: string
  after_image_url?: string | null
}

export interface RepairVerificationRecord {
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
  history: RepairVerificationHistoryItem[]
}

export interface PublicRepairVerification {
  verification_status: VerificationDecisionStatus
  status_label: string
  verified: boolean
  verified_at: string | null
  before_image_url: string | null
  before_captured_at: string | null
  after_image_url: string | null
  after_uploaded_at: string | null
  public_summary: string | null
  location_coords: {
    latitude: number
    longitude: number
  }
  is_simulated_evidence?: boolean
}

export interface ComplaintListResponse {
  items: Complaint[]
  total: number
  page?: number
  page_size?: number
}

export interface ComplaintFilters {
  status?: ComplaintStatus | ''
  category?: ComplaintCategory | string | ''
  severity?: ComplaintSeverity | ''
  department?: string
  department_name?: string
  source?: ComplaintSource | ''
  bus_id?: number
  search?: string
  page?: number
  page_size?: number
  date_from?: string
  date_to?: string
}

// ─── Bus & Fleet ───────────────────────────────────────────────────────────

export type BusGpsStatus = 'live' | 'stale' | 'offline' | 'simulated'

export interface GpsPoint {
  latitude: number
  longitude: number
  speed: number
  timestamp: string
  recorded_at?: string
  source: 'live' | 'simulated'
  is_simulated?: boolean
}

export interface RouteWaypoint {
  lat: number
  lng: number
  name: string
}

export interface BusRoute {
  id: number
  bus_id: number
  name: string
  waypoints: RouteWaypoint[]
  created_at: string
}

export interface Bus {
  id: number
  bus_number: string
  registration_number?: string
  route_name: string
  driver_id?: string
  driver_name?: string
  driver_phone?: string
  driver_license?: string
  is_active: boolean
  status?: string
  operational_status?: string
  gps_source?: 'live' | 'simulated' | 'offline'
  gps_status?: BusGpsStatus
  current_latitude?: number | null
  current_longitude?: number | null
  current_speed?: number | null
  last_seen_at?: string | null
  last_updated?: string
  total_detections?: number
  detections_count?: number
  complaints_count?: number
  history_count?: number
  latest_issues?: {
    id: number
    complaint_id: string
    category: string
    status: string
    first_detected_at: string
  }[]
}

export interface BusDetail extends Bus {
  route?: BusRoute | null
  gps_history: GpsPoint[]
  detections: DetectionResult[]
  complaints: Complaint[]
}

// ─── Detection ─────────────────────────────────────────────────────────────

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DetectionResult {
  id?: number
  category: ComplaintCategory | string
  confidence: number
  severity?: ComplaintSeverity
  description?: string
  bbox: BoundingBox | null
  complaint_id?: number | string | null
  is_duplicate?: boolean
  is_simulated?: boolean
  ai_model?: string
  bus_id?: number | null
  timestamp: string
  latitude?: number | null
  longitude?: number | null
  image_path?: string | null
}

export interface AnalyzeRequest {
  mode?: 'live' | 'upload' | 'simulation'
  frame_base64?: string
  bus_id?: number | null
  latitude?: number | null
  longitude?: number | null
  gps_source?: 'browser_gps' | 'manual' | 'simulated_route' | 'unavailable'
  auto_create_complaints?: boolean
}

// ─── Analytics ─────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  total_complaints: number
  resolved_complaints: number
  pending_complaints: number
  in_progress_complaints: number
  resolution_rate: number
  avg_resolution_hours: number
  active_buses?: number
  detections_today?: number
}

export interface CategoryStat {
  category: ComplaintCategory | string
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
  avg_response_hours?: number
}

export interface DailyTrend {
  date: string
  count: number
  resolved: number
}

export interface SeverityStat {
  severity: ComplaintSeverity
  count: number
}

export interface HotspotItem {
  latitude: number
  longitude: number
  count: number
  category?: string
  address?: string
}

export interface AnalyticsData {
  summary: AnalyticsSummary
  by_category: CategoryStat[]
  by_status: StatusStat[]
  by_department: DepartmentStat[]
  daily_trend: DailyTrend[]
  by_severity: SeverityStat[]
  hotspots: HotspotItem[]
}

// ─── Notification ──────────────────────────────────────────────────────────

export type NotificationType =
  | 'info'
  | 'warning'
  | 'success'
  | 'error'
  | 'new_complaint'
  | 'status_update'
  | 'assignment'
  | 'system'

export interface Notification {
  id: number
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  complaint_id?: number | null
  created_at: string
}

// ─── Map ───────────────────────────────────────────────────────────────────

export interface MapComplaint {
  id: number
  complaint_id: string
  category: ComplaintCategory | string
  severity: ComplaintSeverity
  status: ComplaintStatus
  source?: ComplaintSource
  bus_id?: number | null
  latitude: number
  longitude: number
  address?: string
  description?: string
  observation_count: number
  department?: string
  department_name?: string
  first_detected_at: string
}
