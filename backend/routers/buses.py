"""
Buses router — /api/buses
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/buses", tags=["buses"])


@router.get("/", response_model=schemas.Response)
def list_buses(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    buses = db.query(models.Bus).all()
    data = [schemas.BusOut.model_validate(b).model_dump() for b in buses]
    return schemas.Response(success=True, data=data, message=f"{len(data)} buses found")


@router.get("/{bus_id}/route", response_model=schemas.Response)
def get_bus_route(
    bus_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    bus = db.query(models.Bus).filter(models.Bus.id == bus_id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")

    route = db.query(models.Route).filter(models.Route.bus_id == bus_id).order_by(models.Route.created_at.desc()).first()
    if not route:
        return schemas.Response(success=True, data=None, message="No route found for this bus")

    return schemas.Response(
        success=True,
        data=schemas.RouteOut.model_validate(route).model_dump(),
        message="Route retrieved",
    )


@router.post("/{bus_id}/gps", response_model=schemas.Response)
def record_gps(
    bus_id: int,
    payload: schemas.GPSObservationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    bus = db.query(models.Bus).filter(models.Bus.id == bus_id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")

    obs = models.GPSObservation(
        bus_id=bus_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed=payload.speed,
        timestamp=payload.timestamp or datetime.utcnow(),
    )
    db.add(obs)

    bus.last_seen_at = obs.timestamp
    db.commit()
    db.refresh(obs)

    return schemas.Response(
        success=True,
        data=schemas.GPSObservationOut.model_validate(obs).model_dump(),
        message="GPS observation recorded",
    )


@router.get("/{bus_id}/detections", response_model=schemas.Response)
def get_bus_detections(
    bus_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    bus = db.query(models.Bus).filter(models.Bus.id == bus_id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")

    detections = (
        db.query(models.Detection)
        .filter(models.Detection.bus_id == bus_id)
        .order_by(models.Detection.timestamp.desc())
        .limit(limit)
        .all()
    )
    data = [schemas.DetectionOut.model_validate(d).model_dump() for d in detections]
    return schemas.Response(success=True, data=data, message=f"{len(data)} detections")
