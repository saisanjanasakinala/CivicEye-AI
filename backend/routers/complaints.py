"""
Complaints router — /api/complaints
"""

import os
import uuid
import aiofiles
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from routers.auth import get_current_user
from services.routing_service import route_complaint, assign_department
from services.verification_service import transition_status, create_status_notification

router = APIRouter(prefix="/api/complaints", tags=["complaints"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")


def _generate_complaint_id() -> str:
    ts = datetime.utcnow().strftime("%Y%m%d")
    short = uuid.uuid4().hex[:6].upper()
    return f"CE-{ts}-{short}"


def _load_complaint(db: Session, complaint_id: str) -> models.Complaint:
    """Load complaint by complaint_id string (CE-...) or by numeric database id."""
    q = db.query(models.Complaint).options(
        joinedload(models.Complaint.department),
        joinedload(models.Complaint.status_history),
        joinedload(models.Complaint.assignments),
    )
    # Try numeric id first
    complaint = None
    if complaint_id.isdigit():
        complaint = q.filter(models.Complaint.id == int(complaint_id)).first()
    if not complaint:
        complaint = q.filter(models.Complaint.complaint_id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail=f"Complaint '{complaint_id}' not found")
    return complaint


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=schemas.Response)
def list_complaints(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.Complaint).options(
        joinedload(models.Complaint.department),
        joinedload(models.Complaint.status_history),
        joinedload(models.Complaint.assignments),
    )
    if status:
        q = q.filter(models.Complaint.status == status)
    if category:
        q = q.filter(models.Complaint.category == category)
    if severity:
        q = q.filter(models.Complaint.severity == severity)
    if department_id:
        q = q.filter(models.Complaint.department_id == department_id)
    if department:
        # Filter by department name (join)
        q = q.join(models.Department, isouter=True).filter(
            models.Department.name.ilike(f"%{department}%")
        )
    if search:
        q = q.filter(
            models.Complaint.description.ilike(f"%{search}%") |
            models.Complaint.complaint_id.ilike(f"%{search}%") |
            models.Complaint.category.ilike(f"%{search}%")
        )

    total = q.count()
    complaints = q.order_by(models.Complaint.first_detected_at.desc()).offset(skip).limit(limit).all()
    data = [schemas.ComplaintOut.model_validate(c).model_dump() for c in complaints]
    return schemas.Response(success=True, data={"total": total, "items": data}, message=f"{total} complaints")


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.Response, status_code=201)
def create_complaint(
    payload: schemas.ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Auto-route to department if not specified
    dept_id = payload.department_id
    if not dept_id:
        routing = route_complaint(db, payload.category)
        dept_id = routing.get("department_id")

    complaint = models.Complaint(
        complaint_id=_generate_complaint_id(),
        category=payload.category,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        bus_id=payload.bus_id,
        severity=payload.severity,
        status="new",
        department_id=dept_id,
        observation_count=1,
        first_detected_at=datetime.utcnow(),
        last_detected_at=datetime.utcnow(),
        evidence_image_path=payload.evidence_image_path,
    )
    db.add(complaint)
    db.flush()

    # Initial history entry
    history = models.StatusHistory(
        complaint_id=complaint.id,
        old_status=None,
        new_status="new",
        changed_by=current_user.id,
        changed_at=datetime.utcnow(),
        notes="Complaint created",
    )
    db.add(history)
    db.commit()
    db.refresh(complaint)

    return schemas.Response(
        success=True,
        data=schemas.ComplaintOut.model_validate(complaint).model_dump(),
        message="Complaint created",
    )


# ── Map snapshot ──────────────────────────────────────────────────────────────

@router.get("/map", response_model=schemas.Response)
def complaints_for_map(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    complaints = db.query(models.Complaint).all()
    data = [schemas.ComplaintMapPoint.model_validate(c).model_dump() for c in complaints]
    return schemas.Response(success=True, data=data, message=f"{len(data)} map points")


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/{complaint_id}", response_model=schemas.Response)
def get_complaint(
    complaint_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    complaint = _load_complaint(db, complaint_id)
    return schemas.Response(
        success=True,
        data=schemas.ComplaintOut.model_validate(complaint).model_dump(),
        message="Complaint retrieved",
    )


# ── Status update ─────────────────────────────────────────────────────────────

@router.put("/{complaint_id}/status", response_model=schemas.Response)
def update_status(
    complaint_id: str,
    payload: schemas.ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    complaint = _load_complaint(db, complaint_id)
    try:
        complaint = transition_status(db, complaint, payload.status, current_user.id, payload.notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Notify assigned officer or department
    create_status_notification(db, complaint, payload.status, current_user.id)

    return schemas.Response(
        success=True,
        data=schemas.ComplaintOut.model_validate(complaint).model_dump(),
        message=f"Status updated to '{payload.status}'",
    )


# ── Assign ────────────────────────────────────────────────────────────────────

@router.put("/{complaint_id}/assign", response_model=schemas.Response)
def assign_complaint(
    complaint_id: str,
    payload: schemas.ComplaintAssign,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    complaint = _load_complaint(db, complaint_id)

    if payload.department_id:
        dept = db.query(models.Department).filter(models.Department.id == payload.department_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        complaint = assign_department(db, complaint, payload.department_id, current_user.id)

    if payload.assigned_to:
        officer = db.query(models.User).filter(models.User.id == payload.assigned_to).first()
        if not officer:
            raise HTTPException(status_code=404, detail="Officer not found")
        assignment = models.Assignment(
            complaint_id=complaint.id,
            assigned_to=payload.assigned_to,
            assigned_by=current_user.id,
            assigned_at=datetime.utcnow(),
            notes=payload.notes,
        )
        db.add(assignment)
        db.commit()
        create_status_notification(db, complaint, complaint.status, payload.assigned_to)

    db.refresh(complaint)
    return schemas.Response(
        success=True,
        data=schemas.ComplaintOut.model_validate(complaint).model_dump(),
        message="Complaint assigned",
    )


# ── Evidence upload ───────────────────────────────────────────────────────────

@router.post("/{complaint_id}/evidence", response_model=schemas.Response)
async def upload_evidence(
    complaint_id: str,
    image_type: str = "detection",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    complaint = _load_complaint(db, complaint_id)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    evidence = models.Evidence(
        complaint_id=complaint.id,
        image_path=file_path,
        image_type=image_type,
        uploaded_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(evidence)

    if not complaint.evidence_image_path:
        complaint.evidence_image_path = file_path

    db.commit()
    db.refresh(evidence)

    return schemas.Response(
        success=True,
        data=schemas.EvidenceOut.model_validate(evidence).model_dump(),
        message="Evidence uploaded",
    )
