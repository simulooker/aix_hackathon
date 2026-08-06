from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.session import Base, engine
from app.models.user import User  # noqa: F401

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Safe Route API",
    version="0.1.0",
    description="보행 안전 경로 추천 및 위험 요소 분석 API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "environment": settings.environment}
