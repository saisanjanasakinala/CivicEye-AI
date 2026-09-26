"""
Duplicate Detection Service

Compares a new detection's GPS coordinates against existing unresolved complaints
of the same category using the Haversine formula.

Thresholds:
  - < 50 m  → definite duplicate
  - 50–100 m → borderline (flag for manual review)
  - > 100 m  → new complaint
"""

from __future__ import annotations

import math
from typing import Optional
from sqlalchemy.orm import Session

import models

DUPLICATE_THRESHOLD_M = 50.0
BORDERLINE_THRESHOLD_M = 100.0

OPEN_STATUSES = {"new", "assigned", "in_progress", "awaiting_verification"}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two GPS coordinates."""
    R = 6_371_000.0  # Earth radius in metres
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def check_duplicate(
    db: Session,
    category: str,
    latitude: float,
    longitude: float,
) -> dict:
    """
    Check whether a new detection is a duplicate of an existing open complaint.

    Returns:
        {
            is_duplicate: bool,
            is_borderline: bool,
            existing_complaint_id: Optional[str],
            existing_complaint_db_id: Optional[int],
            distance_meters: Optional[float],
            confidence: float  (0.0–1.0)
        }
    """
    existing = (
        db.query(models.Complaint)
        .filter(
            models.Complaint.category == category,
            models.Complaint.status.in_(OPEN_STATUSES),
        )
        .all()
    )

    best_match: Optional[models.Complaint] = None
    best_distance: float = float("inf")

    for complaint in existing:
        dist = _haversine(latitude, longitude, complaint.latitude, complaint.longitude)
        if dist < best_distance:
            best_distance = dist
            best_match = complaint

    if best_match is None or best_distance > BORDERLINE_THRESHOLD_M:
        return {
            "is_duplicate": False,
            "is_borderline": False,
            "existing_complaint_id": None,
            "existing_complaint_db_id": None,
            "distance_meters": round(best_distance, 2) if best_match else None,
            "confidence": 0.0,
        }

    is_duplicate = best_distance <= DUPLICATE_THRESHOLD_M
    is_borderline = not is_duplicate  # 50–100 m

    # Confidence: 1.0 at 0 m → 0.5 at DUPLICATE_THRESHOLD_M → 0.0 at BORDERLINE_THRESHOLD_M
    if is_duplicate:
        confidence = round(1.0 - (best_distance / DUPLICATE_THRESHOLD_M) * 0.5, 3)
    else:
        confidence = round(0.5 - ((best_distance - DUPLICATE_THRESHOLD_M) / DUPLICATE_THRESHOLD_M) * 0.5, 3)

    return {
        "is_duplicate": is_duplicate,
        "is_borderline": is_borderline,
        "existing_complaint_id": best_match.complaint_id,
        "existing_complaint_db_id": best_match.id,
        "distance_meters": round(best_distance, 2),
        "confidence": confidence,
    }


def merge_into_existing(
    db: Session,
    existing_complaint_db_id: int,
    detection_id: Optional[int] = None,
) -> models.Complaint:
    """
    Increment observation_count and update last_detected_at on an existing complaint.
    Optionally link a detection record to it.
    """
    from datetime import datetime

    complaint = db.query(models.Complaint).filter(models.Complaint.id == existing_complaint_db_id).first()
    if not complaint:
        raise ValueError(f"Complaint id={existing_complaint_db_id} not found")

    complaint.observation_count += 1
    complaint.last_detected_at = datetime.utcnow()

    if detection_id is not None:
        detection = db.query(models.Detection).filter(models.Detection.id == detection_id).first()
        if detection:
            detection.complaint_id = complaint.id

    db.commit()
    db.refresh(complaint)
    return complaint
