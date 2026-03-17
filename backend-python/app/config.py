"""InfraPulse Python backend configuration from environment."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Local dev: use same port as backend-node (InfraPulse Postgres often on 5532)
    database_url: str = "postgresql://infrapulse:infrapulse_secret@localhost:5532/infrapulse"
    prometheus_url: str = "http://localhost:9090"
    loki_url: str = "http://localhost:3100"
    backend_node_url: str = "http://localhost:3000"
    openai_api_key: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""  # Chat ID to send alerts to (required for Telegram)
    worker_interval_seconds: int = 900  # 15 min
    metrics_lookback_hours: int = 6

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
