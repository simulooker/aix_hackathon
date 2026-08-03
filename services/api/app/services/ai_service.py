"""Hazard detection service backing ``/api/v1/detections``.

Ships with a lightweight heuristic :class:`MockHazardDetector` so the report
-> detection -> routing pipeline works end-to-end while the real YOLOv8
model (trained on C-DS13 인도보행 영상 데이터) is still in training. Once
``services/api/models/best.pt`` exists, :func:`get_hazard_detector` switches
to :class:`YoloHazardDetector` automatically -- no route or schema changes
needed.
"""

from __future__ import annotations

import hashlib
import io
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat

from app.core.config import settings

_logger = logging.getLogger(__name__)

HAZARD_LABELS = (
    "sidewalk_crack",  # 보도블록 파손
    "curb_step",  # 보도 턱
    "obstruction",  # 불법 적치물
    "icy_surface",  # 결빙/빙판길
    "steep_slope",  # 급경사
)

# Labels that feed the "물리적 경사 한계도 G_i" term of the routing cost function.
_SLOPE_LABELS = {"steep_slope", "curb_step"}


@dataclass
class Detection:
    label: str
    confidence: float
    area_ratio: float  # 0~1, share of the frame covered by the hazard

    @property
    def severity(self) -> float:
        """S_i (0~1): damage severity, blending model confidence and coverage."""
        return round(min(1.0, 0.5 * self.confidence + 0.5 * self.area_ratio), 3)


@dataclass
class DetectionResult:
    model_ready: bool
    detections: list[Detection]

    @property
    def max_severity(self) -> float:
        return max((d.severity for d in self.detections), default=0.0)

    @property
    def slope_risk(self) -> float:
        """G_i proxy (0~1) used by the route service's cost function."""
        return max(
            (d.severity for d in self.detections if d.label in _SLOPE_LABELS),
            default=0.0,
        )


class HazardDetector(ABC):
    @abstractmethod
    def detect(self, image_bytes: bytes) -> DetectionResult: ...


class MockHazardDetector(HazardDetector):
    """Deterministic heuristic stand-in used until the trained YOLOv8 weights ship.

    Not a real vision model: it derives a stable pseudo-detection from edge
    density/brightness plus a hash of the image bytes, so the same photo
    always produces the same demo result while the rest of the pipeline
    (severity scoring, weather fusion, A* routing) is built and tested.
    """

    def detect(self, image_bytes: bytes) -> DetectionResult:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("L")
        except Exception:
            _logger.warning("Could not decode uploaded image for detection", exc_info=True)
            return DetectionResult(model_ready=False, detections=[])

        edges = image.filter(ImageFilter.FIND_EDGES)
        edge_density = ImageStat.Stat(edges).mean[0] / 255
        darkness = 1 - ImageStat.Stat(image).mean[0] / 255

        digest = hashlib.sha256(image_bytes).digest()
        label = HAZARD_LABELS[digest[0] % len(HAZARD_LABELS)]
        confidence = round(0.55 + 0.4 * (digest[1] / 255), 3)
        area_ratio = round(min(1.0, 0.15 + edge_density * 0.6 + darkness * 0.2), 3)

        return DetectionResult(
            model_ready=False,
            detections=[Detection(label=label, confidence=confidence, area_ratio=area_ratio)],
        )


class YoloHazardDetector(HazardDetector):
    """Loads the trained ultralytics YOLOv8 model once it exists on disk."""

    def __init__(self, model_path: Path) -> None:
        from ultralytics import YOLO  # heavy optional dependency, imported lazily

        self._model = YOLO(str(model_path))

    def detect(self, image_bytes: bytes) -> DetectionResult:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        frame_area = image.width * image.height

        results = self._model.predict(image, verbose=False)
        detections: list[Detection] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                box_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
                detections.append(
                    Detection(
                        label=names[int(box.cls[0])],
                        confidence=round(float(box.conf[0]), 3),
                        area_ratio=round(min(1.0, box_area / frame_area), 3),
                    )
                )
        return DetectionResult(model_ready=True, detections=detections)


@lru_cache
def get_hazard_detector() -> HazardDetector:
    model_path = Path(settings.model_path)
    if model_path.exists():
        try:
            return YoloHazardDetector(model_path)
        except Exception:
            _logger.warning(
                "Failed to load YOLOv8 weights at %s; using MockHazardDetector", model_path, exc_info=True
            )
    return MockHazardDetector()
