"""Redis pub/sub event publisher for real-time notifications."""

import json
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def publish_event(
    channel: str,
    event_type: str,
    payload: dict,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Publish an event to a Redis pub/sub channel."""
    event = {
        "type": event_type,
        "payload": payload,
        "actor_id": str(actor_id) if actor_id else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    r = await get_redis()
    await r.publish(channel, json.dumps(event))


async def project_event(
    project_id: uuid.UUID,
    event_type: str,
    payload: dict,
    actor_id: uuid.UUID,
) -> None:
    await publish_event(f"project:{project_id}", event_type, payload, actor_id)


async def org_event(
    org_id: uuid.UUID,
    event_type: str,
    payload: dict,
    actor_id: uuid.UUID,
) -> None:
    await publish_event(f"org:{org_id}", event_type, payload, actor_id)


async def user_event(
    user_id: uuid.UUID,
    event_type: str,
    payload: dict,
    actor_id: uuid.UUID | None = None,
) -> None:
    await publish_event(f"user:{user_id}", event_type, payload, actor_id)
