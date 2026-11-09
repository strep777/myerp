from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Generator, Optional

from sqlalchemy import DateTime, TypeDecorator, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def q4(value) -> Decimal:
    if value is None:
        value = 0
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


class UTCDateTime(TypeDecorator):
    """Store naive UTC in SQLite and return timezone-aware UTC values."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


Base = declarative_base()

_url = make_url(settings.database_url)
_is_sqlite = _url.drivername.startswith("sqlite")
_connect_args = {"check_same_thread": False, "timeout": 10} if _is_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=10000")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=FULL")
        finally:
            cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    data_dir: Optional[Path] = settings.data_dir
    if data_dir is not None:
        data_dir.mkdir(parents=True, exist_ok=True)
    import app.modules.registry  # noqa: F401  (registers all models)

    Base.metadata.create_all(bind=engine)
