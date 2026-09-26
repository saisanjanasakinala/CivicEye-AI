# CivicEye AI 🚌🔍
### *Every Bus Becomes a Smart City Inspector*

CivicEye AI turns municipal bus fleets into a distributed civic-issue detection network.
Cameras on buses continuously scan streets; detected problems (potholes, garbage, waterlogging, fallen trees, broken streetlights) are automatically logged as complaints, de-duplicated, routed to the right city department, and tracked through resolution.

---

## Features

| Area | Highlights |
|---|---|
| **CV Detection** | YOLOv8n (COCO) with civic category mapping; full simulated fallback |
| **Duplicate Detection** | Haversine GPS de-dup (< 50 m = same complaint, 50–100 m = flagged) |
| **Smart Routing** | DB-driven rules + hardcoded defaults map categories → departments |
| **Lifecycle** | `new → assigned → in_progress → awaiting_verification → resolved → closed` |
| **Analytics** | Summary, by-category, by-department, by-severity, 30-day timeline, hotspots |
| **Map** | Complaint markers + heatmap endpoints |
| **Auth** | JWT (HS256, 24 h expiry), roles: admin / officer / citizen |

---

## Project Structure

```
civiceye/
├── backend/
│   ├── main.py              # FastAPI app & lifespan
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # ORM models
│   ├── schemas.py           # Pydantic schemas
│   ├── sample_data.py       # DB seeder
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   ├── auth.py          # POST /api/auth/login, GET /api/auth/me
│   │   ├── buses.py         # GET /api/buses, GPS, detections
│   │   ├── complaints.py    # CRUD + status + evidence
│   │   ├── detections.py    # /analyze, /video-frame, /categories
│   │   ├── departments.py   # list, queue, routing-rules
│   │   ├── analytics.py     # summary, category, dept, severity, timeline, hotspots
│   │   ├── notifications.py # list, mark-read
│   │   └── map_data.py      # markers, heatmap
│   └── services/
│       ├── cv_service.py         # YOLOv8 + simulated detection
│       ├── duplicate_service.py  # Haversine de-dup
│       ├── routing_service.py    # Category → department routing
│       └── verification_service.py # Status transition engine
└── frontend/               # (separate task)
```

---

## Quick Start

### 1. Install dependencies

```bash
cd civiceye/backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Optional — real YOLOv8 inference:
```bash
pip install ultralytics==8.0.196
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit SECRET_KEY for production
```

### 3. Seed the database

```bash
python sample_data.py
```

Output:
```
  Created 5 departments.
  Created 4 users.
  Created 3 buses with routes and GPS observations.
  Created 25 complaints with status history and detections.

✅  Seeding complete!

Demo credentials:
  admin    / admin123  (admin)
  officer1 / pass123   (Roads dept officer)
  officer2 / pass123   (Sanitation dept officer)
  citizen1 / pass123   (citizen)
```

### 4. Start the server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive docs: **http://localhost:8000/api/docs**

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (form: username, password) → JWT token |
| GET  | `/api/auth/me` | Current user profile |

### Buses
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/buses/` | List all buses |
| GET  | `/api/buses/{id}/route` | Route waypoints |
| POST | `/api/buses/{id}/gps` | Record GPS observation |
| GET  | `/api/buses/{id}/detections` | Recent detections |

### Complaints
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/complaints/` | List with filters (status, category, severity, department_id) |
| POST | `/api/complaints/` | Create complaint |
| GET  | `/api/complaints/map` | Map snapshot (lat/lng/status/category) |
| GET  | `/api/complaints/{id}` | Complaint detail |
| PUT  | `/api/complaints/{id}/status` | Update status |
| PUT  | `/api/complaints/{id}/assign` | Assign department/officer |
| POST | `/api/complaints/{id}/evidence` | Upload evidence image |

### Detections
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/detections/analyze` | Analyze image + GPS, auto-create complaints |
| POST | `/api/detections/video-frame` | Process multipart video frame |
| GET  | `/api/detections/categories` | Supported civic categories |

### Departments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/departments/` | List with complaint counts |
| GET | `/api/departments/{id}/queue` | Department complaint queue |
| PUT | `/api/departments/{id}/routing-rules` | Update routing rules (admin) |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/summary` | Totals, resolution rate, avg time |
| GET | `/api/analytics/by-category` | Counts per category |
| GET | `/api/analytics/by-department` | Counts per department |
| GET | `/api/analytics/by-severity` | Counts per severity level |
| GET | `/api/analytics/timeline` | Daily counts over last 30 days |
| GET | `/api/analytics/hotspots` | Recurring problem clusters |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/` | User's notifications |
| PUT | `/api/notifications/{id}/read` | Mark one as read |
| PUT | `/api/notifications/read-all` | Mark all as read |

### Map
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/map/complaints` | All markers (lat, lng, severity, status, …) |
| GET | `/api/map/heatmap` | Heatmap data points with weight |

---

## Detection Categories

| Category | Dept | YOLO | Simulated |
|---|---|---|---|
| Pothole | Roads | ❌ | ✅ |
| Road Damage | Roads | ❌ | ✅ |
| Garbage | Sanitation | ✅ (bottles, bags) | ✅ |
| Waterlogging | Drainage | ❌ | ✅ |
| Open Drain | Drainage | ❌ | ✅ |
| Fallen Tree | Parks | partial (potted plant) | ✅ |
| Broken Streetlight | Electrical | ❌ | ✅ |
| Stray Animals | Sanitation | ✅ (dog, cat, cow) | ✅ |
| Illegal Dumping | Roads/Sanitation | ❌ | ✅ |

---

## Status Lifecycle

```
new → assigned → in_progress → awaiting_verification → resolved → closed
                     ↑__________________|  (rejected back)
```

---

## Tech Stack

- **FastAPI** 0.104 + **Uvicorn**
- **SQLAlchemy** 2.0 + **SQLite** (drop-in swap to PostgreSQL via DATABASE_URL)
- **python-jose** JWT auth
- **passlib[bcrypt]** password hashing
- **ultralytics** YOLOv8 (optional)
- **Pillow** / **OpenCV** image processing
