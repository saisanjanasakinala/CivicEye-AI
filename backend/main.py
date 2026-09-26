"""
CivicEye AI — FastAPI application entry point
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from database import init_db  # noqa: E402
from routers import auth, buses, complaints, detections, departments, analytics, notifications, map_data  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CivicEye AI backend…")
    init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    logger.info("Database initialised. Upload dir: %s", UPLOAD_DIR)
    yield
    logger.info("Shutting down CivicEye AI backend.")


app = FastAPI(
    title="CivicEye AI",
    description="Every Bus Becomes a Smart City Inspector — REST API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (uploaded images) ────────────────────────────────────────────
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(buses.router)
app.include_router(complaints.router)
app.include_router(detections.router)
app.include_router(departments.router)
app.include_router(analytics.router)
app.include_router(notifications.router)
app.include_router(map_data.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "CivicEye AI"}


# ── Dev runner ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
