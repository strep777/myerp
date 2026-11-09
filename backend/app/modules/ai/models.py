from __future__ import annotations

from sqlalchemy import Boolean, Column, Index, Integer, String, Text

from app.core.database import Base, UTCDateTime, utcnow


class AiSetting(Base):
    __tablename__ = "ai_settings"

    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False, default="DEEPSEEK")
    deepseek_base_url = Column(
        String(200), nullable=False, default="https://api.deepseek.com"
    )
    deepseek_model = Column(String(80), nullable=False, default="deepseek-flash")
    deepseek_api_key_enc = Column(String(1024), nullable=False, default="")
    deepseek_api_key_hint = Column(String(16), nullable=False, default="")
    ollama_base_url = Column(
        String(200), nullable=False, default="http://127.0.0.1:11434"
    )
    ollama_model = Column(String(80), nullable=False, default="qwen3.5:9b")
    default_prompt = Column(Text, nullable=False, default="")
    auto_confirm = Column(Boolean, nullable=False, default=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AiRun(Base):
    __tablename__ = "ai_runs"
    __table_args__ = (
        Index("ix_ai_runs_user_created", "created_by", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    provider = Column(String(20), nullable=False)
    model = Column(String(80), nullable=False, default="")
    source_type = Column(String(10), nullable=False, default="IMAGE")
    source_summary = Column(String(500), nullable=False, default="")
    prompt_version = Column(String(40), nullable=False, default="")
    result_json = Column(Text, nullable=False, default="{}")
    status = Column(String(20), nullable=False, default="PREVIEW")
    imported_order_id = Column(Integer, nullable=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    imported_at = Column(UTCDateTime, nullable=True)
