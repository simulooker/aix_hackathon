from fastapi import APIRouter

from app.api.routes import detection, navigation, reports

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(navigation.router)
api_router.include_router(reports.router)
api_router.include_router(detection.router)
