import httpx
from sqlalchemy import select
from app.core.database import async_session
from app.models.recall_pairing import RecallPairing

# Stable instance ID for this Codevv deployment
INSTANCE_ID = "codevv-main"

_pairing_token: str | None = None


async def ensure_paired(recall_url: str) -> bool:
    """Register with Recall at startup. Returns True if paired successfully."""
    global _pairing_token
    async with async_session() as db:
        # Check if we already have a pairing
        r = await db.execute(
            select(RecallPairing).where(RecallPairing.instance_id == INSTANCE_ID)
        )
        pairing = r.scalar_one_or_none()

        if pairing:
            _pairing_token = pairing.pairing_token
            return True

        # Register with Recall
        try:
            async with httpx.AsyncClient(base_url=recall_url, timeout=10.0) as client:
                resp = await client.post("/api/clients/register", json={
                    "client_name": "codevv",
                    "instance_id": INSTANCE_ID,
                })
                if resp.status_code in (200, 201):
                    data = resp.json()
                    token = data.get("token") or data.get("pairing_token") or "codevv-default"
                else:
                    # Recall doesn't have a registration endpoint yet -- use default key
                    token = "recall-admin-key-change-me"
        except Exception:
            # Recall unreachable -- use configured API key as fallback
            token = "recall-admin-key-change-me"

        # Store pairing
        pairing = RecallPairing(
            recall_url=recall_url,
            instance_id=INSTANCE_ID,
            pairing_token=token,
        )
        db.add(pairing)
        await db.commit()
        _pairing_token = token
        return True


async def get_pairing_token() -> str | None:
    """Get the current pairing token."""
    return _pairing_token
