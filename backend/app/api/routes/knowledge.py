from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sa_delete, select, text
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation
from app.schemas.knowledge import (
    EntityCreate,
    EntityUpdate,
    RelationCreate,
    EntityResponse,
    RelationResponse,
    GraphTraversalRequest,
    GraphResponse,
    GraphNode,
    GraphEdge,
    SemanticSearchRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.embedding import get_embedding
import uuid

router = APIRouter(prefix="/projects/{project_id}/knowledge", tags=["knowledge"])


# --- Entities ---


@router.post("/entities", response_model=EntityResponse, status_code=201)
async def create_entity(
    project_id: uuid.UUID,
    req: EntityCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    entity = KnowledgeEntity(
        id=uuid.uuid4(),
        project_id=project_id,
        name=req.name,
        entity_type=req.entity_type,
        description=req.description,
        path=req.path,
        metadata_json=req.metadata_json,
        source_type="manual",
    )
    try:
        entity.embedding = await get_embedding(f"{req.name}\n{req.description or ''}")
    except Exception:
        pass
    db.add(entity)
    await db.flush()
    return EntityResponse.model_validate(entity)


@router.get("/entities", response_model=list[EntityResponse])
async def list_entities(
    project_id: uuid.UUID,
    entity_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    query = select(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id)
    if entity_type:
        query = query.where(KnowledgeEntity.entity_type == entity_type)
    result = await db.execute(query.order_by(KnowledgeEntity.created_at.desc()))
    return [EntityResponse.model_validate(e) for e in result.scalars().all()]


@router.patch("/entities/{entity_id}", response_model=EntityResponse)
async def update_entity(
    project_id: uuid.UUID,
    entity_id: uuid.UUID,
    req: EntityUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.id == entity_id, KnowledgeEntity.project_id == project_id
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    if req.name is not None:
        entity.name = req.name
    if req.description is not None:
        entity.description = req.description
    if req.path is not None:
        entity.path = req.path
    if req.metadata_json is not None:
        entity.metadata_json = req.metadata_json

    if req.name is not None or req.description is not None:
        try:
            entity.embedding = await get_embedding(
                f"{entity.name}\n{entity.description or ''}"
            )
        except Exception:
            pass
    await db.flush()
    return EntityResponse.model_validate(entity)


@router.delete("/entities/{entity_id}", status_code=204)
async def delete_entity(
    project_id: uuid.UUID,
    entity_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.id == entity_id, KnowledgeEntity.project_id == project_id
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    # Delete relations involving this entity

    await db.execute(
        sa_delete(KnowledgeRelation).where(
            (KnowledgeRelation.source_id == entity_id)
            | (KnowledgeRelation.target_id == entity_id)
        )
    )
    await db.delete(entity)
    await db.flush()


# --- Relations ---


@router.post("/relations", response_model=RelationResponse, status_code=201)
async def create_relation(
    project_id: uuid.UUID,
    req: RelationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    relation = KnowledgeRelation(
        id=uuid.uuid4(),
        project_id=project_id,
        source_id=req.source_id,
        target_id=req.target_id,
        relation_type=req.relation_type,
        weight=req.weight,
        metadata_json=req.metadata_json,
    )
    db.add(relation)
    await db.flush()
    return RelationResponse.model_validate(relation)


@router.get("/relations", response_model=list[RelationResponse])
async def list_relations(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(KnowledgeRelation).where(KnowledgeRelation.project_id == project_id)
    )
    return [RelationResponse.model_validate(r) for r in result.scalars().all()]


# --- Graph Traversal (Recursive CTE) ---


@router.post("/traverse", response_model=GraphResponse)
async def traverse_graph(
    project_id: uuid.UUID,
    req: GraphTraversalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    # Build recursive CTE query
    relation_filter = ""
    params = {
        "start_id": str(req.start_id),
        "project_id": str(project_id),
        "max_depth": req.max_depth,
    }
    if req.relation_types:
        placeholders = ", ".join(f":rt_{i}" for i in range(len(req.relation_types)))
        relation_filter = f"AND r.relation_type IN ({placeholders})"
        for i, rt in enumerate(req.relation_types):
            params[f"rt_{i}"] = rt

    query = text(f"""
        WITH RECURSIVE graph AS (
            SELECT e.id, e.name, e.entity_type, 0 as depth
            FROM knowledge_entities e
            WHERE e.id = :start_id AND e.project_id = :project_id
            UNION
            SELECT e2.id, e2.name, e2.entity_type, g.depth + 1
            FROM graph g
            JOIN knowledge_relations r ON (r.source_id = g.id OR r.target_id = g.id)
                AND r.project_id = :project_id {relation_filter}
            JOIN knowledge_entities e2 ON e2.id = CASE
                WHEN r.source_id = g.id THEN r.target_id
                ELSE r.source_id
            END
            WHERE g.depth < :max_depth
        )
        SELECT DISTINCT id, name, entity_type, depth FROM graph
    """)

    result = await db.execute(query, params)
    rows = result.fetchall()
    node_ids = {row.id for row in rows}

    nodes = [
        GraphNode(id=r.id, name=r.name, entity_type=r.entity_type, depth=r.depth)
        for r in rows
    ]

    # Get edges between discovered nodes
    edges_result = await db.execute(
        select(KnowledgeRelation).where(
            KnowledgeRelation.project_id == project_id,
            KnowledgeRelation.source_id.in_(node_ids),
            KnowledgeRelation.target_id.in_(node_ids),
        )
    )
    edges = [
        GraphEdge(
            source=r.source_id,
            target=r.target_id,
            relation_type=r.relation_type,
            weight=r.weight,
        )
        for r in edges_result.scalars().all()
    ]

    return GraphResponse(nodes=nodes, edges=edges)


# --- Semantic Search ---


@router.post("/search", response_model=list[EntityResponse])
async def semantic_search(
    project_id: uuid.UUID,
    req: SemanticSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    try:
        query_embedding = await get_embedding(req.query)
    except Exception:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")

    query = select(KnowledgeEntity).where(
        KnowledgeEntity.project_id == project_id,
        KnowledgeEntity.embedding.isnot(None),
    )
    if req.entity_type:
        query = query.where(KnowledgeEntity.entity_type == req.entity_type)

    query = query.order_by(
        KnowledgeEntity.embedding.cosine_distance(query_embedding)
    ).limit(req.limit)

    result = await db.execute(query)
    return [EntityResponse.model_validate(e) for e in result.scalars().all()]
