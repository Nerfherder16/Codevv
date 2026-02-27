import hashlib
import json

import httpx

from app.core.config import get_settings

settings = get_settings()


async def _get_redis():
    import redis.asyncio as aioredis

    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def get_embedding(text: str) -> list[float]:
    """Return embedding vector, using Redis cache (24 h TTL)."""
    cache_key = f"embed:{hashlib.md5(text.encode()).hexdigest()}"

    # Try cache first
    try:
        r = await _get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/embed",
            json={"model": settings.ollama_embed_model, "input": text},
        )
        resp.raise_for_status()
        embedding = resp.json()["embeddings"][0]

    # Populate cache (24 h)
    try:
        r = await _get_redis()
        await r.setex(cache_key, 86400, json.dumps(embedding))
    except Exception:
        pass

    return embedding
