"""File storage service — persist uploaded files to disk + Postgres."""

import uuid
import os
from pathlib import Path

from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.file import File

FILES_ROOT = Path(os.getenv("FILES_ROOT", "/data/files"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def store_file(
    project_id: uuid.UUID,
    file: UploadFile,
    user_id: uuid.UUID,
    db: AsyncSession,
    source: str = "document",
    conversation_message_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
) -> File:
    """Read upload, write to disk, create DB record."""
    content = await file.read()
    size = len(content)

    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Determine extension
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower() or ""
    file_id = uuid.uuid4()

    # Ensure directory exists
    project_dir = FILES_ROOT / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    storage_path = str(project_dir / f"{file_id}{ext}")

    with open(storage_path, "wb") as f:
        f.write(content)

    record = File(
        id=file_id,
        project_id=project_id,
        original_filename=filename,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=size,
        storage_path=storage_path,
        source=source,
        uploaded_by=user_id,
        conversation_message_id=conversation_message_id,
        session_id=session_id,
    )
    db.add(record)
    await db.flush()

    return record


async def get_file(file_id: uuid.UUID, db: AsyncSession) -> File | None:
    result = await db.execute(select(File).where(File.id == file_id))
    return result.scalar_one_or_none()


async def get_file_bytes(file: File) -> bytes:
    path = Path(file.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File data not found on disk")
    return path.read_bytes()


async def list_files(
    project_id: uuid.UUID,
    db: AsyncSession,
    source: str | None = None,
) -> list[File]:
    q = select(File).where(File.project_id == project_id)
    if source:
        q = q.where(File.source == source)
    q = q.order_by(File.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def delete_file(file: File, db: AsyncSession) -> None:
    """Delete DB record and file from disk."""
    path = Path(file.storage_path)
    if path.exists():
        path.unlink(missing_ok=True)
    await db.delete(file)
    await db.flush()
