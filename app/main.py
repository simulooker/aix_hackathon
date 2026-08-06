from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

app = FastAPI(title="Barrier-Free Map API")

@app.get("/")
def read_root():
    return {"message": "Barrier-Free Map Backend API is running!"}

@app.get("/health-check")
def db_health_check(db: Session = Depends(get_db)):
    """
    Supabase DB 연동 상태 및 PostGIS 활성화 여부를 점검합니다.
    """
    try:
        # PostGIS 버전 확인 쿼리 실행
        result = db.execute(text("SELECT PostGIS_Full_Version();")).fetchone()
        return {
            "status": "success",
            "message": "Supabase DB 연결 성공!",
            "postgis_version": result[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 연결 실패: {e!s}")