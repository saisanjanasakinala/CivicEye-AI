"""
Verification Service

Handles the status lifecycle transitions and verification workflow for complaints.

Status flow:
  new → assigned → in_progress → awaiting_verification → resolved → closed

Officers move complaints to awaiting_verification after field work.
Supervisors/admins can verify (resolve) or reject (send back to in_progress).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

import models

VALID_TRANSITIONS: dict[str, list[str]] = {
    "new": ["assigned", "closed"],
    "assigned": ["in_progress", "closed"],
    "in_progress": ["awaiting_verification", "closed"],
    "awaiting_verification": ["resolved", "in_progress"],  # resolved or reject back
    "resolved": ["closed"],
    "closed": [],  # terminal
}


def can_transition(current_status: str, new_status: str) -> bool:
    return new_status in VALID_TRANSITIONS.get(current_status, [])


def transition_status(
    db: Session,
    complaint: models.Complaint,
    new_status: str,
    changed_by_id: Optional[int],
    notes: Optional[str] = None,
) -> models.Complaint:
    """
    Apply a status transition, recording history and timestamps.
    Raises ValueError for invalid transitions.
    """
    old_status = complaint.status

    if not can_transition(old_status, new_status):
        raise ValueError(
            f"Cannot transition complaint from '{old_status}' to '{new_status}'. "
            f"Allowed: {VALID_TRANSITIONS.get(old_status, [])}"
        )

    complaint.status = new_status
    if new_status == "resolved":
        complaint.resolved_at = datetime.utcnow()
        if notes:
            complaint.resolution_notes = notes
    elif new_status == "in_progress" and old_status == "awaiting_verification":
        # Rejection — clear resolved_at if it was set prematurely
        complaint.resolved_at = None

    history = models.StatusHistory(
        complaint_id=complaint.id,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by_id,
        changed_at=datetime.utcnow(),
        notes=notes,
    )
    db.add(history)
    db.commit()
    db.refresh(complaint)
    return complaint


def create_status_notification(
    db: Session,
    complaint: models.Complaint,
    new_status: str,
    target_user_id: Optional[int],
):
    """Create a notification for a status change."""
    if target_user_id is None:
        return

    status_messages = {
        "assigned": ("Complaint Assigned", f"Complaint {complaint.complaint_id} has been assigned to your department."),
        "in_progress": ("Work Started", f"Work has started on complaint {complaint.complaint_id}."),
        "awaiting_verification": ("Verification Needed", f"Complaint {complaint.complaint_id} is awaiting verification."),
        "resolved": ("Complaint Resolved", f"Complaint {complaint.complaint_id} has been resolved."),
        "closed": ("Complaint Closed", f"Complaint {complaint.complaint_id} has been closed."),
    }

    if new_status not in status_messages:
        return

    title, message = status_messages[new_status]
    notif_type = "success" if new_status in ("resolved", "closed") else "info"

    notification = models.Notification(
        user_id=target_user_id,
        title=title,
        message=message,
        type=notif_type,
        complaint_id=complaint.id,
        created_at=datetime.utcnow(),
    )
    db.add(notification)
    db.commit()
