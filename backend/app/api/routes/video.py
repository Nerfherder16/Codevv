from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.models.project import ProjectRole
from app.models.video import VideoRoom
from app.schemas.video import RoomCreate, RoomResponse, RoomTokenResponse
from app.api.routes.projects import get_project_with_access
from livekit import api as lk_api
import uuid

router = APIRouter(prefix="/projects/{project_id}/rooms", tags=["video"])
settings = get_settings()


@router.post("", response_model=RoomResponse, status_code=201)
async def create_room(
    project_id: uuid.UUID,
    req: RoomCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    room_name = f"bh-{project_id.hex[:8]}-{uuid.uuid4().hex[:8]}"
    room = VideoRoom(
        id=uuid.uuid4(),
        project_id=project_id,
        canvas_id=req.canvas_id,
        name=req.name,
        livekit_room_name=room_name,
        created_by=user.id,
    )
    db.add(room)
    await db.flush()
    return RoomResponse.model_validate(room)


@router.get("", response_model=list[RoomResponse])
async def list_rooms(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.project_id == project_id, VideoRoom.is_active.is_(True)
        )
    )
    return [RoomResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/{room_id}/token", response_model=RoomTokenResponse)
async def get_room_token(
    project_id: uuid.UUID,
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.id == room_id, VideoRoom.project_id == project_id
        )
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    token = (
        lk_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(str(user.id))
        .with_name(user.display_name)
        .with_grants(
            lk_api.VideoGrants(
                room_join=True,
                room=room.livekit_room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
    )

    public_url = settings.livekit_public_url or settings.livekit_url
    return RoomTokenResponse(
        token=token.to_jwt(),
        room_name=room.livekit_room_name,
        url=public_url,
    )


@router.delete("/{room_id}", status_code=204)
async def close_room(
    project_id: uuid.UUID,
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.id == room_id, VideoRoom.project_id == project_id
        )
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room.is_active = False
    await db.flush()
