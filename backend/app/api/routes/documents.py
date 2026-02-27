from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.api.routes.projects import get_project_with_access
from app.services.activity import log_activity
from app.services.recall import _recall_post
from app.services.file_storage import store_file, get_file, get_file_bytes, list_files
import uuid
import io

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])

DOCX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def _extract_docx_text(content_bytes: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(content_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


@router.post("/upload", status_code=201)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(
        project_id, user, db, min_role=ProjectRole.editor
    )
    domain = f"codevv:{project.slug}"

    # 1. Store original bytes to file storage (preserves original for download)
    file_record = await store_file(project_id, file, user.id, db, source="document")

    # 2. Read bytes back for text extraction
    try:
        content_bytes = await get_file_bytes(file_record)
    except HTTPException:
        content_bytes = b""

    # 3. Extract text for Recall indexing
    filename = file_record.original_filename
    is_docx = (
        filename.lower().endswith(".docx") or file_record.mime_type in DOCX_MIME_TYPES
    )

    if is_docx and content_bytes:
        try:
            content = _extract_docx_text(content_bytes)
        except Exception:
            content = f"[DOCX parse failed: {filename}]"
    elif content_bytes:
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = f"[Binary file: {filename}]"
    else:
        content = f"[File: {filename}]"

    # 4. Index text in Recall
    tags = [
        f"filename:{filename}",
        f"content_type:{file_record.mime_type}",
        f"uploaded_by:{user.id}",
        f"file_id:{file_record.id}",
        "type:document",
    ]
    try:
        recall_result = await _recall_post(
            "/memory/store",
            json={
                "content": content,
                "domain": domain,
                "memory_type": "semantic",
                "tags": tags,
                "metadata": {
                    "filename": filename,
                    "content_type": file_record.mime_type,
                    "uploaded_by": str(user.id),
                    "file_id": str(file_record.id),
                },
            },
        )
        # 5. Link recall memory id back to file record
        file_record.recall_memory_id = str(recall_result.get("id", ""))
        db.add(file_record)
        await db.commit()
        memory_id = recall_result.get("id")
    except Exception:
        memory_id = None

    try:
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action="uploaded",
            entity_type="document",
            entity_id=str(file_record.id),
            entity_name=filename,
            db=db,
        )
    except Exception:
        pass

    return {
        "id": str(file_record.id),
        "filename": filename,
        "mime_type": file_record.mime_type,
        "size_bytes": file_record.size_bytes,
        "memory_id": memory_id,
        "domain": domain,
    }


@router.get("")
async def list_documents(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    files = await list_files(project_id, db, source="document")
    return [
        {
            "id": str(f.id),
            "filename": f.original_filename,
            "mime_type": f.mime_type,
            "size_bytes": f.size_bytes,
            "memory_id": f.recall_memory_id,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


@router.get("/{document_id}/download")
async def download_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    file_record = await get_file(document_id, db)
    if not file_record or file_record.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    content_bytes = await get_file_bytes(file_record)
    return Response(
        content=content_bytes,
        media_type=file_record.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_record.original_filename}"'
        },
    )


@router.get("/{document_id}")
async def get_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    file_record = await get_file(document_id, db)
    if not file_record or file_record.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Return text content from stored bytes
    try:
        content_bytes = await get_file_bytes(file_record)
        is_docx = (
            file_record.original_filename.lower().endswith(".docx")
            or file_record.mime_type in DOCX_MIME_TYPES
        )
        if is_docx:
            content = _extract_docx_text(content_bytes)
        else:
            content = content_bytes.decode("utf-8", errors="replace")
    except Exception:
        content = "(Content unavailable)"

    return {
        "id": str(file_record.id),
        "content": content,
    }
