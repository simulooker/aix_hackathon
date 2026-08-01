from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.session import Base, engine
from app.models.user import User  # 👈 [추가] User 모델을 가져와야 Base가 users 테이블 구조를 인식합니다!

# 서버 실행 시 DB 테이블 자동 생성 (users 테이블 포함)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI 안심길 API",
    description="위험 요소 신고, AI 판별, 안전 경로 계산 API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}