from pydantic import BaseModel


class ReportResponse(BaseModel):
    report_id: str
    status: str
    filename: str | None
    latitude: float
    longitude: float
    hazard_type: str | None
    confidence: float | None
    severity: float | None


class HazardReportOut(BaseModel):
    id: str
    latitude: float
    longitude: float
    hazard_type: str | None
    confidence: float | None
    severity: float | None
    status: str
    created_at: str
