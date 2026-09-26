"""
Department Routing Service

Determines which department should handle a given complaint category.
Rules are read from the departments table (problem_categories JSON column)
and fall back to hardcoded defaults when no DB match is found.
"""

from __future__ import annotations

from typing import Optional
from sqlalchemy.orm import Session

import models

# Hardcoded fallback routing rules (category → department code)
DEFAULT_ROUTING: dict[str, str] = {
    "Pothole": "ROADS",
    "Road Damage": "ROADS",
    "Broken Road": "ROADS",
    "Garbage": "SANITATION",
    "Illegal Dumping": "SANITATION",
    "Open Drain": "DRAINAGE",
    "Waterlogging": "DRAINAGE",
    "Fallen Tree": "PARKS",
    "Broken Streetlight": "ELECTRICAL",
    "Stray Animals": "SANITATION",
}


def route_complaint(
    db: Session,
    category: str,
) -> dict:
    """
    Return routing suggestion for a complaint category.

    Returns:
        {
            department_id: Optional[int],
            department_code: Optional[str],
            department_name: Optional[str],
            routing_rule_used: str,    # "db_rule" | "default_rule" | "unrouted"
            confidence: float
        }
    """
    # 1. Check DB-driven rules: find a department whose problem_categories includes this category
    all_depts = db.query(models.Department).filter(models.Department.is_active == True).all()  # noqa: E712

    for dept in all_depts:
        cats = dept.problem_categories or []
        if category in cats:
            return {
                "department_id": dept.id,
                "department_code": dept.code,
                "department_name": dept.name,
                "routing_rule_used": "db_rule",
                "confidence": 0.95,
            }

    # 2. Fallback: hardcoded default routing
    dept_code = DEFAULT_ROUTING.get(category)
    if dept_code:
        dept = db.query(models.Department).filter(models.Department.code == dept_code).first()
        if dept:
            return {
                "department_id": dept.id,
                "department_code": dept.code,
                "department_name": dept.name,
                "routing_rule_used": "default_rule",
                "confidence": 0.75,
            }

    # 3. No match
    return {
        "department_id": None,
        "department_code": None,
        "department_name": None,
        "routing_rule_used": "unrouted",
        "confidence": 0.0,
    }


def assign_department(
    db: Session,
    complaint: models.Complaint,
    department_id: int,
    assigned_by_id: Optional[int] = None,
) -> models.Complaint:
    """
    Assign a department to a complaint and record the status transition.
    """
    from datetime import datetime

    old_status = complaint.status
    complaint.department_id = department_id
    if complaint.status == "new":
        complaint.status = "assigned"

    # Record status history
    history = models.StatusHistory(
        complaint_id=complaint.id,
        old_status=old_status,
        new_status=complaint.status,
        changed_by=assigned_by_id,
        changed_at=datetime.utcnow(),
        notes=f"Auto-routed to department id={department_id}",
    )
    db.add(history)
    db.commit()
    db.refresh(complaint)
    return complaint
