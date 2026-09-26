"""
Sample data seeder for CivicEye AI.

Run:  python sample_data.py

Seeds:
  - 5 departments (Roads, Sanitation, Parks, Drainage, Electrical)
  - 4 demo users (admin, officer1, officer2, citizen1)
  - 3 buses with realistic Pune route waypoints
  - 25 complaints spread over last 30 days at various stages
  - Status history and notifications for several complaints
"""

import os
import sys
import uuid
import random
from datetime import datetime, timedelta

# Ensure backend directory is on the path when run directly
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("DATABASE_URL", "sqlite:///./civiceye.db")

from database import SessionLocal, init_db  # noqa: E402
import models  # noqa: E402
from auth_utils import hash_password  # noqa: E402


def _hash(pw: str) -> str:
    return hash_password(pw)


def _cid() -> str:
    ts = datetime.utcnow().strftime("%Y%m%d")
    return f"CE-{ts}-{uuid.uuid4().hex[:6].upper()}"


def _days_ago(n: float) -> datetime:
    return datetime.utcnow() - timedelta(days=n)


# ── Pune GPS waypoints (realistic lat/lng) ─────────────────────────────────────
PUNE_ROUTES = {
    "Route 11 — Swargate to Katraj": [
        {"lat": 18.5018, "lng": 73.8560, "name": "Swargate Bus Stand"},
        {"lat": 18.4975, "lng": 73.8538, "name": "Bibwewadi Corner"},
        {"lat": 18.4892, "lng": 73.8503, "name": "Anand Nagar"},
        {"lat": 18.4815, "lng": 73.8474, "name": "Katraj Chowk"},
        {"lat": 18.4762, "lng": 73.8441, "name": "Katraj Bus Depot"},
    ],
    "Route 47 — Shivajinagar to Hadapsar": [
        {"lat": 18.5308, "lng": 73.8474, "name": "Shivajinagar Station"},
        {"lat": 18.5265, "lng": 73.8602, "name": "Deccan Gymkhana"},
        {"lat": 18.5142, "lng": 73.8732, "name": "Pune Railway Station"},
        {"lat": 18.5081, "lng": 73.8901, "name": "Sangamwadi"},
        {"lat": 18.5010, "lng": 73.9168, "name": "Hadapsar Bus Stop"},
    ],
    "Route 99 — Kothrud to Viman Nagar": [
        {"lat": 18.5074, "lng": 73.8077, "name": "Kothrud Depot"},
        {"lat": 18.5130, "lng": 73.8254, "name": "Karve Nagar"},
        {"lat": 18.5200, "lng": 73.8474, "name": "Shivajinagar"},
        {"lat": 18.5308, "lng": 73.8997, "name": "Pune Airport Rd"},
        {"lat": 18.5642, "lng": 73.9145, "name": "Viman Nagar"},
    ],
}

