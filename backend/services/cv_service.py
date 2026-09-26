"""
CV Service — YOLOv8 inference with graceful simulated fallback.

Real inference path:
  - Uses ultralytics YOLOv8n on COCO classes
  - Maps COCO classes to civic categories

Simulated path (ultralytics not installed, or non-COCO civic categories):
  - Returns predefined detections with is_simulated=True
"""

from __future__ import annotations

import base64
import io
import logging
import random
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# ── COCO → civic category mapping ──────────────────────────────────────────────
COCO_TO_CIVIC: Dict[str, str] = {
    # Garbage / sanitation
    "backpack": "Garbage",
    "handbag": "Garbage",
    "suitcase": "Garbage",
    "bottle": "Garbage",
    "cup": "Garbage",
    "bowl": "Garbage",
    # Structural / roads
    "car": None,  # road surface context — not directly a complaint
    "truck": None,
    "bus": None,
    # Fallen trees / parks
    "potted plant": "Fallen Tree",
    # Animals (stray)
    "dog": "Stray Animals",
    "cat": "Stray Animals",
    "horse": "Stray Animals",
    "cow": "Stray Animals",
}

# Civic categories without reliable COCO mappings → always simulated
SIMULATED_CATEGORIES = [
    "Pothole",
    "Waterlogging",
    "Fallen Tree",
    "Broken Streetlight",
    "Open Drain",
    "Garbage",
    "Stray Animals",
    "Illegal Dumping",
]

# Predefined simulation templates per category
SIMULATION_TEMPLATES: Dict[str, List[Dict[str, Any]]] = {
    "Pothole": [
        {"confidence": 0.87, "bbox": {"x1": 120, "y1": 310, "x2": 280, "y2": 390}},
        {"confidence": 0.72, "bbox": {"x1": 400, "y1": 290, "x2": 510, "y2": 360}},
    ],
    "Waterlogging": [
        {"confidence": 0.81, "bbox": {"x1": 50, "y1": 200, "x2": 600, "y2": 450}},
    ],
    "Fallen Tree": [
        {"confidence": 0.90, "bbox": {"x1": 10, "y1": 100, "x2": 620, "y2": 380}},
    ],
    "Garbage": [
        {"confidence": 0.83, "bbox": {"x1": 200, "y1": 250, "x2": 420, "y2": 400}},
        {"confidence": 0.65, "bbox": {"x1": 430, "y1": 260, "x2": 580, "y2": 380}},
    ],
    "Broken Streetlight": [
        {"confidence": 0.78, "bbox": {"x1": 300, "y1": 30, "x2": 380, "y2": 200}},
    ],
    "Open Drain": [
        {"confidence": 0.76, "bbox": {"x1": 80, "y1": 350, "x2": 560, "y2": 420}},
    ],
    "Stray Animals": [
        {"confidence": 0.88, "bbox": {"x1": 150, "y1": 180, "x2": 360, "y2": 400}},
    ],
    "Illegal Dumping": [
        {"confidence": 0.80, "bbox": {"x1": 60, "y1": 150, "x2": 550, "y2": 450}},
    ],
}

_yolo_model = None
_yolo_available = False


def _load_yolo():
    global _yolo_model, _yolo_available
    try:
        from ultralytics import YOLO  # type: ignore
        _yolo_model = YOLO("yolov8n.pt")
        _yolo_available = True
        logger.info("YOLOv8n model loaded successfully.")
    except Exception as exc:
        _yolo_available = False
        logger.warning("ultralytics not available — using simulated detections. (%s)", exc)


_load_yolo()


def _decode_image(image_base64: str):
    """Decode base64 image to PIL Image."""
    try:
        from PIL import Image
        image_bytes = base64.b64decode(image_base64)
        return Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.error("Failed to decode image: %s", exc)
        return None


def _run_yolo(image_base64: str) -> List[Dict[str, Any]]:
    """Run YOLOv8 on image and return civic detections."""
    image = _decode_image(image_base64)
    if image is None:
        return []

    results = _yolo_model(image, verbose=False)
    detections: List[Dict[str, Any]] = []

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            cls_name = result.names[cls_id]
            civic_category = COCO_TO_CIVIC.get(cls_name)
            if civic_category is None:
                continue  # skip non-civic classes

            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            conf = float(box.conf[0])

            detections.append({
                "category": civic_category,
                "confidence": round(conf, 3),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "is_simulated": False,
            })

    return detections


def _simulate_detections(requested_categories: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Generate simulated detections.
    If requested_categories is None, randomly pick 1-3 categories.
    """
    if requested_categories is None:
        k = random.randint(1, 3)
        requested_categories = random.sample(SIMULATED_CATEGORIES, k)

    detections: List[Dict[str, Any]] = []
    for category in requested_categories:
        templates = SIMULATION_TEMPLATES.get(category, [])
        if not templates:
            continue
        # pick one template and add slight jitter to confidence
        tpl = random.choice(templates).copy()
        jitter = random.uniform(-0.05, 0.05)
        detections.append({
            "category": category,
            "confidence": round(min(max(tpl["confidence"] + jitter, 0.5), 0.99), 3),
            "bbox": tpl["bbox"],
            "is_simulated": True,
        })
    return detections


def analyze_image(
    image_base64: Optional[str],
    simulate_categories: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Main entry point.

    - If image_base64 provided and YOLO available: run real inference,
      supplement with simulated results for categories not detectable via COCO.
    - Otherwise: return fully simulated detections.

    Returns a list of detection dicts:
      {category, confidence, bbox, is_simulated}
    """
    detections: List[Dict[str, Any]] = []

    if image_base64 and _yolo_available:
        try:
            real = _run_yolo(image_base64)
            detections.extend(real)
            logger.info("YOLO returned %d civic detections.", len(real))
        except Exception as exc:
            logger.error("YOLO inference failed: %s", exc)

    # Always supplement with simulated for categories YOLO can't detect
    if simulate_categories:
        simulated = _simulate_detections(simulate_categories)
    elif not detections:
        # No real detections at all — generate random simulated set
        simulated = _simulate_detections()
    else:
        simulated = []

    detections.extend(simulated)
    return detections


def get_supported_categories() -> List[str]:
    return SIMULATED_CATEGORIES
