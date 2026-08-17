from fastapi import APIRouter

from app.api.endpoints import auth
from app.api.routes import detection, environment, navigation, reports

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(navigation.router)
api_router.include_router(reports.router)
api_router.include_router(detection.router)
api_router.include_router(environment.router)
