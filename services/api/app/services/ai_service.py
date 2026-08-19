from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.config import settings

WALKABLE_CLASSES = {"sidewalk", "alley", "crosswalk", "bike_lane"}
STAIR_CLASSES = {"stairs"}
RISK_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}


class AIModelUnavailable(RuntimeError):
    pass


class AIService:
    def __init__(self) -> None:
        self.surface_model: Any | None = None
        self.obstacle_model: Any | None = None
        self.lock = Lock()

    def _load(self) -> None:
        if self.surface_model is not None:
            return
        surface = Path(settings.surface_model_path)
        obstacle = Path(settings.obstacle_model_path)
        missing = [str(path) for path in (surface, obstacle) if not path.is_file()]
        if missing:
            raise AIModelUnavailable("AI 모델 파일이 없습니다: " + ", ".join(missing))
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise AIModelUnavailable("ultralytics가 설치되지 않았습니다.") from exc
        self.surface_model = YOLO(str(surface))
        self.obstacle_model = YOLO(str(obstacle))

    @staticmethod
    def _mask(result: Any, height: int, width: int) -> Any:
        import cv2
        import numpy as np

        combined = np.zeros((height, width), dtype=np.uint8)
        if result.masks is None or result.boxes is None:
            return combined
        for mask, class_id in zip(
            result.masks.data.cpu().numpy(), result.boxes.cls.int().cpu().tolist()
        ):
            if result.names[class_id] in WALKABLE_CLASSES:
                resized = cv2.resize(
                    mask, (width, height), interpolation=cv2.INTER_NEAREST
                )
                combined[resized > 0.5] = 1
        return combined

    @staticmethod
    def _measure(mask: Any, box: list[int]) -> tuple[float, float, float, float]:
        import numpy as np

        height, width = mask.shape
        x1, y1, x2, y2 = box
        x1, x2 = max(0, x1), min(width, x2)
        y1, y2 = max(0, y1), min(height, y2)
        y1 = max(y1, y2 - max(3, round(max(1, y2 - y1) * 0.15)))
        contact = mask[y1:y2, x1:x2]
        overlap = float(contact.sum()) / max(1, contact.size)
        blocked_rows: list[float] = []
        remaining_rows: list[float] = []
        for row in mask[y1:y2]:
            walkable = np.flatnonzero(row)
            if not walkable.size:
                continue

            breaks = np.where(np.diff(walkable) > 1)[0] + 1
            segments = np.split(walkable, breaks)
            corridor = max(
                segments,
                key=lambda segment: max(
                    0, min(x2, int(segment[-1]) + 1) - max(x1, int(segment[0]))
                ),
            )
            corridor_x1, corridor_x2 = int(corridor[0]), int(corridor[-1]) + 1
            blocked = max(0, min(x2, corridor_x2) - max(x1, corridor_x1))
            total = corridor_x2 - corridor_x1
            if blocked:
                blocked_rows.append(blocked / total)
                remaining_rows.append(max(0, total - blocked) / width)
        return (
            overlap,
            float(np.median(blocked_rows)) if blocked_rows else 0.0,
            float(np.median(remaining_rows)) if remaining_rows else 0.0,
            y2 / height,
        )

    @staticmethod
    def _risk(
        label: str,
        on_walkway: bool,
        blocked: float,
        remaining: float,
        proximity: float = 1.0,
    ) -> str:
        if not on_walkway:
            return "none"
        if label == "person":
            return "none"
        if label in STAIR_CLASSES:
            # 계단의 위험도는 프로필(휠체어/노약자)에 따라 경로 엔진 단계에서 차등 판단하므로 AI 단계는 none 처리
            return "none"

        distance_factor = min(1.0, max(0.25, (proximity - 0.30) / 0.55))
        effective_blocked = blocked * distance_factor

        # 1. 차량 (motor_vehicle)
        if label == "motor_vehicle":
            if effective_blocked >= 0.65 and remaining < 0.08:
                return "high"
            if effective_blocked >= 0.40:
                return "medium"
            if effective_blocked >= 0.25:
                return "low"
            return "none"

        # 2. 이동 보조기구 (휠체어, 유모차 등)
        if label == "mobility_aid":
            if remaining and remaining < 0.07 and effective_blocked >= 0.35:
                return "medium"
            if effective_blocked >= 0.40:
                return "medium"
            return "low" if effective_blocked >= 0.20 else "none"

        # 3. 고정 장애물 (fixed_obstacle) 및 기타 장애물
        # 남은 보행로 공간이 충분하고(remaining >= 0.12) 침범율이 낮으면 갓길 시설물로 보아 none 처리
        if remaining >= 0.12 and effective_blocked < 0.25:
            return "none"

        if remaining and remaining < 0.07 and effective_blocked >= 0.30:
            return "high"
        if effective_blocked >= 0.50:
            return "high"
        if effective_blocked >= 0.25:
            return "medium"
        return "low" if effective_blocked >= 0.18 else "none"

    def analyze(self, image_bytes: bytes) -> dict[str, Any]:
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("올바른 이미지 파일이 아닙니다.")
        with self.lock:
            self._load()
            surface = self.surface_model.predict(
                image, conf=0.25, device=settings.ai_device, verbose=False
            )[0]
            obstacles = self.obstacle_model.predict(
                image, conf=0.40, device=settings.ai_device, verbose=False
            )[0]
        mask = self._mask(surface, *image.shape[:2])
        detections: list[dict[str, Any]] = []
        height, width = image.shape[:2]

        # 1. 장애물 모델 객체 검출
        if obstacles.boxes is not None:
            for box, class_id, confidence in zip(
                obstacles.boxes.xyxy.int().cpu().tolist(),
                obstacles.boxes.cls.int().cpu().tolist(),
                obstacles.boxes.conf.cpu().tolist(),
            ):
                overlap, blocked, remaining, proximity = self._measure(mask, box)
                on_walkway = overlap >= 0.25
                label = obstacles.names[class_id]
                detections.append(
                    {
                        "label": label,
                        "confidence": round(float(confidence), 4),
                        "box": (
                            round(box[0] / width, 5),
                            round(box[1] / height, 5),
                            round(box[2] / width, 5),
                            round(box[3] / height, 5),
                        ),
                        "blocked_walkway_ratio": round(blocked, 4),
                        "remaining_walkway_image_ratio": round(remaining, 4),
                        "proximity": round(proximity, 4),
                        "on_walkway": on_walkway,
                        "risk": self._risk(
                            label, on_walkway, blocked, remaining, proximity
                        ),
                    }
                )

        # 2. 노면(surface) 모델의 계단(stairs) 객체 검출
        stair_detections = 0
        if surface.boxes is not None:
            for box, class_id, confidence in zip(
                surface.boxes.xyxy.int().cpu().tolist(),
                surface.boxes.cls.int().cpu().tolist(),
                surface.boxes.conf.cpu().tolist(),
            ):
                label = surface.names[class_id]
                if label not in STAIR_CLASSES or float(confidence) < 0.35:
                    continue
                x1, y1, x2, y2 = box
                blocked = min(1.0, max(0, x2 - x1) / max(1, width))
                proximity = min(1.0, max(0.0, y2 / max(1, height)))
                detections.append(
                    {
                        "label": label,
                        "confidence": round(float(confidence), 4),
                        "box": (
                            round(x1 / width, 5),
                            round(y1 / height, 5),
                            round(x2 / width, 5),
                            round(y2 / height, 5),
                        ),
                        "blocked_walkway_ratio": round(blocked, 4),
                        "remaining_walkway_image_ratio": round(
                            max(0.0, 1.0 - blocked), 4
                        ),
                        "proximity": round(proximity, 4),
                        "on_walkway": True,
                        "risk": self._risk(
                            label, True, blocked, max(0.0, 1.0 - blocked), proximity
                        ),
                    }
                )
                stair_detections += 1

        risk = max(
            (item["risk"] for item in detections), key=RISK_ORDER.get, default="none"
        )
        return {
            "model_ready": True,
            "walkway_detected": bool(mask.any()) or stair_detections > 0,
            "overall_risk": risk,
            "obstacles_detected": len(detections),
            "obstacles_on_walkway": sum(
                item["on_walkway"] and item["risk"] != "none"
                for item in detections
            ),
            "detections": detections,
        }


@lru_cache
def get_ai_service() -> AIService:
    return AIService()