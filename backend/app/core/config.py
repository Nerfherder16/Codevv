from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://foundry:foundry_dev@localhost:5432/foundry"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Ollama
    ollama_url: str = "http://192.168.50.62:11434"
    ollama_model: str = "qwen3:14b"
    ollama_embed_model: str = "bge-large"

    # LiveKit
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"

    # Yjs
    yjs_url: str = "ws://localhost:1234"

    # App
    environment: str = "development"
    app_name: str = "Foundry"
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
