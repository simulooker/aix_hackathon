import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def ensure_hazard_report_columns(engine: Engine) -> None:
    """Add columns introduced after the original hazard_reports table.

    SQLAlchemy's create_all creates missing tables but intentionally does not
    alter an existing table. These additive statements preserve old reports.
    """
    inspector = inspect(engine)
    if "hazard_reports" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("hazard_reports")}
    postgres_columns = {
        "latitude": "DOUBLE PRECISION",
        "longitude": "DOUBLE PRECISION",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'verified'",
        "hazard_type": "VARCHAR(80)",
        "confidence": "DOUBLE PRECISION",
        "severity": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "overall_risk": "VARCHAR(10) NOT NULL DEFAULT 'none'",
        "detected_labels": "TEXT",
        "photo_path": "TEXT",
        "created_at": "TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP",
    }
    sqlite_columns = {
        **postgres_columns,
        "confidence": "FLOAT",
        "severity": "FLOAT NOT NULL DEFAULT 0",
        "created_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    }
    definitions = (
        sqlite_columns if engine.dialect.name == "sqlite" else postgres_columns
    )
    with engine.begin() as connection:
        for name, definition in definitions.items():
            if name not in existing:
                logger.info("Adding missing hazard_reports.%s column", name)
                connection.execute(
                    text(f'ALTER TABLE hazard_reports ADD COLUMN "{name}" {definition}')
                )
        if engine.dialect.name == "postgresql":
            # The first database draft used PostGIS `location` and
            # `image_path`. Keep those legacy columns but allow new rows to
            # use latitude/longitude and photo_path instead.
            refreshed = {
                column["name"]
                for column in inspect(connection).get_columns("hazard_reports")
            }
            if "location" in refreshed:
                connection.execute(
                    text(
                        "UPDATE hazard_reports SET latitude=ST_Y(location::geometry), longitude=ST_X(location::geometry) WHERE location IS NOT NULL AND (latitude IS NULL OR longitude IS NULL)"
                    )
                )
                connection.execute(
                    text(
                        "ALTER TABLE hazard_reports ALTER COLUMN location DROP NOT NULL"
                    )
                )
            if "image_path" in refreshed:
                connection.execute(
                    text(
                        "UPDATE hazard_reports SET photo_path=image_path WHERE photo_path IS NULL AND image_path IS NOT NULL"
                    )
                )
                connection.execute(
                    text(
                        "ALTER TABLE hazard_reports ALTER COLUMN image_path DROP NOT NULL"
                    )
                )
