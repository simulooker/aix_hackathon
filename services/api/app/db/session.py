from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine_options = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
}
if not settings.database_url.startswith("sqlite"):
    engine_options.update({"pool_size": 3, "max_overflow": 2, "pool_recycle": 300})
engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
