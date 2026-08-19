from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class HazardReport(Base):
    __tablename__ = "hazard_reports"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="verified"
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    longitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    heading_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hazard_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    severity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    overall_risk: Mapped[str] = mapped_column(
        String(10), nullable=False, default="none"
    )
    detected_labels: Mapped[str | None] = mapped_column(Text, nullable=True)
    # photo_path 변수가 Supabase DB의 'image_url' 컬럼을 가리키도록 설정
    photo_path: Mapped[str | None] = mapped_column("image_url", Text, nullable=True)
    
    # 💡 [추가] 누적 제보 횟수 및 만료 예정 시각(TTL)
    report_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )