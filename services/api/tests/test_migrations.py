from sqlalchemy import create_engine, inspect, text

from app.db.migrations import ensure_hazard_report_columns


def test_existing_hazard_report_table_receives_required_columns() -> None:
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE hazard_reports ("
                "id VARCHAR(36) PRIMARY KEY, latitude FLOAT, longitude FLOAT)"
            )
        )

    ensure_hazard_report_columns(engine)

    columns = {
        column["name"] for column in inspect(engine).get_columns("hazard_reports")
    }
    assert {
        "is_active",
        "heading_deg",
        "heading_accuracy",
        "hazard_type",
        "confidence",
        "severity",
        "overall_risk",
        "detected_labels",
        "photo_path",
        "created_at",
    } <= columns
