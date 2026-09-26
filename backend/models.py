from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    problem_categories = Column(JSON, default=list)
    contact_email = Column(String(200))
    is_active = Column(Boolean, default=True)

    users = relationship("User", back_populates="department")
    complaints = relationship("Complaint", back_populates="department")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="citizen")  # admin / officer / citizen
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    department = relationship("Department", back_populates="users")
    notifications = relationship("Notification", back_populates="user")
    assignments_given = relationship("Assignment", foreign_keys="Assignment.assigned_by", back_populates="assigner")
    assignments_received = relationship("Assignment", foreign_keys="Assignment.assigned_to", back_populates="assignee")


class Bus(Base):
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, index=True)
    bus_number = Column(String(20), unique=True, nullable=False)
    registration_number = Column(String(30), nullable=True)   # e.g. MH-12-AB-1234
    route_name = Column(String(100))
    driver_name = Column(String(100))
    driver_phone = Column(String(20), nullable=True)
    driver_license = Column(String(30), nullable=True)
    is_active = Column(Boolean, default=True)
    operational_status = Column(String(20), default="active")  # active / maintenance / offline
    last_seen_at = Column(DateTime, nullable=True)
    # Latest GPS snapshot (updated on each GPS observation)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    current_speed = Column(Float, default=0.0)  # km/h

    routes = relationship("Route", back_populates="bus")
    gps_observations = relationship("GPSObservation", back_populates="bus")
    detections = relationship("Detection", back_populates="bus")
    complaints = relationship("Complaint", back_populates="bus")


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False)
    name = Column(String(100))
    waypoints = Column(JSON, default=list)  # list of {lat, lng, name}
    created_at = Column(DateTime, default=datetime.utcnow)

    bus = relationship("Bus", back_populates="routes")


class GPSObservation(Base):
    __tablename__ = "gps_observations"

    id = Column(Integer, primary_key=True, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    speed = Column(Float, default=0.0)  # km/h

    bus = relationship("Bus", back_populates="gps_observations")


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=True)
    category = Column(String(50), nullable=False)
    confidence = Column(Float, default=0.0)
    bbox = Column(JSON, nullable=True)  # {x1, y1, x2, y2}
    image_path = Column(String(500), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_simulated = Column(Boolean, default=False)

    bus = relationship("Bus", back_populates="detections")
    complaint = relationship("Complaint", back_populates="detections")


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(String(30), unique=True, nullable=False, index=True)
    category = Column(String(50), nullable=False)
    description = Column(Text)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=True)
    severity = Column(String(20), default="medium")  # low/medium/high/critical
    status = Column(String(30), default="new")  # new/assigned/in_progress/awaiting_verification/resolved/closed
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    observation_count = Column(Integer, default=1)
    first_detected_at = Column(DateTime, default=datetime.utcnow)
    last_detected_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    evidence_image_path = Column(String(500), nullable=True)
    # Anonymous citizen reporter fields (no PII stored beyond what reporter chooses)
    reporter_name = Column(String(100), nullable=True)
    reporter_contact = Column(String(200), nullable=True)   # email or phone (optional, hashed for privacy)
    is_anonymous = Column(Boolean, default=False)
    source = Column(String(20), default="ai_camera")  # ai_camera / citizen / officer

    bus = relationship("Bus", back_populates="complaints")
    department = relationship("Department", back_populates="complaints")
    detections = relationship("Detection", back_populates="complaint")
    evidence = relationship("Evidence", back_populates="complaint")
    assignments = relationship("Assignment", back_populates="complaint")
    status_history = relationship("StatusHistory", back_populates="complaint")
    notifications = relationship("Notification", back_populates="complaint")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    image_path = Column(String(500), nullable=False)
    image_type = Column(String(20), default="detection")  # before/after/detection
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    complaint = relationship("Complaint", back_populates="evidence")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    complaint = relationship("Complaint", back_populates="assignments")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assignments_received")
    assigner = relationship("User", foreign_keys=[assigned_by], back_populates="assignments_given")


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    old_status = Column(String(30))
    new_status = Column(String(30), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    complaint = relationship("Complaint", back_populates="status_history")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text)
    type = Column(String(50), default="info")  # info/warning/success/error
    is_read = Column(Boolean, default=False)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")
    complaint = relationship("Complaint", back_populates="notifications")
