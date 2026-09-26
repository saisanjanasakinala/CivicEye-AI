from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Generic response wrapper ──────────────────────────────────────────────────

class Response(BaseModel):
    success: bool = True
    data: Any = None
    message: str = ""


# ── Department ────────────────────────────────────────────────────────────────

class DepartmentBase(BaseModel):
    name: str
    code: str
    problem_categories: List[str] = []
    contact_email: Optional[str] = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentOut(DepartmentBase):
    id: int

    model_config = {"from_attributes": True}


class DepartmentWithStats(DepartmentOut):
    complaint_count: int = 0
    open_count: int = 0


# ── User ──────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str
    email: str
    role: str = "citizen"
    department_id: Optional[int] = None


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    created_at: datetime
    department: Optional[DepartmentOut] = None

    model_config = {"from_attributes": True}


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Bus ───────────────────────────────────────────────────────────────────────

class BusBase(BaseModel):
    bus_number: str
    registration_number: Optional[str] = None
    route_name: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_license: Optional[str] = None
    is_active: bool = True
    operational_status: str = "active"


class BusCreate(BusBase):
    pass


class BusOut(BusBase):
    id: int
    last_seen_at: Optional[datetime] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_speed: float = 0.0

    model_config = {"from_attributes": True}


class BusLiveStatus(BaseModel):
    """Snapshot of a bus's current live position and status."""
    id: int
    bus_number: str
    registration_number: Optional[str]
    route_name: Optional[str]
    driver_name: Optional[str]
    driver_phone: Optional[str]
    is_active: bool
    operational_status: str
    last_seen_at: Optional[datetime]
    current_latitude: Optional[float]
    current_longitude: Optional[float]
    current_speed: float
    detection_count: int = 0
    open_complaints: int = 0
    is_stale: bool = False  # True if last GPS update > 10 minutes ago

    model_config = {"from_attributes": True}


class GPSObservationCreate(BaseModel):
    latitude: float
    longitude: float
    speed: float = 0.0
    timestamp: Optional[datetime] = None


class GPSObservationOut(GPSObservationCreate):
    id: int
    bus_id: int
    timestamp: datetime

    model_config = {"from_attributes": True}


class RouteOut(BaseModel):
    id: int
    bus_id: int
    name: Optional[str]
    waypoints: List[Dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Detection ─────────────────────────────────────────────────────────────────

class BBoxOut(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class DetectionOut(BaseModel):
    id: int
    bus_id: Optional[int]
    complaint_id: Optional[int]
    category: str
    confidence: float
    bbox: Optional[Dict[str, float]]
    image_path: Optional[str]
    timestamp: datetime
    latitude: Optional[float]
    longitude: Optional[float]
    is_simulated: bool

    model_config = {"from_attributes": True}


class AnalyzeRequest(BaseModel):
    bus_id: Optional[int] = None
    latitude: float
    longitude: float
    image_base64: Optional[str] = None  # base64 encoded image
    auto_create_complaints: bool = True


class AnalyzeResponse(BaseModel):
    detections: List[DetectionOut]
    complaints_created: List[str] = []
    complaints_updated: List[str] = []


# ── Complaint ─────────────────────────────────────────────────────────────────

class ComplaintBase(BaseModel):
    category: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    severity: str = "medium"


class ComplaintCreate(ComplaintBase):
    bus_id: Optional[int] = None
    department_id: Optional[int] = None
    evidence_image_path: Optional[str] = None


class ComplaintStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class ComplaintAssign(BaseModel):
    department_id: Optional[int] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


class StatusHistoryOut(BaseModel):
    id: int
    old_status: Optional[str]
    new_status: str
    changed_by: Optional[int]
    changed_at: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


class EvidenceOut(BaseModel):
    id: int
    complaint_id: int
    image_path: str
    image_type: str
    uploaded_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentOut(BaseModel):
    id: int
    complaint_id: int
    assigned_to: int
    assigned_by: int
    assigned_at: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ComplaintOut(BaseModel):
    id: int
    complaint_id: str
    category: str
    description: Optional[str]
    latitude: float
    longitude: float
    bus_id: Optional[int]
    severity: str
    status: str
    department_id: Optional[int]
    observation_count: int
    first_detected_at: datetime
    last_detected_at: datetime
    resolved_at: Optional[datetime]
    resolution_notes: Optional[str]
    evidence_image_path: Optional[str]
    department: Optional[DepartmentOut] = None
    status_history: List[StatusHistoryOut] = []
    assignments: List[AssignmentOut] = []

    model_config = {"from_attributes": True}

    def model_post_init(self, __context) -> None:
        """Expose department name as flat field for frontend compatibility."""
        pass

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        return instance

    def model_dump(self, **kwargs):
        data = super().model_dump(**kwargs)
        # Add flat department_name for frontend convenience
        if data.get("department") and isinstance(data["department"], dict):
            data["department_name"] = data["department"].get("name")
        return data


class ComplaintMapPoint(BaseModel):
    id: int
    complaint_id: str
    category: str
    latitude: float
    longitude: float
    severity: str
    status: str
    observation_count: int
    first_detected_at: datetime

    model_config = {"from_attributes": True}


# ── Analytics ─────────────────────────────────────────────────────────────────

class AnalyticsSummary(BaseModel):
    total: int
    new: int
    assigned: int
    in_progress: int
    awaiting_verification: int
    resolved: int
    closed: int
    avg_resolution_hours: Optional[float]
    resolution_rate_pct: float


class CategoryStat(BaseModel):
    category: str
    count: int
    resolved: int
    pending: int


class DepartmentStat(BaseModel):
    department: str
    count: int
    resolved: int
    open: int


class SeverityStat(BaseModel):
    severity: str
    count: int


class TimelinePoint(BaseModel):
    date: str
    count: int


class HotspotPoint(BaseModel):
    latitude: float
    longitude: float
    count: int
    category: str


# ── Notification ──────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    message: Optional[str]
    type: str
    is_read: bool
    complaint_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Map ───────────────────────────────────────────────────────────────────────

class MapComplaintMarker(BaseModel):
    id: int
    complaint_id: str
    category: str
    latitude: float
    longitude: float
    severity: str
    status: str
    observation_count: int
    department_name: Optional[str]
    first_detected_at: datetime
    description: Optional[str] = None


class HeatmapPoint(BaseModel):
    lat: float
    lng: float
    weight: float


# ── Routing rules ─────────────────────────────────────────────────────────────

class RoutingRulesUpdate(BaseModel):
    problem_categories: List[str]
    contact_email: Optional[str] = None
