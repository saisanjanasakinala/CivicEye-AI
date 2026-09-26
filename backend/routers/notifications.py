"""
Notifications router — /api/notifications
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/", response_model=schemas.Response)
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Notification).filter(models.Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(models.Notification.is_read == False)  # noqa: E712
    notifications = q.order_by(models.Notification.created_at.desc()).limit(100).all()
    data = [schemas.NotificationOut.model_validate(n).model_dump() for n in notifications]
    unread_count = sum(1 for n in notifications if not n.is_read)
    return schemas.Response(
        success=True,
        data={"notifications": data, "unread_count": unread_count},
        message=f"{len(data)} notifications",
    )


@router.put("/{notification_id}/read", response_model=schemas.Response)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    return schemas.Response(success=True, data=None, message="Marked as read")


@router.put("/read-all", response_model=schemas.Response)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return schemas.Response(success=True, data=None, message="All notifications marked as read")