# Complaint scenarios with realistic Pune descriptions
COMPLAINT_SCENARIOS = [
    {
        "category": "Pothole",
        "severity": "high",
        "description": "Deep pothole on Swargate-Bibwewadi road near Anand petrol pump. Approx 2 ft wide, causing vehicle damage.",
        "lat": 18.4985, "lng": 73.8542,
    },
    {
        "category": "Pothole",
        "severity": "critical",
        "description": "Multiple potholes on Katraj Ghat stretch, dangerous for two-wheelers especially at night.",
        "lat": 18.4830, "lng": 73.8488,
    },
    {
        "category": "Pothole",
        "severity": "medium",
        "description": "Pothole near Deccan Gymkhana bus stop, road dug up but not repaired after water pipeline work.",
        "lat": 18.5270, "lng": 73.8610,
    },
    {
        "category": "Garbage",
        "severity": "high",
        "description": "Large garbage mound near Hadapsar market, not cleared for 5+ days. Foul smell affecting nearby residents.",
        "lat": 18.5015, "lng": 73.9180,
    },
    {
        "category": "Garbage",
        "severity": "medium",
        "description": "Overflowing dustbins outside Shivajinagar station area. Waste spilling onto footpath.",
        "lat": 18.5315, "lng": 73.8465,
    },
    {
        "category": "Garbage",
        "severity": "low",
        "description": "Scattered plastic waste behind Kothrud bus depot compound wall.",
        "lat": 18.5068, "lng": 73.8090,
    },
    {
        "category": "Waterlogging",
        "severity": "critical",
        "description": "Severe waterlogging on Sangamwadi road after rain, water level reaching 1.5 ft. Traffic at standstill.",
        "lat": 18.5090, "lng": 73.8905,
    },
    {
        "category": "Waterlogging",
        "severity": "high",
        "description": "Water accumulation near Karve Nagar underpass, vehicles getting stranded.",
        "lat": 18.5128, "lng": 73.8260,
    },
    {
        "category": "Fallen Tree",
        "severity": "critical",
        "description": "Large rain tree fallen across Viman Nagar main road blocking both lanes. Emergency clearance needed.",
        "lat": 18.5638, "lng": 73.9152,
    },
    {
        "category": "Fallen Tree",
        "severity": "high",
        "description": "Tree branch fallen on electricity wire near Deccan bus stop. Power line sagging dangerously.",
        "lat": 18.5260, "lng": 73.8598,
    },
    {
        "category": "Broken Streetlight",
        "severity": "medium",
        "description": "Three consecutive streetlights non-functional on Bibwewadi main road. Area very dark at night.",
        "lat": 18.4978, "lng": 73.8540,
    },
    {
        "category": "Broken Streetlight",
        "severity": "medium",
        "description": "Street light pole tilted and hanging loose near Katraj Circle. Hazard to pedestrians.",
        "lat": 18.4820, "lng": 73.8478,
    },
    {
        "category": "Broken Streetlight",
        "severity": "low",
        "description": "Flickering street light outside Pune Railway Station gate no. 3.",
        "lat": 18.5148, "lng": 73.8740,
    },
    {
        "category": "Open Drain",
        "severity": "high",
        "description": "Open storm drain without cover near Hadapsar industrial area. Child fell in yesterday. Urgent cover needed.",
        "lat": 18.5008, "lng": 73.9175,
    },
    {
        "category": "Open Drain",
        "severity": "medium",
        "description": "Drain cover missing on Shivajinagar-Deccan stretch, visible open drain of 3 ft depth.",
        "lat": 18.5295, "lng": 73.8490,
    },
    {
        "category": "Illegal Dumping",
        "severity": "high",
        "description": "Construction debris dumped illegally on footpath near Anand Nagar school. Children's safety at risk.",
        "lat": 18.4895, "lng": 73.8510,
    },
    {
        "category": "Illegal Dumping",
        "severity": "medium",
        "description": "Old mattresses and furniture dumped near Sangamwadi bridge approach.",
        "lat": 18.5080, "lng": 73.8910,
    },
    {
        "category": "Stray Animals",
        "severity": "medium",
        "description": "Large pack of stray dogs near Kothrud market area. Two biting incidents reported this week.",
        "lat": 18.5072, "lng": 73.8082,
    },
    {
        "category": "Pothole",
        "severity": "high",
        "description": "Road cave-in near Karve statue chowk. Pothole 3 ft deep, police barricade in place but no repair.",
        "lat": 18.5135, "lng": 73.8256,
    },
    {
        "category": "Garbage",
        "severity": "critical",
        "description": "Garbage truck not coming to Viman Nagar sector 4 for 7 days. Residents dumping on street.",
        "lat": 18.5645, "lng": 73.9148,
    },
    {
        "category": "Waterlogging",
        "severity": "medium",
        "description": "Low-lying area near Bibwewadi temple fills with water every monsoon. Permanent fix needed.",
        "lat": 18.4980, "lng": 73.8536,
    },
    {
        "category": "Broken Streetlight",
        "severity": "high",
        "description": "All 5 lights on Hadapsar lane 6 not working for 10 days. Women feel unsafe walking at night.",
        "lat": 18.5018, "lng": 73.9172,
    },
    {
        "category": "Fallen Tree",
        "severity": "medium",
        "description": "Old eucalyptus tree partially fallen in Kothrud park, blocking walking path.",
        "lat": 18.5065, "lng": 73.8085,
    },
    {
        "category": "Open Drain",
        "severity": "low",
        "description": "Small drain overflow near Shivajinagar bus stand creating slippery footpath.",
        "lat": 18.5310, "lng": 73.8468,
    },
    {
        "category": "Pothole",
        "severity": "medium",
        "description": "Series of potholes on Pune-Satara highway near Katraj tunnel approach.",
        "lat": 18.4770, "lng": 73.8445,
    },
]

# Status progressions with days offsets
STATUS_PROGRESSIONS = [
    # (current_status, stages: [(status, offset_days_after_creation)])
    ("new", []),
    ("assigned", [("assigned", 0.5)]),
    ("in_progress", [("assigned", 0.5), ("in_progress", 1.5)]),
    ("awaiting_verification", [("assigned", 0.5), ("in_progress", 1.5), ("awaiting_verification", 3.0)]),
    ("resolved", [("assigned", 0.5), ("in_progress", 1.5), ("awaiting_verification", 3.0), ("resolved", 5.0)]),
    ("closed", [("assigned", 0.5), ("in_progress", 1.5), ("awaiting_verification", 3.0), ("resolved", 5.0), ("closed", 6.0)]),
]


