import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.knowledge import KnowledgeEntity
from app.services.embedding import get_embedding


async def auto_propagate_entity(
    project_id: uuid.UUID,
    name: str,
    entity_type: str,
    properties: dict | None,
    db: AsyncSession,
    source_type: str | None = None,
    source_id: uuid.UUID | None = None,
) -> KnowledgeEntity:
    """Check if entity exists by name+project; create if not. Returns entity."""
    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.project_id == project_id,
            KnowledgeEntity.name == name,
        )
    )
    entity = result.scalar_one_or_none()
    if entity:
        return entity

    entity = KnowledgeEntity(
        id=uuid.uuid4(),
        project_id=project_id,
        name=name,
        entity_type=entity_type,
        description=properties.get("description") if properties else None,
        metadata_json=properties,
        source_type=source_type,
        source_id=source_id,
    )
    try:
        entity.embedding = await get_embedding(f"{name}\n{entity.description or ''}")
    except Exception:
        pass
    db.add(entity)
    await db.flush()
    return entity
