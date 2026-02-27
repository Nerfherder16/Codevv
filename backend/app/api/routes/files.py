"""File upload/download routes."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.api.routes.projects import get_project_with_access
from app.services.file_storage import (
    store_file,
    get_file,
    get_file_bytes,
    list_files,
    delete_file,
)
from app.services.activity import log_activity

router = APIRouter(prefix="/projects/{project_id}/files", tags=["files"])


def _file_response(f) -> dict:
    return {
        "id": str(f.id),
        "project_id": str(f.project_id),
        "original_filename": f.original_filename,
        "mime_type": f.mime_type,
        "size_bytes": f.size_bytes,
        "source": f.source,
        "uploaded_by": str(f.uploaded_by),
        "created_at": f.created_at.isoformat(),
    }


@router.post("/upload", status_code=201)
async def upload_file(
    project_id: uuid.UUID,
    file: UploadFile = FastAPIFile(...),
    source: str = "document",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    record = await store_file(
        project_id=project_id,
        file=file,
        user_id=user.id,
        db=db,
        source=source,
    )
    await db.commit()

    try:
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action="uploaded",
            entity_type="file",
            entity_id=str(record.id),
            entity_name=record.original_filename,
            db=db,
        )
    except Exception:
        pass

    return _file_response(record)


@router.get("")
async def list_project_files(
    project_id: uuid.UUID,
    source: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    files = await list_files(project_id, db, source=source)
    return [_file_response(f) for f in files]


@router.get("/{file_id}")
async def get_file_metadata(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    f = await get_file(file_id, db)
    if not f or f.project_id != project_id:
        raise HTTPException(status_code=404, detail="File not found")
    return _file_response(f)


@router.get("/{file_id}/download")
async def download_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    f = await get_file(file_id, db)
    if not f or f.project_id != project_id:
        raise HTTPException(status_code=404, detail="File not found")

    data = await get_file_bytes(f)
    return Response(
        content=data,
        media_type=f.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{f.original_filename}"'
        },
    )


@router.delete("/{file_id}", status_code=204)
async def delete_project_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    f = await get_file(file_id, db)
    if not f or f.project_id != project_id:
        raise HTTPException(status_code=404, detail="File not found")
    await delete_file(f, db)
    await db.commit()
