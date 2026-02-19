from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.solana import SolanaWatchlist, SolanaNetwork
from app.schemas.solana import (
    WatchlistCreate,
    WatchlistResponse,
    SolanaBalanceResponse,
    SolanaTransactionResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/solana", tags=["solana"])
settings = get_settings()

NETWORK_URLS = {
    SolanaNetwork.devnet: "https://api.devnet.solana.com",
    SolanaNetwork.testnet: "https://api.testnet.solana.com",
    SolanaNetwork.mainnet_beta: "https://api.mainnet-beta.solana.com",
}


async def _rpc_call(network: SolanaNetwork, method: str, params: list) -> dict:
    url = NETWORK_URLS.get(network, settings.solana_rpc_url)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(
                status_code=502, detail=data["error"].get("message", "RPC error")
            )
        return data.get("result", {})


async def _get_watchlist_item(
    project_id: uuid.UUID, item_id: uuid.UUID, db: AsyncSession
) -> SolanaWatchlist:
    result = await db.execute(
        select(SolanaWatchlist).where(
            SolanaWatchlist.id == item_id,
            SolanaWatchlist.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    return item


@router.get("/watchlist", response_model=list[WatchlistResponse])
async def list_watchlist(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(SolanaWatchlist)
        .where(SolanaWatchlist.project_id == project_id)
        .order_by(SolanaWatchlist.created_at.desc())
    )
    return [WatchlistResponse.model_validate(w) for w in result.scalars().all()]


@router.post("/watchlist", response_model=WatchlistResponse, status_code=201)
async def add_to_watchlist(
    project_id: uuid.UUID,
    req: WatchlistCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    item = SolanaWatchlist(
        id=uuid.uuid4(),
        project_id=project_id,
        label=req.label,
        address=req.address,
        network=req.network,
        created_by=user.id,
    )
    db.add(item)
    await db.flush()
    return WatchlistResponse.model_validate(item)


@router.delete("/watchlist/{item_id}", status_code=204)
async def remove_from_watchlist(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    item = await _get_watchlist_item(project_id, item_id, db)
    await db.delete(item)
    await db.flush()


@router.get("/watchlist/{item_id}/balance", response_model=SolanaBalanceResponse)
async def get_balance(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    item = await _get_watchlist_item(project_id, item_id, db)
    try:
        result = await _rpc_call(item.network, "getBalance", [item.address])
        lamports = result.get("value", 0)
        return SolanaBalanceResponse(
            address=item.address,
            lamports=lamports,
            sol=lamports / 1_000_000_000,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Solana RPC error: {e}")


@router.get(
    "/watchlist/{item_id}/transactions", response_model=list[SolanaTransactionResponse]
)
async def get_transactions(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    limit: int = 10,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    item = await _get_watchlist_item(project_id, item_id, db)
    try:
        sigs = await _rpc_call(
            item.network, "getSignaturesForAddress", [item.address, {"limit": limit}]
        )
        txs = []
        for sig_info in sigs if isinstance(sigs, list) else []:
            txs.append(
                SolanaTransactionResponse(
                    signature=sig_info.get("signature", ""),
                    slot=sig_info.get("slot"),
                    block_time=sig_info.get("blockTime"),
                    success=sig_info.get("err") is None,
                    fee=None,
                )
            )
        return txs
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Solana RPC error: {e}")
