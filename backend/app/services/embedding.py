import httpx
from app.core.config import get_settings

settings = get_settings()


async def get_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/embed",
            json={"model": settings.ollama_embed_model, "input": text},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"][0]
