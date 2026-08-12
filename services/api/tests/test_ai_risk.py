from app.services.ai_service import AIService


def test_vehicle_on_wide_path_is_not_a_risk() -> None:
    assert AIService._risk("motor_vehicle", True, blocked=0.08, remaining=0.30) == "none"


def test_vehicle_slightly_blocking_path_is_low_risk() -> None:
    assert AIService._risk("motor_vehicle", True, blocked=0.30, remaining=0.20) == "low"


def test_vehicle_partially_blocking_path_is_medium_risk() -> None:
    assert AIService._risk("motor_vehicle", True, blocked=0.50, remaining=0.07) == "medium"


def test_vehicle_blocking_most_of_path_is_high_risk() -> None:
    assert AIService._risk("motor_vehicle", True, blocked=0.75, remaining=0.07) == "high"


def test_vehicle_outside_walkway_is_not_a_risk() -> None:
    assert AIService._risk("motor_vehicle", False, blocked=0.90, remaining=0.01) == "none"
