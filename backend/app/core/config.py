from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Lager 仓储"
    version: str = "1.1.0"
    database_url: str = f"sqlite:///{(PROJECT_ROOT / 'data' / 'lager.db').as_posix()}"
    secret_key: Optional[str] = None
    admin_initial_password: str = "Admin@12345"
    seed_demo_data: bool = True

    cookie_name: str = "lager_session"
    cookie_secure: bool = False
    jwt_expire_hours: int = 8

    enable_docs: bool = True
    cors_origins: str = ""
    app_timezone: str = "Asia/Shanghai"
    log_level: str = "INFO"
    frontend_dist: Optional[str] = None
    max_request_bytes: int = 1024 * 1024
    ai_max_request_bytes: int = 6 * 1024 * 1024

    @property
    def frontend_path(self) -> Path:
        if self.frontend_dist:
            return Path(self.frontend_dist).expanduser().resolve()
        return PROJECT_ROOT / "frontend" / "dist"

    @property
    def cors_origin_list(self) -> List[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def tz(self) -> ZoneInfo:
        try:
            return ZoneInfo(self.app_timezone)
        except Exception:
            return ZoneInfo("UTC")

    @property
    def data_dir(self) -> Optional[Path]:
        url = make_url(self.database_url)
        if not url.drivername.startswith("sqlite"):
            return None
        database = url.database
        if not database or database == ":memory:":
            return None
        path = Path(database)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path.parent


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
