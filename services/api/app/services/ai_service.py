from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.config import settings

WALKABLE_CLASSES = {"sidewalk", "alley", "crosswalk", "bike_lane"}
STAIR_CLASSES = {"stairs", "stair", "stairway"}
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
        
        # 바닥 접촉면 계산
        contact_y1 = max(y1, y2 - max(3, round(max(1, y2 - y1) * 0.20)))
        contact = mask[contact_y1:y2, x1:x2]
        overlap = float(contact.sum()) / max(1, contact.size)
        
        blocked_rows: list[float] = []
        remaining_rows: list[float] = []
        for row in mask[contact_y1:y2]:
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
                blocked_rows.append(blocked / max(1, total))
                remaining_rows.append(max(0, total - blocked) / max(1, width))
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
        box_width_ratio: float = 0.0,
    ) -> str:
        if label in STAIR_CLASSES:
            return "high"

        if label == "person":
            return "none"

        # 보행 통로가 화면 폭의 35% 이상 넉넉히 확보되어 있고 도로를 완전히 막지 않았다면 위험 제외
        if remaining >= 0.35 and blocked < 0.55:
            return "none"

        # 보행로 위가 아니며 남은 공간이 25% 이상 확보된 경우 위험 없음 처리
        if not on_walkway and remaining >= 0.25:
            return "none"

        distance_factor = min(1.0, max(0.40, (proximity - 0.25) / 0.55))
        effective_blocked = blocked * distance_factor

        # 차량/이동성 장애물 판정
        if label in {
            "motor_vehicle", "car", "truck", "bus", "two_wheeler",
            "movable_obstacle", "fixed_obstacle", "obstacle", "construction"
        }:
            # 도로를 실제로 절반 이상 막았거나 남은 통로가 15% 미만으로 극히 좁을 때만 high
            if effective_blocked >= 0.50 or (remaining < 0.15 and box_width_ratio >= 0.40):
                return "high"
            # 통행에 다소 불편을 주는 수준
            if effective_blocked >= 0.25 or (remaining < 0.25 and box_width_ratio >= 0.30):
                return "medium"
            if on_walkway and remaining < 0.35:
                return "low"
            return "none"

        # 일반 장애물 판정
        if effective_blocked >= 0.50 or (remaining < 0.15 and box_width_ratio >= 0.35):
            return "high"

        if effective_blocked >= 0.25 or (remaining < 0.25 and box_width_ratio >= 0.25):
            return "medium"

        if on_walkway and proximity >= 0.60 and remaining < 0.35:
            return "low"

        return "none"

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
                image, conf=0.35, device=settings.ai_device, verbose=False
            )[0]
            
        mask = self._mask(surface, *image.shape[:2])
        detections: list[dict[str, Any]] = []
        height, width = image.shape[:2]

        total_vehicle_width_ratio = 0.0
        vehicle_count = 0

        # 1. 장애물 모델 객체 검출
        if obstacles.boxes is not None:
            for box, class_id, confidence in zip(
                obstacles.boxes.xyxy.int().cpu().tolist(),
                obstacles.boxes.cls.int().cpu().tolist(),
                obstacles.boxes.conf.cpu().tolist(),
            ):
                overlap, blocked, remaining, proximity = self._measure(mask, box)
                label = obstacles.names[class_id]
                box_width_ratio = (box[2] - box[0]) / max(1, width)
                on_walkway = overlap >= 0.15 or proximity >= 0.65

                if label in {"motor_vehicle", "car", "truck", "bus"}:
                    total_vehicle_width_ratio += box_width_ratio
                    vehicle_count += 1

                item_risk = self._risk(
                    label,
                    on_walkway,
                    blocked,
                    remaining,
                    proximity,
                    box_width_ratio,
                )

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
                        "risk": item_risk,
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
                if label not in STAIR_CLASSES or float(confidence) < 0.30:
                    continue
                x1, y1, x2, y2 = box
                blocked = min(1.0, max(0, x2 - x1) / max(1, width))
                proximity = min(1.0, max(0.0, y2 / max(1, height)))
                box_width_ratio = (x2 - x1) / max(1, width)

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
                        "risk": "high",
                    }
                )
                stair_detections += 1

        # 💡 [핵심 보정] 한쪽 벽면 일렬 주차(통로 확보)는 high 승격을 방지하고, 남은 공간이 20% 미만으로 꽉 막힌 경우만 high 처리
        min_remaining = min(
            (item["remaining_walkway_image_ratio"] for item in detections),
            default=1.0,
        )

        if vehicle_count >= 2 and total_vehicle_width_ratio >= 0.60 and min_remaining < 0.20:
            for item in detections:
                if item["label"] in {"motor_vehicle", "car", "truck", "bus"}:
                    if RISK_ORDER[item["risk"]] < RISK_ORDER["high"]:
                        item["risk"] = "high"
        elif vehicle_count >= 2 and total_vehicle_width_ratio >= 0.35 and min_remaining < 0.35:
            for item in detections:
                if item["label"] in {"motor_vehicle", "car", "truck", "bus"}:
                    if RISK_ORDER[item["risk"]] < RISK_ORDER["medium"]:
                        item["risk"] = "medium"

        risk = max(
            (item["risk"] for item in detections), key=RISK_ORDER.get, default="none"
        )
        return {
            "model_ready": True,
            "walkway_detected": bool(mask.any()) or stair_detections > 0,
            "overall_risk": risk,
            "obstacles_detected": len(detections),
            "obstacles_on_walkway": sum(
                item["risk"] != "none"
                for item in detections
            ),
            "detections": detections,
        }


@lru_cache
def get_ai_service() -> AIService:
    return AIService()