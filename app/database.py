import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# .env 파일 우선 로드
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError(".env 파일에 DATABASE_URL이 설정되지 않았습니다.")

# 양끝의 온갖 종류 따옴표(" ' “ ”) 및 공백 제거
DATABASE_URL = DATABASE_URL.strip(' "\'“”')

# 2. 터미널에 실제 정제된 DATABASE_URL 출력해보기 (디버깅용)
print("--------------------------------------------------")
print("최종 적용된 DATABASE_URL:", DATABASE_URL)
print("--------------------------------------------------")

# SQLAlchemy 엔진 생성
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# FastAPI 의존성 주입용 DB 세션 함수
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()