def seed():
    init_db()
    db = SessionLocal()

    # Clear existing data (for re-seeding)
    for table in [
        models.Notification, models.StatusHistory, models.Assignment,
        models.Evidence, models.Detection, models.Complaint,
        models.GPSObservation, models.Route, models.Bus,
        models.User, models.Department,
    ]:
        db.query(table).delete()
    db.commit()
    print("  Cleared existing data.")

    # ── Departments ────────────────────────────────────────────────────────────
    dept_data = [
        {"name": "Roads & Infrastructure", "code": "ROADS",
         "problem_categories": ["Pothole", "Road Damage", "Broken Road", "Illegal Dumping"],
         "contact_email": "roads@punecity.gov.in"},
        {"name": "Sanitation & Waste", "code": "SANITATION",
         "problem_categories": ["Garbage", "Illegal Dumping", "Stray Animals"],
         "contact_email": "sanitation@punecity.gov.in"},
        {"name": "Parks & Horticulture", "code": "PARKS",
         "problem_categories": ["Fallen Tree", "Park Maintenance"],
         "contact_email": "parks@punecity.gov.in"},
        {"name": "Drainage & Waterways", "code": "DRAINAGE",
         "problem_categories": ["Waterlogging", "Open Drain", "Flood Risk"],
         "contact_email": "drainage@punecity.gov.in"},
        {"name": "Electrical & Lighting", "code": "ELECTRICAL",
         "problem_categories": ["Broken Streetlight", "Power Line", "Electrical Hazard"],
         "contact_email": "electrical@punecity.gov.in"},
    ]
    depts = {}
    for d in dept_data:
        obj = models.Department(**d)
        db.add(obj)
        db.flush()
        depts[d["code"]] = obj
    db.commit()
    print(f"  Created {len(depts)} departments.")

    # ── Users ──────────────────────────────────────────────────────────────────
    users_data = [
        {"username": "admin", "email": "admin@civiceye.ai",
         "password": "admin123", "role": "admin", "dept": None},
        {"username": "officer1", "email": "officer1@punecity.gov.in",
         "password": "pass123", "role": "officer", "dept": "ROADS"},
        {"username": "officer2", "email": "officer2@punecity.gov.in",
         "password": "pass123", "role": "officer", "dept": "SANITATION"},
        {"username": "citizen1", "email": "citizen1@gmail.com",
         "password": "pass123", "role": "citizen", "dept": None},
    ]
    users = {}
    for u in users_data:
        dept_id = depts[u["dept"]].id if u["dept"] else None
        obj = models.User(
            username=u["username"],
            email=u["email"],
            hashed_password=_hash(u["password"]),
            role=u["role"],
            department_id=dept_id,
            created_at=_days_ago(60),
        )
        db.add(obj)
        db.flush()
        users[u["username"]] = obj
    db.commit()
    print(f"  Created {len(users)} users.")

    # ── Buses ──────────────────────────────────────────────────────────────────
    bus_data = [
        {"bus_number": "PMC-11", "route_name": "Route 11 — Swargate to Katraj", "driver_name": "Ramesh Patil"},
        {"bus_number": "PMC-47", "route_name": "Route 47 — Shivajinagar to Hadapsar", "driver_name": "Suresh Kulkarni"},
        {"bus_number": "PMC-99", "route_name": "Route 99 — Kothrud to Viman Nagar", "driver_name": "Anil Shinde"},
    ]
    buses = []
    for b in bus_data:
        obj = models.Bus(
            bus_number=b["bus_number"],
            route_name=b["route_name"],
            driver_name=b["driver_name"],
            is_active=True,
            last_seen_at=_days_ago(random.uniform(0, 0.5)),
        )
        db.add(obj)
        db.flush()
        buses.append(obj)

        # Route waypoints
        waypoints = [
            {"lat": wp["lat"], "lng": wp["lng"], "name": wp["name"]}
            for wp in PUNE_ROUTES[b["route_name"]]
        ]
        route = models.Route(
            bus_id=obj.id,
            name=b["route_name"],
            waypoints=waypoints,
            created_at=_days_ago(90),
        )
        db.add(route)

        # Recent GPS observations
        for wp in PUNE_ROUTES[b["route_name"]]:
            gps = models.GPSObservation(
                bus_id=obj.id,
                latitude=wp["lat"] + random.uniform(-0.0002, 0.0002),
                longitude=wp["lng"] + random.uniform(-0.0002, 0.0002),
                timestamp=_days_ago(random.uniform(0, 0.3)),
                speed=random.uniform(15, 40),
            )
            db.add(gps)

    db.commit()
    print(f"  Created {len(buses)} buses with routes and GPS observations.")

    # ── Complaints ─────────────────────────────────────────────────────────────
    category_to_dept = {
        "Pothole": "ROADS", "Road Damage": "ROADS", "Broken Road": "ROADS",
        "Garbage": "SANITATION", "Illegal Dumping": "SANITATION", "Stray Animals": "SANITATION",
        "Fallen Tree": "PARKS",
        "Waterlogging": "DRAINAGE", "Open Drain": "DRAINAGE",
        "Broken Streetlight": "ELECTRICAL",
    }

    progression_cycle = list(STATUS_PROGRESSIONS)
    random.shuffle(progression_cycle)

    created_complaints = []
    for idx, scenario in enumerate(COMPLAINT_SCENARIOS):
        days_ago_val = random.uniform(0.5, 29.5)
        created_at = _days_ago(days_ago_val)

        dept_code = category_to_dept.get(scenario["category"])
        dept_obj = depts.get(dept_code)

        progression_idx = idx % len(progression_cycle)
        final_status, stages = progression_cycle[progression_idx]

        resolved_at = None
        if final_status in ("resolved", "closed"):
            resolved_at = created_at + timedelta(days=5)

        bus_obj = random.choice(buses)

        complaint = models.Complaint(
            complaint_id=_cid(),
            category=scenario["category"],
            description=scenario["description"],
            latitude=scenario["lat"] + random.uniform(-0.0005, 0.0005),
            longitude=scenario["lng"] + random.uniform(-0.0005, 0.0005),
            bus_id=bus_obj.id,
            severity=scenario["severity"],
            status=final_status,
            department_id=dept_obj.id if dept_obj else None,
            observation_count=random.randint(1, 8),
            first_detected_at=created_at,
            last_detected_at=created_at + timedelta(hours=random.uniform(1, 48)),
            resolved_at=resolved_at,
            resolution_notes="Issue resolved by field team. Road patched and tested." if final_status in ("resolved", "closed") else None,
        )
        db.add(complaint)
        db.flush()

        # Status history
        prev_status = None
        db.add(models.StatusHistory(
            complaint_id=complaint.id,
            old_status=None,
            new_status="new",
            changed_by=None,
            changed_at=created_at,
            notes="Auto-detected by bus camera",
        ))

        for stage_status, offset in stages:
            stage_time = created_at + timedelta(days=offset)
            db.add(models.StatusHistory(
                complaint_id=complaint.id,
                old_status=prev_status or "new",
                new_status=stage_status,
                changed_by=users["admin"].id,
                changed_at=stage_time,
                notes=f"Status changed to {stage_status}",
            ))
            prev_status = stage_status

        # Detection record
        det = models.Detection(
            bus_id=bus_obj.id,
            complaint_id=complaint.id,
            category=scenario["category"],
            confidence=round(random.uniform(0.65, 0.96), 3),
            bbox={"x1": 100, "y1": 150, "x2": 320, "y2": 380},
            image_path=None,
            timestamp=created_at,
            latitude=scenario["lat"],
            longitude=scenario["lng"],
            is_simulated=True,
        )
        db.add(det)

        # Assignment for in-progress/awaiting/resolved
        if final_status in ("assigned", "in_progress", "awaiting_verification", "resolved", "closed"):
            if dept_code in ("ROADS",):
                officer = users["officer1"]
            elif dept_code in ("SANITATION",):
                officer = users["officer2"]
            else:
                officer = users["admin"]

            db.add(models.Assignment(
                complaint_id=complaint.id,
                assigned_to=officer.id,
                assigned_by=users["admin"].id,
                assigned_at=created_at + timedelta(hours=4),
                notes=f"Assigned to {officer.username} for field inspection",
            ))

        # Notifications
        if final_status in ("resolved", "closed"):
            db.add(models.Notification(
                user_id=users["admin"].id,
                title="Complaint Resolved",
                message=f"Complaint {complaint.complaint_id} ({scenario['category']}) has been resolved.",
                type="success",
                is_read=random.choice([True, False]),
                complaint_id=complaint.id,
                created_at=resolved_at or created_at + timedelta(days=5),
            ))
        elif final_status in ("awaiting_verification",):
            db.add(models.Notification(
                user_id=users["admin"].id,
                title="Verification Needed",
                message=f"Complaint {complaint.complaint_id} is awaiting verification.",
                type="warning",
                is_read=False,
                complaint_id=complaint.id,
                created_at=created_at + timedelta(days=3),
            ))

        created_complaints.append(complaint)

    db.commit()
    print(f"  Created {len(created_complaints)} complaints with status history and detections.")

    # Summary
    print("\nSeeding complete!")
    print(f"     Departments : {len(depts)}")
    print(f"     Users       : {len(users)}")
    print(f"     Buses       : {len(buses)}")
    print(f"     Complaints  : {len(created_complaints)}")
    print("\nDemo credentials:")
    print("  admin    / admin123  (admin)")
    print("  officer1 / pass123   (Roads dept officer)")
    print("  officer2 / pass123   (Sanitation dept officer)")
    print("  citizen1 / pass123   (citizen)")
    db.close()


if __name__ == "__main__":
    seed()
