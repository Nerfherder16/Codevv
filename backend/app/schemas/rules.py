from pydantic import BaseModel


class RuleResponse(BaseModel):
    id: str
    content: str
    domain: str | None = None
    tags: list[str] = []
    importance: float | None = None
    pinned: bool = False
    created_at: str | None = None


class RulePinRequest(BaseModel):
    memory_id: str


class RuleSearchRequest(BaseModel):
    query: str
    limit: int = 20
