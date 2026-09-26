"""
Detections router — /api/detections
"""

import os
import uuid
import base64
import aiofiles
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user
from services.cv_service import analyze_image, get_supported_categories
from services.duplicate_service import check_duplicate, merge_into_existing
from services.routing_service import route_complaint

router = APIRouter(prefix="/api/detections", tags=["detections"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")


def _generate_complaint_id() -> str:
    ts = datetime.utcnow().strftime("%Y%m%d")
    short = uuid.uuid4().hex[:6].upper()
    return f"CE-{ts}-{short}"


def _severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.85:
        return "high"
    elif confidence >= 0.70:
        return "medium"
    return "low"


async def _save_image_base64(image_base64: str) -> Optional[str]:
    """Save base64 image to disk, return file path."""
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        image_bytes = base64.b64decode(image_base64)
        filename = f"{uuid.uuid4().hex}.jpg"
        file_path = os.path.join(UPLOAD_DIR, filename)
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(image_bytes)
        return file_path
    except Exception:
        return None


# ── POST /analyze ─────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=schemas.Response)
async def analyze(
    payload: schemas.AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    image_path: Optional[str] = None
    if payload.image_base64:
        image_path = await _save_image_base64(payload.image_base64)

    raw_detections = analyze_image(payload.image_base64)

    detection_records: List[models.Detection] = []
    complaints_created: List[str] = []
    complaints_updated: List[str] = []

    for det in raw_detections:
        det_record = models.Detection(
            bus_id=payload.bus_id,
            category=det["category"],
            confidence=det["confidence"],
            bbox=det.get("bbox"),
            image_path=image_path,
            timestamp=datetime.utcnow(),
            latitude=payload.latitude,
            longitude=payload.longitude,
            is_simulated=det["is_simulated"],
        )
        db.add(det_record)
        db.flush()

        if not payload.auto_create_complaints:
            detection_records.append(det_record)
            continue

        # Duplicate check
        dup_result = check_duplicate(db, det["category"], payload.latitude, payload.longitude)

        if dup_result["is_duplicate"]:
            existing = merge_into_existing(db, dup_result["existing_complaint_db_id"], det_record.id)
            complaints_updated.append(existing.complaint_id)
        else:
            # Create new complaint
            routing = route_complaint(db, det["category"])
            severity = _severity_from_confidence(det["confidence"])

            complaint = models.Complaint(
                complaint_id=_generate_complaint_id(),
                category=det["category"],
                description=f"Auto-detected by bus camera. Category: {det['category']}.",
                latitude=payload.latitude,
                longitude=payload.longitude,
                bus_id=payload.bus_id,
                severity=severity,
                status="new",
                department_id=routing.get("department_id"),
                observation_count=1,
                first_detected_at=datetime.utcnow(),
                last_detected_at=datetime.utcnow(),
                evidence_image_path=image_path,
            )
            db.add(complaint)
            db.flush()

            det_record.complaint_id = complaint.id

            history = models.StatusHistory(
                complaint_id=complaint.id,
                old_status=None,
                new_status="new",
                changed_by=None,
                changed_at=datetime.utcnow(),
                notes="Auto-created from bus camera detection",
            )
            db.add(history)
            complaints_created.append(complaint.complaint_id)

        detection_records.append(det_record)

    db.commit()
    for d in detection_records:
        db.refresh(d)

    return schemas.Response(
        success=True,
        data=schemas.AnalyzeResponse(
            detections=[schemas.DetectionOut.model_validate(d).model_dump() for d in detection_records],
            complaints_created=complaints_created,
            complaints_updated=complaints_updated,
        ).model_dump(),
        message=f"{len(detection_records)} detections processed, {len(complaints_created)} new complaints, {len(complaints_updated)} updated",
    )


# ── POST /video-frame ─────────────────────────────────────────────────────────

@router.post("/video-frame", response_model=schemas.Response)
async def process_video_frame(
    bus_id: Optional[int] = Form(None),
    latitude: float = Form(...),
    longitude: float = Form(...),
    frame: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Process a single video frame uploaded as multipart/form-data."""
    content = await frame.read()
    image_base64 = base64.b64encode(content).decode("utf-8")

    # Reuse analyze logic
    req = schemas.AnalyzeRequest(
        bus_id=bus_id,
        latitude=latitude,
        longitude=longitude,
        image_base64=image_base64,
        auto_create_complaints=True,
    )

    # Delegate to analyze (inline to avoid HTTP call overhead)
    image_path: Optional[str] = await _save_image_base64(image_base64)
    raw_detections = analyze_image(image_base64)

    detection_records: List[models.Detection] = []
    complaints_created: List[str] = []
    complaints_updated: List[str] = []

    for det in raw_detections:
        det_record = models.Detection(
            bus_id=bus_id,
            category=det["category"],
            confidence=det["confidence"],
            bbox=det.get("bbox"),
            image_path=image_path,
            timestamp=datetime.utcnow(),
            latitude=latitude,
            longitude=longitude,
            is_simulated=det["is_simulated"],
        )
        db.add(det_record)
        db.flush()

        dup_result = check_duplicate(db, det["category"], latitude, longitude)
        if dup_result["is_duplicate"]:
            existing = merge_into_existing(db, dup_result["existing_complaint_db_id"], det_record.id)
            complaints_updated.append(existing.complaint_id)
        else:
            routing = route_complaint(db, det["category"])
            severity = _severity_from_confidence(det["confidence"])
            complaint = models.Complaint(
                complaint_id=_generate_complaint_id(),
                category=det["category"],
                description=f"Detected via video frame from bus {bus_id}.",
                latitude=latitude,
                longitude=longitude,
                bus_id=bus_id,
                severity=severity,
                status="new",
                department_id=routing.get("department_id"),
                observation_count=1,
                first_detected_at=datetime.utcnow(),
                last_detected_at=datetime.utcnow(),
                evidence_image_path=image_path,
            )
            db.add(complaint)
            db.flush()
            det_record.complaint_id = complaint.id
            db.add(models.StatusHistory(
                complaint_id=complaint.id,
                old_status=None,
                new_status="new",
                changed_by=None,
                changed_at=datetime.utcnow(),
                notes="Auto-created from video frame",
            ))
            complaints_created.append(complaint.complaint_id)

        detection_records.append(det_record)

    db.commit()
    for d in detection_records:
        db.refresh(d)

    return schemas.Response(
        success=True,
        data={
            "detections": [schemas.DetectionOut.model_validate(d).model_dump() for d in detection_records],
            "complaints_created": complaints_created,
            "complaints_updated": complaints_updated,
        },
        message=f"Frame processed: {len(detection_records)} detections",
    )


# ── GET / (recent detections) ─────────────────────────────────────────────────

@router.get("/", response_model=schemas.Response)
def list_detections(
    bus_id: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.Detection)
    if bus_id:
        q = q.filter(models.Detection.bus_id == bus_id)
    detections = q.order_by(models.Detection.timestamp.desc()).limit(limit).all()
    data = [schemas.DetectionOut.model_validate(d).model_dump() for d in detections]
    return schemas.Response(success=True, data=data, message=f"{len(data)} detections")


# ── GET /categories ───────────────────────────────────────────────────────────

@router.get("/categories", response_model=schemas.Response)
def list_categories(_: models.User = Depends(get_current_user)):
    return schemas.Response(
        success=True,
        data=get_supported_categories(),
        message="Supported detection categories",
    )
