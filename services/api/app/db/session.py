from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

database_url = make_url(settings.database_url)
if database_url.drivername == "postgresql":
    # SQLAlchemy 2.1 defaults to psycopg, while this project installs psycopg2.
    database_url = database_url.set(drivername="postgresql+psycopg2")

is_sqlite = database_url.get_backend_name() == "sqlite"
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine_options = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
}
if not is_sqlite:
    engine_options.update({"pool_size": 3, "max_overflow": 2, "pool_recycle": 300})
engine = create_engine(database_url, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
