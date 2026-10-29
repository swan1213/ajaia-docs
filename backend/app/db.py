import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

log = logging.getLogger(__name__)


def _database_url() -> str:
    # DATABASE_URL wins. POSTGRES_URL is what Vercel's Postgres (Neon) integration injects.
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if not url:
        if os.getenv("VERCEL"):
            # Vercel functions only have a writable /tmp, and it's wiped between
            # instances. Boot anyway so the app works, but data won't stick around.
            log.warning("No DATABASE_URL set on Vercel, using throwaway SQLite in /tmp")
            url = "sqlite:////tmp/ajaia_docs.db"
        else:
            url = "sqlite:///./ajaia_docs.db"
    # Render / Heroku / Neon style urls use postgres:// which SQLAlchemy doesn't accept.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _database_url()

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
