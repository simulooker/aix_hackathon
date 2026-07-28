from pydantic import BaseModel


class ReportResponse(BaseModel):
    report_id: str
    status: str
    filename: str | None
    latitude: float
    longitude: float
