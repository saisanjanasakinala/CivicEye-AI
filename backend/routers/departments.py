"""
Departments router — /api/departments
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("/", response_model=schemas.Response)
def list_departments(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    depts = db.query(models.Department).filter(models.Department.is_active == True).all()  # noqa: E712

    result = []
    for dept in depts:
        total = db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.department_id == dept.id
        ).scalar() or 0

        open_count = db.query(func.count(models.Complaint.id)).filter(
            models.Complaint.department_id == dept.id,
            models.Complaint.status.in_(["new", "assigned", "in_progress", "awaiting_verification"]),
        ).scalar() or 0

        d = schemas.DepartmentOut.model_validate(dept).model_dump()
        d["complaint_count"] = total
        d["open_count"] = open_count
        result.append(d)

    return schemas.Response(success=True, data=result, message=f"{len(result)} departments")


@router.get("/{dept_id}/queue", response_model=schemas.Response)
def department_queue(
    dept_id: int,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    q = db.query(models.Complaint).filter(models.Complaint.department_id == dept_id)
    if status:
        q = q.filter(models.Complaint.status == status)
    else:
        # Default: open items
        q = q.filter(
            models.Complaint.status.in_(["new", "assigned", "in_progress", "awaiting_verification"])
        )

    complaints = q.order_by(models.Complaint.first_detected_at.asc()).all()
    data = [schemas.ComplaintOut.model_validate(c).model_dump() for c in complaints]
    return schemas.Response(
        success=True,
        data={"department": schemas.DepartmentOut.model_validate(dept).model_dump(), "queue": data},
        message=f"{len(data)} items in queue",
    )


@router.put("/{dept_id}/routing-rules", response_model=schemas.Response)
def update_routing_rules(
    dept_id: int,
    payload: schemas.RoutingRulesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    dept.problem_categories = payload.problem_categories
    if payload.contact_email:
        dept.contact_email = payload.contact_email

    db.commit()
    db.refresh(dept)
    return schemas.Response(
        success=True,
        data=schemas.DepartmentOut.model_validate(dept).model_dump(),
        message="Routing rules updated",
    )
