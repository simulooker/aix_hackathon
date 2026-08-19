from app.services.ai_service import AIService


def test_vehicle_on_wide_path_is_not_a_risk() -> None:
    assert (
        AIService._risk("motor_vehicle", True, blocked=0.08, remaining=0.30) == "none"
    )


def test_vehicle_slightly_blocking_path_is_low_risk() -> None:
    assert AIService._risk("motor_vehicle", True, blocked=0.30, remaining=0.20) == "low"


def test_vehicle_partially_blocking_path_is_medium_risk() -> None:
    assert (
        AIService._risk("motor_vehicle", True, blocked=0.50, remaining=0.07) == "medium"
    )


def test_vehicle_blocking_most_of_path_is_high_risk() -> None:
    assert (
        AIService._risk("motor_vehicle", True, blocked=0.75, remaining=0.07) == "high"
    )


def test_vehicle_outside_walkway_is_not_a_risk() -> None:
    assert (
        AIService._risk("motor_vehicle", False, blocked=0.90, remaining=0.01) == "none"
    )


def test_distant_vehicle_does_not_raise_scene_risk() -> None:
    assert (
        AIService._risk(
            "motor_vehicle", True, blocked=0.50, remaining=0.20, proximity=0.40
        )
        == "none"
    )


def test_near_vehicle_with_same_blockage_is_medium_risk() -> None:
    assert (
        AIService._risk(
            "motor_vehicle", True, blocked=0.50, remaining=0.12, proximity=0.90
        )
        == "medium"
    )


def test_tiny_fixed_obstacle_on_wide_path_is_not_a_risk() -> None:
    assert (
        AIService._risk(
            "fixed_obstacle", True, blocked=0.05, remaining=0.35, proximity=0.90
        )
        == "none"
    )


def test_near_obstacle_leaving_almost_no_space_is_high_risk() -> None:
    assert (
        AIService._risk(
            "movable_obstacle", True, blocked=0.65, remaining=0.04, proximity=0.95
        )
        == "high"
    )


def test_person_never_contributes_to_risk() -> None:
    assert (
        AIService._risk(
            "person", True, blocked=1.0, remaining=0.0, proximity=1.0
        )
        == "none"
    )
