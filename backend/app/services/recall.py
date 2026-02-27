import asyncio
import hashlib
import json
import time

import httpx

from app.core.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Circuit breaker state (module-level)
# ---------------------------------------------------------------------------
_circuit_open = False
_circuit_opened_at: float = 0.0
_failure_count = 0
_FAILURE_THRESHOLD = 3
_RECOVERY_TIMEOUT = 30.0


async def _get_headers() -> dict:
    from app.services.recall_pairing import get_pairing_token

    token = await get_pairing_token()
    if token:
        return {"X-API-Key": token}
    return {}


async def _get_redis():
    import redis.asyncio as aioredis

    return aioredis.from_url(settings.redis_url, decode_responses=True)


# ---------------------------------------------------------------------------
# Core request with retry + circuit breaker
# ---------------------------------------------------------------------------
async def _recall_request(method: str, path: str, **kwargs) -> dict:
    global _circuit_open, _circuit_opened_at, _failure_count

    if _circuit_open:
        if time.time() - _circuit_opened_at > _RECOVERY_TIMEOUT:
            _circuit_open = False
        else:
            raise Exception("Recall circuit breaker open")

    headers = await _get_headers()

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(
                base_url=settings.recall_url, timeout=5.0
            ) as client:
                resp = await getattr(client, method)(path, headers=headers, **kwargs)
                resp.raise_for_status()
                _failure_count = 0
                return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            _failure_count += 1
            if _failure_count >= _FAILURE_THRESHOLD:
                _circuit_open = True
                _circuit_opened_at = time.time()
                raise Exception(f"Recall unavailable (circuit open): {e}") from e
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))
            else:
                raise
        except Exception:
            raise


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
async def _recall_post(path: str, json: dict | None = None) -> dict:
    return await _recall_request("post", path, json=json or {})


async def _recall_get(path: str, params: dict | None = None) -> dict:
    return await _recall_request("get", path, params=params)


async def _recall_delete(path: str) -> dict:
    return await _recall_request("delete", path)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def search_recall(
    query: str,
    domains: list[str] | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search Recall with Redis read cache (60 s TTL). Returns [] on failure."""
    cache_key = f"recall:search:{hashlib.md5(f'{query}|{domains}|{limit}'.encode()).hexdigest()}"

    # Try cache first
    try:
        r = await _get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    payload: dict = {"query": query, "limit": limit}
    if domains:
        payload["domains"] = domains

    try:
        data = await _recall_post("/search/query", json=payload)
        results = data.get("results", data if isinstance(data, list) else [])
        # Populate cache
        try:
            r = await _get_redis()
            await r.setex(cache_key, 60, json.dumps(results))
        except Exception:
            pass
        return results
    except Exception:
        return []


async def browse_recall(
    domain: str,
    limit: int = 50,
    memory_types: list[str] | None = None,
    query: str = "*",
) -> list[dict]:
    payload: dict = {"query": query, "domains": [domain], "limit": limit}
    if memory_types:
        payload["memory_types"] = memory_types
    try:
        data = await _recall_post("/search/browse", json=payload)
        return data.get("results", data if isinstance(data, list) else [])
    except Exception:
        return []


async def get_memory_by_id(memory_id: str) -> dict:
    return await _recall_get(f"/memory/{memory_id}")


async def get_pinned(domain: str) -> list[dict]:
    results = await browse_recall(domain, limit=100)
    return [r for r in results if r.get("pinned")]


async def pin_memory(memory_id: str) -> dict:
    return await _recall_post(f"/memory/{memory_id}/pin")


async def unpin_memory(memory_id: str) -> dict:
    return await _recall_delete(f"/memory/{memory_id}/pin")


async def get_recall_context(query: str, max_tokens: int = 2000) -> str | None:
    """Get assembled context from Recall for system prompt enrichment."""
    try:
        data = await _recall_post(
            "/search/context", json={"query": query, "max_tokens": max_tokens}
        )
        return data.get("context") or data.get("text") or None
    except Exception:
        return None


async def store_knowledge(
    project_slug: str,
    name: str,
    entity_type: str,
    description: str,
    metadata: dict | None = None,
) -> dict:
    """Store a knowledge item in Recall. Silently fails on error."""
    payload = {
        "content": description,
        "domain": f"codevv:{project_slug}",
        "tags": [f"type:{entity_type}"],
        "metadata": {"name": name, "entity_type": entity_type, **(metadata or {})},
    }
    try:
        return await _recall_post("/memory/store", json=payload)
    except Exception:
        return {}
