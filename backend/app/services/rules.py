from app.services.recall import (
    browse_recall,
    search_recall,
    pin_memory,
    unpin_memory,
    get_memory_by_id,
)


def _to_rule(mem: dict) -> dict:
    return {
        "id": mem.get("id", ""),
        "content": mem.get("content", mem.get("text", "")),
        "domain": mem.get("domain"),
        "tags": mem.get("tags", []),
        "importance": mem.get("importance"),
        "pinned": mem.get("pinned", False),
        "created_at": mem.get("created_at"),
    }


async def get_pinned_rules(project_slug: str) -> list[dict]:
    domain = f"codevv:{project_slug}"
    results = await browse_recall(domain, limit=100)
    pinned = [r for r in results if r.get("pinned")]
    rules = []
    for mem in pinned:
        rule = _to_rule(mem)
        # Browse may not return full content — fetch individually if empty
        if not rule["content"] and rule["id"]:
            try:
                full = await get_memory_by_id(rule["id"])
                rule["content"] = full.get("content", full.get("text", ""))
            except Exception:
                pass
        rules.append(rule)
    return rules


async def search_rules(project_slug: str, query: str, limit: int = 20) -> list[dict]:
    domain = f"codevv:{project_slug}"
    results = await search_recall(query, domains=[domain], limit=limit)
    return [_to_rule(r) for r in results]


async def pin_rule(memory_id: str) -> dict:
    return await pin_memory(memory_id)


async def unpin_rule(memory_id: str) -> dict:
    return await unpin_memory(memory_id)
