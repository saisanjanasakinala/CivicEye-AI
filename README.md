# CivicEye AI — AI-Powered Smart City Inspection & Civic Issue Management

**Developer & Project Owner:** Sai Sanjana Sakinala (`saisanjanasakinala`)  
**Repository:** `saisanjanasakinala/CivicEye-AI`

---

## 1. Problem Statement
Urban municipal corporations (such as Pune Municipal Corporation — PMC) struggle to monitor thousands of kilometers of road infrastructure manually. Potholes, damaged road surfaces, overflowing garbage dumps, waterlogging, fallen trees, and broken streetlights often go unreported for days or result in duplicate, uncoordinated complaints. Traditional citizen grievance portals also create friction by requiring mandatory account registration before a resident can report a road hazard.

## 2. Solution Overview
**CivicEye AI** transforms municipal transit buses (PMPML fleet) into automated, roving civic inspectors while empowering citizens with a zero-login public grievance portal:
1. **AI Bus Camera Inspection:** Edge cameras mounted on city transit buses capture road frames during routine journeys. Frames are analyzed by Google Gemini Vision (`gemini-3-flash-preview`) to detect potholes, damaged roads, garbage dumps, waterlogging, fallen trees, and broken streetlights with bounding boxes and confidence scores.
2. **Haversine Geo-Deduplication (50m Radius):** Repeated detections or citizen reports within 50 meters of an existing open issue of the same category automatically increment the complaint's observation count (`duplicate_count`) instead of flooding department queues.
3. **Public Citizen Portal (No Login Required):** Residents can upload photos/videos, run real-time AI classification, override the AI category/severity if needed, attach GPS coordinates (with explicit browser permission or interactive map pin selection), submit anonymously, and track resolution progress via a unique tracking ID (`PMC-YYYY-NNNNN`).
4. **Government Admin & Fleet Command Center:** Role-based dashboard (`admin`, `officer`) with department work queues (Roads, Sanitation, Parks, Drainage, Electrical), SLA priority management, before/after resolution evidence uploads, immutable administrative audit logs, and live vs. simulated bus GPS fleet tracking.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 18 + Vite + TS)                  │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │ Public Citizen Portal│  │ AI Bus Camera Suite │  │ Gov Admin &    │  │
│  │ • Report Issue       │  │ • Mode A: Live Cam  │  │ Fleet Portal   │  │
│  │ • Track Complaint    │  │ • Mode B: Video File│  │ • Dept Queues  │  │
│  │ • Public GIS Map     │  │ • Mode C: Simulation│  │ • Bus Telemetry│  │
│  │ • About CivicEye     │  │ • Auto vs Review Q  │  │ • Audit Logs   │  │
│  └──────────┬───────────┘  └──────────┬──────────┘  └────────┬───────┘  │
└─────────────┼─────────────────────────┼──────────────────────┼──────────┘
              │ REST (/api/citizen/*)   │ (/api/bus-camera/*)  │ JWT Auth
              ▼                         ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   BACKEND ADAPTER (Express + TypeScript)                │
│  • Rate Limiting & File Validation (Multer, 15MB limit, MIME checks)    │
│  • Server-Side Gemini Vision Integration (@google/genai SDK)            │
│  • 50m Haversine Spatial Deduplication & Auto-Department Routing        │
│  • Persistent JSON Database Engine (data/civiceye_db.json)              │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Backend Architecture Note:** The original repository included references to a separate Python/FastAPI backend (`backend/`), which was not bundled in this workspace. Rather than faking external connections, `server.ts` implements a full-featured, persistent Express/TypeScript backend adapter implementing every `/api/v1/*` and `/api/*` contract with atomic disk persistence (`data/civiceye_db.json`) and server-side `@google/genai` computer vision.

---

## 4. Technology Stack
- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, React Router v6, React-Leaflet & Leaflet (OpenStreetMap GIS), Recharts, Lucide React, Axios, `date-fns`
- **Backend:** Node.js, Express 4, TypeScript (`tsx`), Multer (multipart uploads), JSON Web Tokens (`jsonwebtoken`), CORS
- **Computer Vision / AI:** Google Gemini API (`@google/genai` SDK using `gemini-3-flash-preview` structured JSON vision output)
- **Persistence:** Atomic file-backed JSON document store (`data/civiceye_db.json`) with automatic seed initialization

---

## 5. Environment Variables & Configuration

Copy `.env.example` to `.env` in the project root:

```env
ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=
DATA_DIR=data
GEMINI_API_KEY=your_server_side_gemini_api_key
SECRET_KEY=your_jwt_signing_secret
UPLOAD_DIR=uploads
```

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Server-side Google Gemini API key used by `/api/citizen/ai-classify` and `/api/bus-camera/analyze`. Never exposed to the browser. |
| `SECRET_KEY` | Secret key for signing and verifying admin/officer JWT tokens. |
| `DATA_DIR` | Directory where `civiceye_db.json` is persisted (`data` by default). |
| `UPLOAD_DIR` | Directory where uploaded citizen and resolution evidence images are stored (`uploads` by default). |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins. |

---

## 6. Installation & Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Start the full-stack development server (Express + Vite on port 3000)
npm run dev

# 4. Type-check and build for production
npm run lint
npm run build
npm start
```

The application runs on `http://localhost:3000`.

---

## 7. Usage Guide

### A. For Citizens (Public Portal — `/` or `/citizen`)
1. **No Login Required:** Open `/` or `/citizen` directly.
2. **Report an Issue:**
   - Upload a road photo/video or select a sample road defect illustration.
   - Click **Run AI Classification** (or let it run automatically on upload) to detect the category, severity, confidence score, and target municipal department.
   - Optionally **override** the AI-suggested category or severity if you disagree with the model.
   - Click **Use My Current GPS** (requests browser geolocation permission) or click any location on the interactive Pune map to set coordinates manually.
   - Submit anonymously to receive a unique tracking ID (e.g., `PMC-2026-00018`).
3. **Track Complaint:** Enter your `PMC-YYYY-NNNNN` tracking ID in the **Track Complaint** tab to inspect current status, assigned department, status timeline, and before/after resolution photos without exposing personal information.
4. **Public Issue Map:** Browse active and resolved civic issues across Pune by category and status.

### B. For Government Administrators & Officers (`/login` & `/dashboard`)
- **Default Credentials:**
  - **Administrator:** `admin` / `admin123`
  - **Department Officer:** `roads_officer` / `officer123`
- **Government Command Dashboard (`/dashboard/government`):** View KPI cards, 30-day new vs. resolved trends, department-specific work queues (Roads, Sanitation, Parks, Drainage, Electrical), and the immutable **Administrative Audit Log**.
- **Complaint Detail (`/dashboard/complaints/:id`):** Assign complaints to specific departments and field officers, escalate priority (`low`, `medium`, `high`, `critical`), transition workflow statuses, and upload **Before/After Resolution Evidence**.
- **AI Bus Camera (`/dashboard/bus-camera`):**
  - **Mode A — Live Camera:** Requests browser `getUserMedia` camera stream and captures real frames for Gemini Vision analysis.
  - **Mode B — Upload Video:** Loads a recorded road inspection video file and extracts frames from the HTML5 `<video>` element.
  - **Mode C — Demo Simulation:** Clearly labelled synthetic simulation mode for testing when a physical camera or AI key is unavailable.
  - Supports toggling between **Auto-Create Complaints** and **Operator Review Queue (Suggested Detections)**.
- **Bus Fleet Management (`/dashboard/buses` & `/dashboard/buses/:id`):** Add, edit, deactivate, and search registered buses; distinguish **Live GPS**, **Simulated**, **Stale**, and **Offline** vehicles; ping real browser GPS or simulated route steps; and inspect historical GPS trails alongside linked AI detections.

---

## 8. Key API Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/citizen/ai-classify` | Public (Rate-limited) | Analyzes uploaded photo/description using Gemini Vision (`gemini-3-flash-preview`) or heuristic fallback. |
| `POST` | `/api/citizen/submit` | Public (Rate-limited) | Creates or deduplicates an anonymous citizen complaint (50m Haversine check) and returns tracking ID. |
| `GET` | `/api/citizen/track/:complaintId` | Public | Returns public status, department, timeline, and resolution evidence for a tracking ID. |
| `GET` | `/api/citizen/public-map` | Public | Returns sanitized geo-markers and summary counters for the public map. |
| `POST` | `/api/v1/auth/login` | Public | Authenticates admin/officer credentials and issues a JWT. |
| `POST` | `/api/v1/bus-camera/analyze` | Admin/Officer | Runs Gemini Vision object detection on a base64 frame or clearly labelled simulation. |
| `GET/POST` | `/api/v1/buses` | Admin/Officer | Lists or registers municipal transit buses with driver and GPS status metadata. |
| `GET/PUT/DELETE` | `/api/v1/buses/:id` | Admin/Officer | Retrieves bus details (with GPS history & linked complaints), edits bus, or deactivates bus. |
| `POST` | `/api/v1/buses/:id/gps` | Admin/Officer | Records a live or simulated GPS telemetry point into the bus's historical journey. |
| `PUT` | `/api/v1/complaints/:id/assign` | Admin/Officer | Assigns department and field officer and records an audit log entry. |
| `PUT` | `/api/v1/complaints/:id/priority` | Admin/Officer | Updates complaint severity/priority and records an audit log entry. |
| `POST` | `/api/v1/complaints/:id/evidence` | Admin/Officer | Uploads before/after resolution evidence image and logs audit entry. |

---

## 9. Implemented vs. Simulated Features & Future Scope

### Implemented Features (Production-Ready in Workspace)
- Public Citizen Portal (`/`, `/citizen`) with 4 tabs, zero-login anonymous reporting, AI classification override, explicit GPS permission prompt + manual map pin picker, and tracking ID lookup.
- Server-side Google Gemini Vision (`@google/genai`) integration for both citizen image classification and bus camera road defect bounding-box detection.
- 50-meter Haversine spatial deduplication across both citizen and bus camera submissions.
- Persistent JSON database (`data/civiceye_db.json`) retaining all complaints, buses, GPS histories, evidence, notifications, and audit logs across server restarts.
- Full Bus Camera 3-mode suite (Live WebRTC Camera, Uploaded Video Frame Extraction, and Labelled Demo Simulation) with Auto-File vs. Operator Suggestion Queue.
- Municipal Bus Fleet CRUD (`/dashboard/buses`), GPS connectivity classification (`live`, `stale`, `offline`, `simulated`), historical journey polylines, and per-bus detection linkage (`/dashboard/buses/:id`).
- Government Admin Portal with JWT RBAC, department work queues, priority triage, before/after resolution evidence upload, and immutable audit logs.

### Clearly Labelled Simulated Features
- **Demo Simulation Mode in Bus Camera:** Generates synthetic road SVG frames and clearly badged (`SIMULATED`) detections for offline/classroom demonstrations when a physical road camera or `GEMINI_API_KEY` is not configured.
- **Simulated Bus Route Step:** Allows administrators to test fleet route movement on `/dashboard/buses` when physical PMPML hardware GPS transponders are not connected; vehicles are explicitly badged as `Simulated Telemetry`.

### Future Scope
- Hardware MQTT/GTFS-Realtime ingestion from physical PMPML bus OBD-II/GPS transponders.
- Edge TensorRT / YOLOv8-nano deployment directly on Jetson Orin units inside buses for sub-50ms offline frame filtering prior to cloud uplink.
- WhatsApp & SMS webhook notifications for citizens who optionally opt in to tracking updates.

---

## 10. Production Deployment Checklist
- [x] `npm run lint` passes with zero TypeScript errors.
- [x] `npm run build` bundles frontend assets cleanly into `dist/`.
- [x] `GEMINI_API_KEY` and `SECRET_KEY` are read exclusively server-side in `server.ts`.
- [x] Rate limiting (`express` IP limiter) and Multer file size/MIME validation protect public citizen endpoints.
- [x] Persistent storage directory (`DATA_DIR`) and upload directory (`UPLOAD_DIR`) are writable.

---

**Author & Maintainer:** Sai Sanjana Sakinala
