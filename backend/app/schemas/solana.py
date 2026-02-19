from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.solana import SolanaNetwork


class WatchlistCreate(BaseModel):
    label: str
    address: str
    network: SolanaNetwork = SolanaNetwork.devnet


class WatchlistResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    label: str
    address: str
    network: SolanaNetwork
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class SolanaBalanceResponse(BaseModel):
    address: str
    lamports: int
    sol: float


class SolanaTransactionResponse(BaseModel):
    signature: str
    slot: int | None = None
    block_time: int | None = None
    success: bool
    fee: int | None = None
