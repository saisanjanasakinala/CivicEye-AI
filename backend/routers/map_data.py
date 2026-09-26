"""
Map data router — /api/map
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/complaints", response_model=schemas.Response)
def map_complaints(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """All complaint markers with properties for map rendering."""
    complaints = db.query(models.Complaint).options(
        joinedload(models.Complaint.department)
    ).all()

    markers = []
    for c in complaints:
        dept_name = c.department.name if c.department else None
        markers.append(schemas.MapComplaintMarker(
            id=c.id,
            complaint_id=c.complaint_id,
            category=c.category,
            latitude=c.latitude,
            longitude=c.longitude,
            severity=c.severity,
            status=c.status,
            observation_count=c.observation_count,
            department_name=dept_name,
            first_detected_at=c.first_detected_at,
            description=c.description,
        ).model_dump())

    return schemas.Response(success=True, data=markers, message=f"{len(markers)} markers")


@router.get("/heatmap", response_model=schemas.Response)
def heatmap(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """
    Heatmap data points — weight by observation_count.
    Higher observation_count = more intense heat.
    """
    complaints = db.query(
        models.Complaint.latitude,
        models.Complaint.longitude,
        models.Complaint.observation_count,
    ).all()

    max_obs = max((obs for _, _, obs in complaints), default=1)

    points = [
        schemas.HeatmapPoint(
            lat=lat,
            lng=lng,
            weight=round(obs / max_obs, 3),
        ).model_dump()
        for lat, lng, obs in complaints
    ]

    return schemas.Response(success=True, data=points, message=f"{len(points)} heatmap points")
