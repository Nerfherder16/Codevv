from pydantic import BaseModel
import uuid


class DependencyNode(BaseModel):
    id: uuid.UUID
    name: str
    component_type: str
    tech_stack: str | None = None
    canvas_id: uuid.UUID | None = None


class DependencyEdge(BaseModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    relation_type: str
    weight: float | None = None


class DependencyGraphResponse(BaseModel):
    nodes: list[DependencyNode]
    edges: list[DependencyEdge]
    stats: dict


class ImpactAnalysisResponse(BaseModel):
    node_id: uuid.UUID
    node_name: str
    direct_dependents: int
    transitive_dependents: int
    affected_nodes: list[DependencyNode]


class CycleResponse(BaseModel):
    cycles: list[list[str]]
    has_cycles: bool
