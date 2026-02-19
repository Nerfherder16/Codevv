import httpx
from app.core.config import get_settings

settings = get_settings()


async def _recall_post(path: str, json: dict | None = None) -> dict:
    async with httpx.AsyncClient(base_url=settings.recall_url, timeout=10.0) as client:
        resp = await client.post(path, json=json or {})
        resp.raise_for_status()
        return resp.json()


async def _recall_get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(base_url=settings.recall_url, timeout=10.0) as client:
        resp = await client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()


async def _recall_delete(path: str) -> dict:
    async with httpx.AsyncClient(base_url=settings.recall_url, timeout=10.0) as client:
        resp = await client.delete(path)
        resp.raise_for_status()
        return resp.json()


async def search_recall(
    query: str,
    domains: list[str] | None = None,
    limit: int = 20,
) -> list[dict]:
    payload: dict = {"query": query, "limit": limit}
    if domains:
        payload["domains"] = domains
    data = await _recall_post("/search/query", json=payload)
    return data.get("results", data if isinstance(data, list) else [])


async def browse_recall(
    domain: str,
    limit: int = 50,
    memory_types: list[str] | None = None,
    query: str = "*",
) -> list[dict]:
    payload: dict = {"query": query, "domains": [domain], "limit": limit}
    if memory_types:
        payload["memory_types"] = memory_types
    data = await _recall_post("/search/browse", json=payload)
    return data.get("results", data if isinstance(data, list) else [])


async def get_pinned(domain: str) -> list[dict]:
    results = await browse_recall(domain, limit=100)
    return [r for r in results if r.get("pinned")]


async def pin_memory(memory_id: str) -> dict:
    return await _recall_post(f"/memory/{memory_id}/pin")


async def unpin_memory(memory_id: str) -> dict:
    return await _recall_delete(f"/memory/{memory_id}/pin")
