"""
Analytics router — /api/analytics
"""

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case

import models
import schemas
from database import get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=schemas.Response)
def summary(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    total = db.query(func.count(models.Complaint.id)).scalar() or 0

    def _count(status_val: str) -> int:
        return db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.status == status_val
        ).scalar() or 0

    new = _count("new")
    assigned = _count("assigned")
    in_progress = _count("in_progress")
    awaiting = _count("awaiting_verification")
    resolved = _count("resolved")
    closed = _count("closed")

    # Average resolution time (hours) for resolved/closed
    resolved_complaints = (
        db.query(models.Complaint.first_detected_at, models.Complaint.resolved_at)
        .filter(
            models.Complaint.status.in_(["resolved", "closed"]),
            models.Complaint.resolved_at != None,  # noqa: E711
        )
        .all()
    )
    if resolved_complaints:
        deltas = [
            (r.resolved_at - r.first_detected_at).total_seconds() / 3600
            for r in resolved_complaints
            if r.resolved_at and r.first_detected_at
        ]
        avg_hours = round(sum(deltas) / len(deltas), 1) if deltas else None
    else:
        avg_hours = None

    resolution_rate = round((resolved + closed) / total * 100, 1) if total else 0.0

    return schemas.Response(
        success=True,
        data=schemas.AnalyticsSummary(
            total=total,
            new=new,
            assigned=assigned,
            in_progress=in_progress,
            awaiting_verification=awaiting,
            resolved=resolved,
            closed=closed,
            avg_resolution_hours=avg_hours,
            resolution_rate_pct=resolution_rate,
        ).model_dump(),
        message="Analytics summary",
    )


@router.get("/by-category", response_model=schemas.Response)
def by_category(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Complaint.category, func.count(models.Complaint.id))
        .group_by(models.Complaint.category)
        .all()
    )
    result = []
    for category, count in rows:
        resolved = db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.category == category,
            models.Complaint.status.in_(["resolved", "closed"]),
        ).scalar() or 0
        result.append(schemas.CategoryStat(
            category=category,
            count=count,
            resolved=resolved,
            pending=count - resolved,
        ).model_dump())

    return schemas.Response(success=True, data=result, message=f"{len(result)} categories")


@router.get("/by-department", response_model=schemas.Response)
def by_department(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    depts = db.query(models.Department).all()
    result = []
    for dept in depts:
        count = db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.department_id == dept.id
        ).scalar() or 0
        resolved = db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.department_id == dept.id,
            models.Complaint.status.in_(["resolved", "closed"]),
        ).scalar() or 0
        result.append(schemas.DepartmentStat(
            department=dept.name,
            count=count,
            resolved=resolved,
            open=count - resolved,
        ).model_dump())

    return schemas.Response(success=True, data=result, message=f"{len(result)} departments")


@router.get("/by-severity", response_model=schemas.Response)
def by_severity(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Complaint.severity, func.count(models.Complaint.id))
        .group_by(models.Complaint.severity)
        .all()
    )
    result = [schemas.SeverityStat(severity=s, count=c).model_dump() for s, c in rows]
    return schemas.Response(success=True, data=result, message=f"{len(result)} severity levels")


@router.get("/timeline", response_model=schemas.Response)
def timeline(
    days: int = 30,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=days)
    complaints = (
        db.query(models.Complaint.first_detected_at)
        .filter(models.Complaint.first_detected_at >= since)
        .all()
    )

    # Aggregate by date string
    counts: dict[str, int] = {}
    for (ts,) in complaints:
        date_str = ts.strftime("%Y-%m-%d")
        counts[date_str] = counts.get(date_str, 0) + 1

    # Fill gaps with 0
    result = []
    for i in range(days):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        result.append(schemas.TimelinePoint(date=d, count=counts.get(d, 0)).model_dump())

    return schemas.Response(success=True, data=result, message=f"Timeline for last {days} days")


@router.get("/hotspots", response_model=schemas.Response)
def hotspots(
    radius_m: float = 100.0,
    min_count: int = 2,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """
    Return recurring problem locations.
    Simple approach: group by rounded lat/lng (≈100 m grid) and count.
    """
    complaints = db.query(
        models.Complaint.latitude,
        models.Complaint.longitude,
        models.Complaint.category,
    ).all()

    # Grid cell size ≈ 0.001 degrees ≈ 111 m
    GRID = 0.001

    clusters: dict[tuple, dict] = {}
    for lat, lng, cat in complaints:
        key = (round(lat / GRID) * GRID, round(lng / GRID) * GRID, cat)
        if key not in clusters:
            clusters[key] = {"latitude": key[0], "longitude": key[1], "category": cat, "count": 0}
        clusters[key]["count"] += 1

    hotspot_list = [
        schemas.HotspotPoint(**v).model_dump()
        for v in clusters.values()
        if v["count"] >= min_count
    ]
    hotspot_list.sort(key=lambda x: x["count"], reverse=True)

    return schemas.Response(success=True, data=hotspot_list, message=f"{len(hotspot_list)} hotspots found")
