from fastapi import APIRouter

from app.api.endpoints import auth
from app.api.routes import detection, navigation, reports

api_router = APIRouter(prefix="/api/v1")

# Auth 라우터 추가
api_router.include_router(auth.router, tags=["Auth"])

# 기존 라우터들
api_router.include_router(navigation.router)
api_router.include_router(reports.router)
api_router.include_router(detection.router)