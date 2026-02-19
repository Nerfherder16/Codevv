from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.api.routes.projects import get_project_with_access
from app.services.recall import _recall_post, browse_recall
import uuid

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


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

    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400, detail="Only text-based files are supported"
        )

    # Encode metadata as tags — Recall returns tags but not metadata
    tags = [
        f"filename:{file.filename}",
        f"content_type:{file.content_type or 'text/plain'}",
        f"uploaded_by:{user.id}",
        "type:document",
    ]

    result = await _recall_post(
        "/memory/store",
        json={
            "content": content,
            "domain": domain,
            "memory_type": "semantic",
            "tags": tags,
            "metadata": {
                "filename": file.filename,
                "content_type": file.content_type,
                "uploaded_by": str(user.id),
            },
        },
    )

    return {
        "filename": file.filename,
        "size": len(content_bytes),
        "domain": domain,
        "memory_id": result.get("id"),
    }


@router.get("")
async def list_documents(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db)
    domain = f"codevv:{project.slug}"
    results = await browse_recall(domain, limit=50, memory_types=["semantic"])
    docs = []
    for r in results:
        tags = r.get("tags") or []
        # Extract metadata from tags (format: "key:value")
        tag_map = {}
        for t in tags:
            if ":" in t:
                key, _, val = t.partition(":")
                tag_map[key] = val
        # Skip non-document memories (only show tagged uploads)
        if "type" in tag_map and tag_map["type"] != "document":
            continue
        # If no type tag, still show but try to get filename
        filename = tag_map.get("filename") or r.get("filename", "unknown")
        content_type = tag_map.get("content_type") or r.get("content_type")
        docs.append(
            {
                "id": r.get("id"),
                "filename": filename,
                "content_type": content_type,
                "created_at": r.get("created_at") or r.get("timestamp"),
            }
        )
    return docs
