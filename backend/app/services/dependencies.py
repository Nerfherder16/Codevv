import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.canvas import Canvas, CanvasComponent
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation


async def build_dependency_graph(project_id: uuid.UUID, db: AsyncSession) -> dict:
    # Get all canvas components for this project
    comp_result = await db.execute(
        select(CanvasComponent, Canvas.id.label("canvas_id"))
        .join(Canvas, Canvas.id == CanvasComponent.canvas_id)
        .where(Canvas.project_id == project_id)
    )
    rows = comp_result.all()

    nodes = []
    node_ids = set()
    for row in rows:
        comp = row[0]
        canvas_id = row[1]
        nodes.append(
            {
                "id": comp.id,
                "name": comp.name,
                "component_type": comp.component_type,
                "tech_stack": comp.tech_stack,
                "canvas_id": canvas_id,
            }
        )
        node_ids.add(comp.id)

    # Get knowledge relations that connect components (via knowledge entities)
    # Map knowledge entities to canvas components by name
    entity_result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.project_id == project_id,
            KnowledgeEntity.entity_type == "component",
        )
    )
    entities = entity_result.scalars().all()
    entity_name_to_comp = {}
    comp_name_map = {n["name"].lower(): n["id"] for n in nodes}
    for entity in entities:
        if entity.name.lower() in comp_name_map:
            entity_name_to_comp[entity.id] = comp_name_map[entity.name.lower()]

    # Get relations between component entities
    if entity_name_to_comp:
        entity_ids = list(entity_name_to_comp.keys())
        rel_result = await db.execute(
            select(KnowledgeRelation).where(
                KnowledgeRelation.project_id == project_id,
                KnowledgeRelation.source_id.in_(entity_ids),
                KnowledgeRelation.target_id.in_(entity_ids),
            )
        )
        relations = rel_result.scalars().all()
    else:
        relations = []

    edges = []
    for rel in relations:
        source_comp = entity_name_to_comp.get(rel.source_id)
        target_comp = entity_name_to_comp.get(rel.target_id)
        if source_comp and target_comp:
            edges.append(
                {
                    "source_id": source_comp,
                    "target_id": target_comp,
                    "relation_type": rel.relation_type,
                    "weight": rel.weight,
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "max_depth": _calc_max_depth(nodes, edges),
        },
    }


def _calc_max_depth(nodes: list[dict], edges: list[dict]) -> int:
    if not edges:
        return 0
    adj: dict[str, list[str]] = {}
    for e in edges:
        src = str(e["source_id"])
        adj.setdefault(src, []).append(str(e["target_id"]))

    max_d = 0
    for node in nodes:
        visited: set[str] = set()
        stack = [(str(node["id"]), 0)]
        while stack:
            nid, depth = stack.pop()
            if nid in visited:
                continue
            visited.add(nid)
            max_d = max(max_d, depth)
            for neighbor in adj.get(nid, []):
                if neighbor not in visited:
                    stack.append((neighbor, depth + 1))
    return max_d


def detect_cycles(nodes: list[dict], edges: list[dict]) -> list[list[str]]:
    adj: dict[str, list[str]] = {}
    name_map: dict[str, str] = {}
    for n in nodes:
        nid = str(n["id"])
        adj[nid] = []
        name_map[nid] = n["name"]
    for e in edges:
        adj.setdefault(str(e["source_id"]), []).append(str(e["target_id"]))

    cycles: list[list[str]] = []
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {nid: WHITE for nid in adj}
    path: list[str] = []

    def dfs(u: str) -> None:
        color[u] = GRAY
        path.append(u)
        for v in adj.get(u, []):
            if color.get(v) == GRAY:
                idx = path.index(v)
                cycle = [name_map[n] for n in path[idx:]]
                cycles.append(cycle)
            elif color.get(v) == WHITE:
                dfs(v)
        path.pop()
        color[u] = BLACK

    for nid in adj:
        if color[nid] == WHITE:
            dfs(nid)
    return cycles


async def calculate_impact(
    node_id: uuid.UUID, nodes: list[dict], edges: list[dict]
) -> dict:
    # Build reverse adjacency (who depends on this node)
    rev_adj: dict[str, list[str]] = {}
    for e in edges:
        target = str(e["target_id"])
        rev_adj.setdefault(target, []).append(str(e["source_id"]))

    # BFS from node_id through reverse edges
    nid = str(node_id)
    visited: set[str] = set()
    queue = [nid]
    direct = set(rev_adj.get(nid, []))

    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        for neighbor in rev_adj.get(current, []):
            if neighbor not in visited:
                queue.append(neighbor)

    visited.discard(nid)
    name_map = {str(n["id"]): n for n in nodes}
    node_info = name_map.get(nid, {})

    return {
        "node_id": node_id,
        "node_name": node_info.get("name", ""),
        "direct_dependents": len(direct),
        "transitive_dependents": len(visited),
        "affected_nodes": [name_map[v] for v in visited if v in name_map],
    }
