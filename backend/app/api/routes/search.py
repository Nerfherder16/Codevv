from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectMember
import uuid, json

router = APIRouter()


@router.get("/projects/{project_id}/search")
async def project_search(
    project_id: uuid.UUID,
    q: str = Query(..., min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full-text search across all project entities."""
    r = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")

    from app.services.claude_service import _tool_search_everything
    result_str = await _tool_search_everything(str(project_id), q, db)
    return json.loads(result_str)
