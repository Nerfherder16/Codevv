"""Claude service — Anthropic API calls with in-process tool execution for Docker."""

from __future__ import annotations

import json
import uuid
from typing import AsyncIterator

import anthropic
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.services import claude_auth
from app.services.recall import get_recall_context, store_knowledge
from app.models.project import Project
from app.models.canvas import Canvas, CanvasComponent
from app.models.idea import Idea
from app.models.scaffold import ScaffoldJob
from app.models.deploy import Environment
from app.models.knowledge import KnowledgeEntity
from app.models.conversation import Conversation, ConversationMessage
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.compliance import ComplianceChecklist, ComplianceCheck, CheckStatus
from app.models.activity import Activity
from app.models.business_rule import BusinessRule
from app.models.file import File as ProjectFile
from app.models.canvas import Canvas, CanvasComponent
from app.models.idea import Idea, IdeaStatus


logger = structlog.get_logger()

# ── Anthropic tool definitions (10 built-in tools, no autopilot/MCP) ─────

TOOLS = [
    {
        "name": "get_project_summary",
        "description": "Get project overview including member count, canvas count, idea count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project UUID"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_canvas_components",
        "description": "Get all components on a canvas with their types, tech stacks, and descriptions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "canvas_id": {"type": "string"},
            },
            "required": ["project_id", "canvas_id"],
        },
    },
    {
        "name": "list_canvases",
        "description": "List all canvases in a project with their names and component counts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_ideas",
        "description": "Get ideas in a project, optionally filtered by status (draft/proposed/approved/rejected/implemented).",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "status": {
                    "type": "string",
                    "description": "Filter by status. Optional.",
                },
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "search_ideas",
        "description": "Search across ideas in a project by keyword.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["project_id", "query"],
        },
    },
    {
        "name": "get_scaffold_job",
        "description": "Get scaffold job details including generated files and status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "job_id": {"type": "string"},
            },
            "required": ["project_id", "job_id"],
        },
    },
    {
        "name": "get_deploy_config",
        "description": "Get deployment environments with Docker Compose and env configuration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_knowledge_context",
        "description": "Get assembled knowledge context from Recall for a given query and project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_slug": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "create_idea",
        "description": "Create a new Idea from the conversation. Use when the user asks to capture something as an idea or a design proposal emerges.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short title for the idea"},
                "description": {
                    "type": "string",
                    "description": "Detailed description of the idea",
                },
                "category": {
                    "type": "string",
                    "description": "Optional category (e.g. feature, improvement, research)",
                },
            },
            "required": ["title", "description"],
        },
    },
    {
        "name": "push_to_recall",
        "description": "Store key decisions, entities, or facts from this conversation in the project's knowledge base (Recall). Use when the user asks to 'remember this', 'save to Recall', or 'save to memory', or when important architectural decisions emerge.",
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "List of knowledge items to store",
                    "items": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "The knowledge content to store",
                            },
                            "entity_type": {
                                "type": "string",
                                "enum": [
                                    "decision",
                                    "concept",
                                    "technology",
                                    "requirement",
                                    "architecture",
                                ],
                                "description": "Type of knowledge entity",
                            },
                        },
                        "required": ["content", "entity_type"],
                    },
                },
            },
            "required": ["items"],
        },
    },
    {
        "name": "add_canvas_component",
        "description": "Add a new component to an architecture canvas. Use when the user says 'add X to the architecture' or 'create a Y component'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "canvas_id": {"type": "string", "description": "The canvas to add to"},
                "name": {"type": "string", "description": "Component name"},
                "component_type": {"type": "string", "description": "Type: service, database, api, frontend, queue, cache, storage, external"},
                "tech_stack": {"type": "string", "description": "Technology (e.g. FastAPI, PostgreSQL, React)"},
                "description": {"type": "string", "description": "What this component does"},
            },
            "required": ["project_id", "canvas_id", "name", "component_type"],
        },
    },
    {
        "name": "update_idea_status",
        "description": "Move an idea to a new status. Valid statuses: draft, proposed, approved, rejected, implemented.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "idea_id": {"type": "string"},
                "status": {"type": "string", "enum": ["draft", "proposed", "approved", "rejected", "implemented"]},
            },
            "required": ["project_id", "idea_id", "status"],
        },
    },
    {
        "name": "update_compliance_check",
        "description": "Mark a compliance check as passed, failed, or pending. Use when the user confirms a compliance item is done or failed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "check_id": {"type": "string"},
                "status": {"type": "string", "enum": ["passed", "failed", "pending"]},
                "notes": {"type": "string", "description": "Optional notes about this update"},
            },
            "required": ["project_id", "check_id", "status"],
        },
    },
    {
        "name": "create_task",
        "description": "Create a task and optionally assign it to a team member. Use when action items emerge from conversation or user says 'remind me to...' or 'we need to...'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                "due_date": {"type": "string", "description": "ISO date string, e.g. 2026-03-15. Optional."},
            },
            "required": ["project_id", "title"],
        },
    },
    {
        "name": "list_tasks",
        "description": "Get project tasks with optional filters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "status": {"type": "string", "description": "Filter: todo, in_progress, done, cancelled"},
                "priority": {"type": "string", "description": "Filter: low, medium, high, urgent"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "create_document",
        "description": "Save content from the conversation as a project document. Use when user asks to 'save this as a document', 'create a spec', or 'document this decision'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "title": {"type": "string", "description": "Document title (used as filename)"},
                "content": {"type": "string", "description": "The document content to save"},
            },
            "required": ["project_id", "title", "content"],
        },
    },
    {
        "name": "search_everything",
        "description": "Search across all project entities: ideas, tasks, canvas components, and business rules. Use when user asks 'find everything about X' or wants to search the project broadly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["project_id", "query"],
        },
    },
    {
        "name": "get_activity",
        "description": "Get recent project activity — who did what and when. Use to answer 'what happened recently' or 'what has the team been working on'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_compliance_status",
        "description": "Get compliance readiness overview: overall score, counts by status, and any failing checks. Use to answer compliance/launch readiness questions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_business_rules",
        "description": "Fetch active business rules for the project — architectural constraints, coding standards, and compliance requirements.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "scope": {"type": "string", "description": "Filter by scope: architecture, compliance, security, financial, operational, coding"},
            },
            "required": ["project_id"],
        },
    },
]




# ── Persona-based tool filtering ─────────────────────────────────────────

PERSONA_TOOLS: dict[str, list[str] | None] = {
    "developer": None,  # all tools
    "creator": [
        "get_project_summary", "list_canvases", "get_canvas_components",
        "get_ideas", "search_ideas", "create_idea", "update_idea_status",
        "add_canvas_component", "get_knowledge_context", "push_to_recall",
        "create_task", "list_tasks", "create_document",
        "search_everything", "get_activity", "get_business_rules",
    ],
    "finance": [
        "get_project_summary", "get_ideas", "get_compliance_status",
        "get_business_rules", "get_knowledge_context", "push_to_recall",
        "create_task", "list_tasks", "search_everything", "get_activity",
        "update_compliance_check",
    ],
    "operations": [
        "get_project_summary", "get_deploy_config", "get_compliance_status",
        "get_business_rules", "get_knowledge_context", "push_to_recall",
        "create_task", "list_tasks", "search_everything", "get_activity",
        "update_compliance_check",
    ],
}


def _get_tools_for_persona(persona: str | None) -> list[dict]:
    # Return filtered TOOLS list based on user persona. Developer gets all.
    if not persona or persona == "developer":
        return TOOLS
    allowed = PERSONA_TOOLS.get(persona)
    if allowed is None:
        return TOOLS
    return [t for t in TOOLS if t["name"] in allowed]

# ── Tool execution ───────────────────────────────────────────────────────


def _safe_json(val) -> dict | list | None:
    if not val:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return None


def _sid(val) -> str:
    """Stringify a UUID or string for JSON output."""
    return str(val) if val is not None else ""


async def _tool_get_project_summary(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.members))
        .where(Project.id == uuid.UUID(project_id))
    )
    project = result.scalar_one_or_none()
    if not project:
        return json.dumps({"error": "Project not found"})

    canvas_count = (
        await db.execute(
            select(func.count())
            .select_from(Canvas)
            .where(Canvas.project_id == project.id)
        )
    ).scalar() or 0

    idea_count = (
        await db.execute(
            select(func.count()).select_from(Idea).where(Idea.project_id == project.id)
        )
    ).scalar() or 0

    return json.dumps(
        {
            "id": _sid(project.id),
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
            "member_count": len(project.members),
            "canvas_count": canvas_count,
            "idea_count": idea_count,
            "created_at": project.created_at.isoformat()
            if project.created_at
            else None,
        }
    )


async def _tool_get_canvas_components(
    project_id: str, canvas_id: str, db: AsyncSession
) -> str:
    result = await db.execute(
        select(CanvasComponent).where(
            CanvasComponent.canvas_id == uuid.UUID(canvas_id),
        )
    )
    components = result.scalars().all()
    return json.dumps(
        [
            {
                "id": _sid(c.id),
                "shape_id": c.shape_id,
                "name": c.name,
                "component_type": c.component_type,
                "tech_stack": c.tech_stack,
                "description": c.description,
                "metadata": _safe_json(c.metadata_json),
            }
            for c in components
        ]
    )


async def _tool_list_canvases(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Canvas).where(Canvas.project_id == uuid.UUID(project_id))
    )
    canvases = result.scalars().all()
    out = []
    for c in canvases:
        comp_count = (
            await db.execute(
                select(func.count())
                .select_from(CanvasComponent)
                .where(CanvasComponent.canvas_id == c.id)
            )
        ).scalar() or 0
        out.append(
            {
                "id": _sid(c.id),
                "name": c.name,
                "component_count": comp_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
    return json.dumps(out)


async def _tool_get_ideas(
    project_id: str, db: AsyncSession, status: str | None = None
) -> str:
    q = select(Idea).where(Idea.project_id == uuid.UUID(project_id))
    if status:
        q = q.where(Idea.status == status)
    q = q.order_by(Idea.created_at.desc())
    result = await db.execute(q)
    ideas = result.scalars().all()
    return json.dumps(
        [
            {
                "id": _sid(i.id),
                "title": i.title,
                "description": i.description,
                "status": i.status.value if hasattr(i.status, "value") else i.status,
                "category": i.category,
                "feasibility_score": i.feasibility_score,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in ideas
        ]
    )


async def _tool_search_ideas(project_id: str, query: str, db: AsyncSession) -> str:
    pattern = f"%{query}%"
    result = await db.execute(
        select(Idea)
        .where(Idea.project_id == uuid.UUID(project_id))
        .where((Idea.title.ilike(pattern)) | (Idea.description.ilike(pattern)))
        .order_by(Idea.created_at.desc())
        .limit(20)
    )
    ideas = result.scalars().all()
    return json.dumps(
        [
            {
                "id": _sid(i.id),
                "title": i.title,
                "description": i.description[:200] if i.description else "",
                "status": i.status.value if hasattr(i.status, "value") else i.status,
                "category": i.category,
            }
            for i in ideas
        ]
    )


async def _tool_get_scaffold_job(project_id: str, job_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(ScaffoldJob).where(
            ScaffoldJob.id == uuid.UUID(job_id),
            ScaffoldJob.project_id == uuid.UUID(project_id),
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        return json.dumps({"error": "Scaffold job not found"})
    return json.dumps(
        {
            "id": _sid(job.id),
            "status": job.status.value if hasattr(job.status, "value") else job.status,
            "component_ids": _safe_json(job.component_ids),
            "spec": _safe_json(job.spec_json),
            "generated_files": _safe_json(job.generated_files),
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    )


async def _tool_get_deploy_config(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Environment).where(Environment.project_id == uuid.UUID(project_id))
    )
    envs = result.scalars().all()
    return json.dumps(
        [
            {
                "id": _sid(e.id),
                "name": e.name,
                "config": _safe_json(e.config_json),
                "compose_yaml": e.compose_yaml,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in envs
        ]
    )


async def _tool_get_knowledge_context(project_slug: str, query: str) -> str:
    try:
        context = await get_recall_context(query=query, max_tokens=2000)
        return (
            context
            if context
            else json.dumps({"result": "No knowledge found for this query."})
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


async def _tool_push_to_recall(
    project_id: uuid.UUID,
    project_slug: str,
    items: list[dict],
    db: AsyncSession,
) -> str:
    stored = []
    for item in items:
        content = item.get("content", "")
        entity_type = item.get("entity_type", "concept")
        if not content:
            continue

        # Create local entity
        entity = KnowledgeEntity(
            project_id=project_id,
            name=content[:300],
            entity_type=entity_type,
            description=content,
            source_type="conversation",
        )
        db.add(entity)

        # Push to Recall
        try:
            await store_knowledge(
                project_slug=project_slug,
                name=content[:100],
                entity_type=entity_type,
                description=content,
                metadata={"source": "conversation"},
            )
            stored.append({"content": content[:100], "status": "stored"})
        except Exception as e:
            logger.warning("push_to_recall.failed", error=str(e))
            stored.append(
                {"content": content[:100], "status": "local_only", "error": str(e)}
            )

    await db.flush()
    return json.dumps({"stored": stored, "count": len(stored)})


async def _tool_create_idea(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    description: str,
    category: str | None,
    db: AsyncSession,
) -> str:
    from app.services.embedding import get_embedding

    emb = None
    try:
        emb = await get_embedding(f"{title}\n{description}")
    except Exception as e:
        logger.warning("create_idea.embed_failed", error=str(e))

    idea = Idea(
        project_id=project_id,
        title=title,
        description=description,
        category=category,
        embedding=emb,
        created_by=user_id,
    )
    db.add(idea)
    await db.flush()

    return json.dumps(
        {
            "status": "created",
            "idea_id": _sid(idea.id),
            "title": idea.title,
            "description": idea.description[:200],
            "category": idea.category,
        }
    )


async def _execute_tool(
    name: str,
    tool_input: dict,
    project_id: uuid.UUID,
    project_slug: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """Dispatch a tool call to the appropriate Python function."""
    pid = tool_input.get("project_id", str(project_id))
    try:
        match name:
            case "get_project_summary":
                return await _tool_get_project_summary(pid, db)
            case "get_canvas_components":
                return await _tool_get_canvas_components(
                    pid, tool_input["canvas_id"], db
                )
            case "list_canvases":
                return await _tool_list_canvases(pid, db)
            case "get_ideas":
                return await _tool_get_ideas(pid, db, status=tool_input.get("status"))
            case "search_ideas":
                return await _tool_search_ideas(pid, tool_input["query"], db)
            case "get_scaffold_job":
                return await _tool_get_scaffold_job(pid, tool_input["job_id"], db)
            case "get_deploy_config":
                return await _tool_get_deploy_config(pid, db)
            case "get_knowledge_context":
                return await _tool_get_knowledge_context(
                    tool_input.get("project_slug", project_slug),
                    tool_input["query"],
                )
            case "create_idea":
                return await _tool_create_idea(
                    project_id,
                    user_id,
                    tool_input["title"],
                    tool_input["description"],
                    tool_input.get("category"),
                    db,
                )
            case "push_to_recall":
                return await _tool_push_to_recall(
                    project_id,
                    project_slug,
                    tool_input.get("items", []),
                    db,
                )
            case "add_canvas_component":
                return await _tool_add_canvas_component(
                    str(project_id), tool_input["canvas_id"], tool_input["name"],
                    tool_input.get("component_type", "service"),
                    tool_input.get("tech_stack"), tool_input.get("description"), db,
                )
            case "update_idea_status":
                return await _tool_update_idea_status(
                    str(project_id), tool_input["idea_id"], tool_input["status"], db,
                )
            case "update_compliance_check":
                return await _tool_update_compliance_check(
                    tool_input["check_id"], tool_input["status"],
                    tool_input.get("notes"), db,
                )
            case "create_task":
                return await _tool_create_task(
                    str(project_id), tool_input["title"],
                    tool_input.get("description"), tool_input.get("priority", "medium"),
                    tool_input.get("due_date"), db,
                )
            case "list_tasks":
                return await _tool_list_tasks(
                    str(project_id), tool_input.get("status"), tool_input.get("priority"), db,
                )
            case "create_document":
                return await _tool_create_document(
                    str(project_id), tool_input["title"], tool_input["content"], db,
                )
            case "search_everything":
                return await _tool_search_everything(
                    str(project_id), tool_input["query"], db,
                )
            case "get_activity":
                return await _tool_get_activity(
                    str(project_id), int(tool_input.get("limit", 20)), db,
                )
            case "get_compliance_status":
                return await _tool_get_compliance_status(str(project_id), db)
            case "get_business_rules":
                return await _tool_get_business_rules(
                    str(project_id), tool_input.get("scope"), db,
                )
            case _:
                return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        logger.error("tool.execution_error", tool=name, error=str(e))
        return json.dumps({"error": f"Tool execution failed: {str(e)}"})



# ── Phase-4 tool implementations ─────────────────────────────────────────


async def _tool_add_canvas_component(
    project_id: str, canvas_id: str, name: str,
    component_type: str, tech_stack, description, db: AsyncSession
) -> str:
    rc = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id, Canvas.project_id == project_id)
    )
    canvas = rc.scalar_one_or_none()
    if not canvas:
        return json.dumps({"error": "Canvas not found."})
    component = CanvasComponent(
        canvas_id=canvas_id,
        name=name,
        component_type=component_type,
        tech_stack=tech_stack,
        description=description,
        position_x=0,
        position_y=0,
    )
    db.add(component)
    await db.commit()
    return json.dumps({"ok": True, "message": f"Added component '{name}' ({component_type}) to canvas."})


async def _tool_update_idea_status(
    project_id: str, idea_id: str, status: str, db: AsyncSession
) -> str:
    result = await db.execute(
        select(Idea).where(Idea.id == idea_id, Idea.project_id == project_id)
    )
    idea = result.scalar_one_or_none()
    if not idea:
        return json.dumps({"error": "Idea not found."})
    idea.status = IdeaStatus(status)
    await db.commit()
    return json.dumps({"ok": True, "message": f"Idea '{idea.title}' status updated to {status}."})


async def _tool_update_compliance_check(
    check_id: str, status: str, notes, db: AsyncSession
) -> str:
    result = await db.execute(select(ComplianceCheck).where(ComplianceCheck.id == check_id))
    check = result.scalar_one_or_none()
    if not check:
        return json.dumps({"error": "Compliance check not found."})
    check.status = CheckStatus(status)
    if notes:
        check.notes = notes
    await db.commit()
    return json.dumps({"ok": True, "message": f"Check '{check.title}' marked as {status}."})


async def _tool_create_task(
    project_id: str, title: str, description, priority: str, due_date, db: AsyncSession
) -> str:
    import datetime as _dt
    due = None
    if due_date:
        try:
            due = _dt.date.fromisoformat(due_date)
        except ValueError:
            pass
    task = Task(
        project_id=project_id,
        title=title,
        description=description,
        priority=TaskPriority(priority) if priority else TaskPriority.medium,
        due_date=due,
    )
    db.add(task)
    await db.commit()
    return json.dumps({"ok": True, "message": f"Task created: '{title}' (priority: {priority or 'medium'})."})


async def _tool_list_tasks(
    project_id: str, status_filter, priority_filter, db: AsyncSession
) -> str:
    from sqlalchemy import and_
    conditions = [Task.project_id == project_id]
    if status_filter:
        conditions.append(Task.status == status_filter)
    if priority_filter:
        conditions.append(Task.priority == TaskPriority(priority_filter))
    result = await db.execute(select(Task).where(and_(*conditions)).limit(20))
    tasks = result.scalars().all()
    if not tasks:
        return json.dumps({"tasks": [], "message": "No tasks found."})
    items = [{"title": t.title, "status": t.status, "priority": t.priority} for t in tasks]
    return json.dumps({"tasks": items})


async def _tool_create_document(
    project_id: str, title: str, content_text: str, db: AsyncSession
) -> str:
    doc = ProjectFile(
        project_id=project_id,
        filename=title if title.endswith(".md") else title + ".md",
        mime_type="text/markdown",
        size_bytes=len(content_text.encode()),
    )
    db.add(doc)
    await db.commit()
    return json.dumps({"ok": True, "message": f"Document '{title}' saved."})


async def _tool_search_everything(project_id: str, query: str, db: AsyncSession) -> str:
    q = query.lower()
    results = []
    r = await db.execute(select(Idea).where(Idea.project_id == project_id))
    for idea in r.scalars().all():
        if q in (idea.title or "").lower() or q in (idea.description or "").lower():
            results.append({"type": "idea", "id": str(idea.id), "title": idea.title, "subtitle": str(idea.status), "status": str(idea.status)})
    r = await db.execute(select(Task).where(Task.project_id == project_id))
    for task in r.scalars().all():
        if q in (task.title or "").lower() or q in (task.description or "").lower():
            results.append({"type": "task", "id": str(task.id), "title": task.title, "subtitle": str(task.status), "status": str(task.status)})
    r = await db.execute(select(Canvas).where(Canvas.project_id == project_id))
    for canvas in r.scalars().all():
        rc = await db.execute(select(CanvasComponent).where(CanvasComponent.canvas_id == canvas.id))
        for comp in rc.scalars().all():
            if q in (comp.name or "").lower() or q in (comp.description or "").lower():
                results.append({"type": "component", "id": str(comp.id), "title": comp.name, "subtitle": comp.component_type, "component_type": comp.component_type})
    r = await db.execute(
        select(BusinessRule).where(BusinessRule.project_id == project_id, BusinessRule.is_active == True)
    )
    for rule in r.scalars().all():
        if q in (rule.name or "").lower() or q in (rule.description or "").lower():
            results.append({"type": "rule", "id": str(rule.id), "title": rule.name, "subtitle": rule.scope, "scope": rule.scope})
    r = await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id))
    for doc in r.scalars().all():
        if q in (doc.original_filename or "").lower() or q in (doc.source or "").lower():
            results.append({"type": "document", "id": str(doc.id), "title": doc.original_filename or doc.source or "File", "subtitle": doc.source or "document"})
    return json.dumps({"results": results[:20], "count": len(results)})


async def _tool_get_activity(project_id: str, limit: int, db: AsyncSession) -> str:
    result = await db.execute(
        select(Activity).where(Activity.project_id == project_id)
        .order_by(Activity.created_at.desc()).limit(limit)
    )
    activities = result.scalars().all()
    items = [
        {"action": a.action, "description": a.description, "created_at": str(a.created_at)}
        for a in activities
    ]
    return json.dumps({"activity": items})


async def _tool_get_compliance_status(project_id: str, db: AsyncSession) -> str:
    r = await db.execute(
        select(ComplianceChecklist).where(ComplianceChecklist.project_id == project_id)
    )
    checklists = r.scalars().all()
    if not checklists:
        return json.dumps({"message": "No compliance checklists found."})
    total = passed = failed = pending = 0
    failing_checks = []
    for cl in checklists:
        rc = await db.execute(select(ComplianceCheck).where(ComplianceCheck.checklist_id == cl.id))
        for c in rc.scalars().all():
            total += 1
            if c.status == CheckStatus.passed:
                passed += 1
            elif c.status == CheckStatus.failed:
                failed += 1
                failing_checks.append({"title": c.title, "checklist": cl.title})
            else:
                pending += 1
    score = round((passed / total * 100) if total else 0)
    return json.dumps({
        "score": score,
        "total": total,
        "passed": passed,
        "failed": failed,
        "pending": pending,
        "failing_checks": failing_checks,
    })


async def _tool_get_business_rules(project_id: str, scope, db: AsyncSession) -> str:
    from sqlalchemy import and_
    conditions = [BusinessRule.project_id == project_id, BusinessRule.is_active == True]
    if scope:
        conditions.append(BusinessRule.scope == scope)
    result = await db.execute(select(BusinessRule).where(and_(*conditions)))
    rules = result.scalars().all()
    items = [
        {"name": r.name, "description": r.description, "scope": r.scope, "enforcement": r.enforcement}
        for r in rules
    ]
    return json.dumps({"rules": items})



# ── System prompt ────────────────────────────────────────────────────────


async def _build_system_prompt(
    project_name: str,
    project_slug: str,
    project_id: uuid.UUID,
    db: AsyncSession | None = None,
    page: str | None = None,
    persona: str | None = None,
) -> str:
    pid = str(project_id)
    base = f"""You are the AI assistant for **Codevv**, a collaborative software design and build platform.
Current project: **{project_name}** (slug: `{project_slug}`, id: `{pid}`)
Recall domain: `codevv:{project_slug}`
When tools require project_id use `{pid}`. When tools require project_slug use `{project_slug}`.

## Your Capabilities
You have 10 built-in tools to query and create project data:
- **get_project_summary** — project stats (members, canvases, ideas)
- **list_canvases** / **get_canvas_components** — browse architecture canvases and their components
- **get_ideas** / **search_ideas** — browse and search design ideas
- **create_idea** — capture decisions or proposals as Ideas
- **get_scaffold_job** — check AI code generation job status
- **get_deploy_config** — get deployment environments and Docker Compose config
- **get_knowledge_context** — semantic search the project's knowledge graph via Recall
- **push_to_recall** — store decisions, concepts, and architecture knowledge to Recall memory
- **list_conversations** — browse past AI conversations in this project

## Codevv App Reference
The user is inside Codevv right now. Here's what each section does so you can guide them:

### Core Features
- **Overview** (`/projects/:id`) — Project dashboard with stats, recent activity, quick actions.
- **Canvas** (`/projects/:id/canvas`) — Visual architecture editor. Users drag components (services, databases, APIs, frontends) onto a canvas and connect them. Each component has a name, type, tech stack, and description. Use `list_canvases` and `get_canvas_components` to inspect architecture.
- **Ideas** (`/projects/:id/ideas`) — Proposal tracker. Ideas have a title, description, category (feature/improvement/research), and status (draft → proposed → approved → rejected → implemented). Users can vote and comment. Use `get_ideas`, `search_ideas`, `create_idea`.
- **Knowledge Graph** (`/projects/:id/knowledge`) — Visual node graph of project entities (technologies, decisions, requirements, concepts) and their relationships. Backed by Recall memory. Use `get_knowledge_context` to search it.
- **Documents** (`/projects/:id/documents`) — Upload .docx or text files. Content is stored in Recall for semantic search.

### Build Features
- **Scaffold** (`/projects/:id/scaffold`) — AI code generation. Users describe what they want, the system generates code files. Use `get_scaffold_job` to check status.
- **Rules** (`/projects/:id/rules`) — Pinned project rules and decisions from Recall. These are the project's "constitution" — architectural decisions, coding standards, constraints.
- **Dependencies** (`/projects/:id/dependencies`) — Auto-generated dependency graph from canvas components. Shows which components depend on which, detects circular dependencies, and provides impact analysis.
- **Pipeline** (`/projects/:id/pipeline`) — Agent pipeline for automated runs (planner, builder, reviewer agents). Shows run history and findings.

### Platform Features
- **Solana** (`/projects/:id/solana`) — Blockchain watchlist. Users add Solana wallet addresses and monitor balances and transactions.
- **Deploy** (`/projects/:id/deploy`) — Deployment environments. Generate Docker Compose configs from canvas architecture. Track deployment jobs with live log streaming.
- **Rooms** (`/projects/:id/rooms`) — LiveKit video rooms for real-time collaboration.

### Operations
- **Audit** (`/projects/:id/audit`) — Generate audit reports analyzing project health across architecture, code generation, deployment, ideas, and knowledge.
- **Compliance** (`/projects/:id/compliance`) — Launch readiness checklists. Track compliance checks (passed/failed/pending) with overall readiness scoring.
- **Settings** (`/projects/:id/settings`) — Project configuration, member management.

## How to Help
- When the user asks about architecture → use `list_canvases` + `get_canvas_components` to see what's built, and `get_knowledge_context` for past decisions.
- When a decision or insight emerges → offer to save it with `push_to_recall` or `create_idea`.
- When the user asks "what should I work on next?" → check ideas (get_ideas with status=approved), audit reports, and compliance readiness.
- When the user asks about deployment → use `get_deploy_config` for current environments.
- Reference specific app pages by name so the user knows where to go (e.g. "You can track this on the **Dependencies** page").

Be concise, use markdown, and be proactive about using your tools to give informed answers rather than generic advice."""

    # Enrich with Recall context
    try:
        context = await get_recall_context(
            query=f"project {project_name} architecture decisions",
            max_tokens=1500,
        )
        if context:
            base += f"\n\n## Project Knowledge (from Recall):\n{context}"
    except Exception:
        pass  # Recall down — proceed without context


    # Page context hints
    if page:
        page_hints = {
            "canvas": "The user is viewing the Architecture Canvas. Prefer canvas/component tools.",
            "ideas": "The user is on the Ideas page. Prefer idea management tools.",
            "tasks": "The user is on the Tasks page. Prefer task creation and list tools.",
            "compliance": "The user is on Compliance. Prefer compliance check tools.",
            "rules": "The user is viewing Business Rules.",
            "documents": "The user is on the Documents page.",
            "chat": "The user is in the full-page AI chat.",
        }
        for key, hint in page_hints.items():
            if key in page.lower():
                base += f"\n\n**Page context:** {hint}"
                break

    # Inject active business rules
    if db is not None:
        try:
            r = await db.execute(
                select(BusinessRule).where(
                    BusinessRule.project_id == project_id,
                    BusinessRule.is_active == True,
                ).limit(15)
            )
            rules = r.scalars().all()
            if rules:
                rule_lines = "\n".join(
                    f"  - [{ru.scope}] {ru.name}: {ru.description}" for ru in rules
                )
                base += f"\n\n**Active project rules (always respect these):**\n{rule_lines}"
        except Exception:
            pass

    # Persona tone
    if persona and persona != "developer":
        tone_map = {
            "creator": "Speak plainly and visually. Focus on product, ideas, and design.",
            "finance": "Be concise and precise. Focus on compliance, costs, and risk.",
            "operations": "Be direct. Focus on deployment, infrastructure, and processes.",
        }
        hint = tone_map.get(persona)
        if hint:
            base += f"\n\n**User persona:** {persona}. {hint}"

    return base


# ── Conversation persistence helpers ─────────────────────────────────────


def _extract_text(content: list[dict] | str) -> str:
    if isinstance(content, str):
        return content
    parts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(block["text"])
    return "\n".join(parts)


def _extract_tool_uses(content: list[dict] | str) -> str | None:
    if isinstance(content, str):
        return None
    tools = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            tools.append({"name": block["name"], "input": block.get("input", {})})
    return json.dumps(tools) if tools else None


async def _load_conversation_messages(conv: Conversation) -> list[dict]:
    messages: list[dict] = []
    for msg in conv.messages:
        if msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        elif msg.role == "assistant":
            content: list[dict] = [{"type": "text", "text": msg.content}]
            if msg.tool_uses_json:
                try:
                    tool_uses = json.loads(msg.tool_uses_json)
                    for tu in tool_uses:
                        content.append(
                            {
                                "type": "tool_use",
                                "id": f"stored_{uuid.uuid4().hex[:12]}",
                                "name": tu["name"],
                                "input": tu.get("input", {}),
                            }
                        )
                except (json.JSONDecodeError, KeyError):
                    pass
            messages.append({"role": "assistant", "content": content})
    return messages


# ── Main service ─────────────────────────────────────────────────────────


class ClaudeService:
    """Manages conversations and Anthropic API calls with PostgreSQL persistence."""

    def __init__(self):
        self._cache: dict[str, dict] = {}

    def _key(self, user_id: uuid.UUID, project_id: uuid.UUID) -> str:
        return f"{user_id}:{project_id}"

    def get_history(self, user_id: uuid.UUID, project_id: uuid.UUID) -> list[dict]:
        entry = self._cache.get(self._key(user_id, project_id))
        return entry["messages"] if entry else []

    def get_conversation_id(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> uuid.UUID | None:
        entry = self._cache.get(self._key(user_id, project_id))
        return entry["conversation_id"] if entry else None

    async def clear_history(self, user_id: uuid.UUID, project_id: uuid.UUID) -> None:
        self._cache.pop(self._key(user_id, project_id), None)

    async def load_conversation(
        self,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        db: AsyncSession,
    ) -> bool:
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
                Conversation.project_id == project_id,
            )
            .options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False

        messages = await _load_conversation_messages(conv)
        key = self._key(user_id, project_id)
        self._cache[key] = {
            "conversation_id": conv.id,
            "messages": messages,
        }
        return True

    async def _ensure_conversation(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        first_message: str,
        model: str,
        db: AsyncSession,
    ) -> tuple[uuid.UUID, list[dict]]:
        key = self._key(user_id, project_id)
        entry = self._cache.get(key)

        if entry:
            return entry["conversation_id"], entry["messages"]

        # Try loading the most recent conversation from DB
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.project_id == project_id,
            )
            .order_by(Conversation.updated_at.desc())
            .limit(1)
            .options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()

        if conv:
            messages = await _load_conversation_messages(conv)
            self._cache[key] = {"conversation_id": conv.id, "messages": messages}
            return conv.id, messages

        # Create a new conversation
        title = first_message[:100].strip() or "New conversation"
        conv = Conversation(
            project_id=project_id,
            user_id=user_id,
            title=title,
            model=model,
            message_count=0,
        )
        db.add(conv)
        await db.flush()

        messages: list[dict] = []
        self._cache[key] = {"conversation_id": conv.id, "messages": messages}
        return conv.id, messages

    async def _persist_message(
        self,
        conversation_id: uuid.UUID,
        role: str,
        content: list[dict] | str,
        db: AsyncSession,
    ) -> None:
        text = _extract_text(content) if isinstance(content, list) else content
        tool_uses = _extract_tool_uses(content) if isinstance(content, list) else None

        msg = ConversationMessage(
            conversation_id=conversation_id,
            role=role,
            content=text,
            tool_uses_json=tool_uses,
        )
        db.add(msg)

        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count = (conv.message_count or 0) + 1
        await db.flush()

    async def start_new_conversation(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        db: AsyncSession,
    ) -> uuid.UUID:
        key = self._key(user_id, project_id)
        self._cache.pop(key, None)

        conv = Conversation(
            project_id=project_id,
            user_id=user_id,
            title="New conversation",
            message_count=0,
        )
        db.add(conv)
        await db.flush()

        self._cache[key] = {"conversation_id": conv.id, "messages": []}
        return conv.id


    async def _handle_add_canvas_component(self, inp: dict, project_id, db):
        from sqlalchemy import select
        rc = await db.execute(select(Canvas).where(Canvas.id == inp["canvas_id"], Canvas.project_id == project_id))
        canvas = rc.scalar_one_or_none()
        if not canvas:
            return "Canvas not found."
        component = CanvasComponent(
            canvas_id=inp["canvas_id"],
            name=inp["name"],
            component_type=inp.get("component_type", "service"),
            tech_stack=inp.get("tech_stack"),
            description=inp.get("description"),
            position_x=0,
            position_y=0,
        )
        db.add(component)
        await db.commit()
        return f"Added component '{inp['name']}' ({inp.get('component_type', 'service')}) to canvas."

    async def _handle_update_idea_status(self, inp: dict, project_id, db):
        from sqlalchemy import select
        result = await db.execute(select(Idea).where(Idea.id == inp["idea_id"], Idea.project_id == project_id))
        idea = result.scalar_one_or_none()
        if not idea:
            return "Idea not found."
        idea.status = IdeaStatus(inp["status"])
        await db.commit()
        return f"Idea '{idea.title}' status updated to {inp['status']}."

    async def _handle_update_compliance_check(self, inp: dict, project_id, db):
        from sqlalchemy import select
        result = await db.execute(select(ComplianceCheck).where(ComplianceCheck.id == inp["check_id"]))
        check = result.scalar_one_or_none()
        if not check:
            return "Compliance check not found."
        check.status = CheckStatus(inp["status"])
        if inp.get("notes"):
            check.notes = inp["notes"]
        await db.commit()
        return f"Compliance check '{check.title}' marked as {inp['status']}."

    async def _handle_create_task(self, inp: dict, project_id, db):
        import datetime as _dt
        due = None
        if inp.get("due_date"):
            try:
                due = _dt.date.fromisoformat(inp["due_date"])
            except ValueError:
                pass
        task = Task(
            project_id=project_id,
            title=inp["title"],
            description=inp.get("description"),
            priority=TaskPriority(inp.get("priority", "medium")),
            due_date=due,
        )
        db.add(task)
        await db.commit()
        return f"Task created: '{inp['title']}' (priority: {inp.get('priority', 'medium')})."

    async def _handle_list_tasks(self, inp: dict, project_id, db):
        from sqlalchemy import select, and_
        conditions = [Task.project_id == project_id]
        if inp.get("status"):
            conditions.append(Task.status == inp["status"])
        if inp.get("priority"):
            conditions.append(Task.priority == TaskPriority(inp["priority"]))
        result = await db.execute(select(Task).where(and_(*conditions)).limit(20))
        tasks = result.scalars().all()
        if not tasks:
            return "No tasks found matching the criteria."
        lines = [f"- [{t.status}] {t.title} (priority: {t.priority})" for t in tasks]
        return "Tasks:\n" + "\n".join(lines)

    async def _handle_create_document(self, inp: dict, project_id, db):
        doc = ProjectFile(
            project_id=project_id,
            filename=inp["title"],
            mime_type="text/markdown",
            size_bytes=len(inp["content"].encode()),
        )
        db.add(doc)
        await db.commit()
        return f"Document '{inp['title']}' saved to the project knowledge base."

    async def _handle_search_everything(self, inp: dict, project_id, db):
        from sqlalchemy import select
        q = inp["query"].lower()
        results = []
        r = await db.execute(select(Idea).where(Idea.project_id == project_id))
        for idea in r.scalars().all():
            if q in (idea.title or "").lower() or q in (idea.description or "").lower():
                results.append(f"[Idea] {idea.title} ({idea.status})")
        r = await db.execute(select(Task).where(Task.project_id == project_id))
        for task in r.scalars().all():
            if q in (task.title or "").lower() or q in (task.description or "").lower():
                results.append(f"[Task] {task.title} ({task.status})")
        r = await db.execute(select(Canvas).where(Canvas.project_id == project_id))
        for canvas in r.scalars().all():
            rc = await db.execute(select(CanvasComponent).where(CanvasComponent.canvas_id == canvas.id))
            for comp in rc.scalars().all():
                if q in (comp.name or "").lower() or q in (comp.description or "").lower():
                    results.append(f"[Component] {comp.name} ({comp.component_type})")
        r = await db.execute(
            select(BusinessRule).where(BusinessRule.project_id == project_id, BusinessRule.is_active == True)
        )
        for rule in r.scalars().all():
            if q in (rule.name or "").lower() or q in (rule.description or "").lower():
                results.append(f"[Rule] {rule.name} ({rule.scope})")
        if not results:
            return f"No results found for '{inp['query']}'."
        lines_out = results[:20]
        return f"Search results for '{inp['query']}':"+chr(10)+"\n".join(lines_out)

    async def _handle_get_activity(self, inp: dict, project_id, db):
        from sqlalchemy import select
        limit = int(inp.get("limit", 20))
        result = await db.execute(
            select(Activity).where(Activity.project_id == project_id)
            .order_by(Activity.created_at.desc()).limit(limit)
        )
        activities = result.scalars().all()
        if not activities:
            return "No recent activity found."
        lines = [f"- {a.created_at.strftime('%Y-%m-%d %H:%M')} | {a.action}: {a.description}" for a in activities]
        return "Recent activity:\n" + "\n".join(lines)

    async def _handle_get_compliance_status(self, inp: dict, project_id, db):
        from sqlalchemy import select
        r = await db.execute(
            select(ComplianceChecklist).where(ComplianceChecklist.project_id == project_id)
        )
        checklists = r.scalars().all()
        if not checklists:
            return "No compliance checklists found for this project."
        total = passed = failed = pending = 0
        failing = []
        for cl in checklists:
            rc = await db.execute(select(ComplianceCheck).where(ComplianceCheck.checklist_id == cl.id))
            for c in rc.scalars().all():
                total += 1
                if c.status == CheckStatus.passed:
                    passed += 1
                elif c.status == CheckStatus.failed:
                    failed += 1
                    failing.append(f"  - {c.title} [{cl.title}]")
                else:
                    pending += 1
        score = round((passed / total * 100) if total else 0)
        summary = f"Compliance: {score}% ready ({passed}/{total} passed, {failed} failed, {pending} pending)."
        if failing:
            summary += "\nFailing checks:\n" + "\n".join(failing)
        return summary

    async def _handle_get_business_rules(self, inp: dict, project_id, db):
        from sqlalchemy import select, and_
        conditions = [BusinessRule.project_id == project_id, BusinessRule.is_active == True]
        if inp.get("scope"):
            conditions.append(BusinessRule.scope == inp["scope"])
        result = await db.execute(select(BusinessRule).where(and_(*conditions)))
        rules = result.scalars().all()
        if not rules:
            return "No active business rules found."
        lines = [f"- [{r.scope}] {r.name}: {r.description}" for r in rules]
        return "Active business rules:\n" + "\n".join(lines)

    async def chat(
        self,
        project_id: uuid.UUID,
        project_slug: str,
        project_name: str,
        user_id: uuid.UUID,
        message: str,
        model: str | None,
        db: AsyncSession,
        page: str | None = None,
        persona: str | None = None,
    ) -> AsyncIterator[dict]:
        """Stream a chat response. Yields SSE-ready dicts."""
        settings = get_settings()

        # Create client: prefer API key, fall back to OAuth token
        if settings.anthropic_api_key:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        else:
            access_token = await claude_auth.get_access_token(user_id, db)
            client = anthropic.AsyncAnthropic(
                auth_token=access_token,
                default_headers={
                    "anthropic-beta": claude_auth.get_beta_header(),
                },
            )

        chosen_model = model or settings.claude_model

        # Ensure we have a conversation
        conversation_id, messages = await self._ensure_conversation(
            user_id, project_id, message, chosen_model, db
        )

        # Build system prompt
        system_prompt = await _build_system_prompt(
            project_name, project_slug, project_id, db=db, page=page, persona=persona
        )

        # Append user message
        messages.append({"role": "user", "content": message})
        await self._persist_message(conversation_id, "user", message, db)

        max_turns = settings.claude_max_turns
        turn = 0

        try:
            while turn < max_turns:
                turn += 1

                async with client.messages.stream(
                    model=chosen_model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                    tools=_get_tools_for_persona(persona),
                ) as stream:
                    collected_content = []

                    async for event in stream:
                        if event.type == "content_block_start":
                            block = event.content_block
                            if block.type == "tool_use":
                                yield {
                                    "type": "tool_use_start",
                                    "name": block.name,
                                    "tool_use_id": block.id,
                                }

                        elif event.type == "content_block_delta":
                            delta = event.delta
                            if delta.type == "text_delta":
                                yield {"type": "text", "text": delta.text}

                    response = await stream.get_final_message()

                # Build content blocks for history
                for block in response.content:
                    if block.type == "text":
                        collected_content.append({"type": "text", "text": block.text})
                    elif block.type == "tool_use":
                        collected_content.append(
                            {
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        )

                # Persist assistant message
                messages.append({"role": "assistant", "content": collected_content})
                await self._persist_message(
                    conversation_id, "assistant", collected_content, db
                )

                if response.stop_reason == "end_turn":
                    break

                # Execute tools if needed
                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            yield {
                                "type": "tool_use",
                                "name": block.name,
                                "input": block.input,
                            }

                            logger.info(
                                "tool.executing",
                                tool=block.name,
                                input_keys=list(block.input.keys()),
                            )

                            result = await _execute_tool(
                                block.name,
                                block.input,
                                project_id,
                                project_slug,
                                user_id,
                                db,
                            )

                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": result,
                                }
                            )

                    messages.append({"role": "user", "content": tool_results})
                    continue

                break

            yield {
                "type": "done",
                "model": chosen_model,
                "conversation_id": str(conversation_id),
            }

        except anthropic.AuthenticationError as e:
            logger.error("claude.auth_error", error=str(e))
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {
                "type": "error",
                "message": "Authentication failed. Token may have expired -- try refreshing.",
            }

        except anthropic.RateLimitError as e:
            logger.warning("claude.rate_limit", error=str(e))
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {
                "type": "error",
                "message": "Rate limited. Please wait a moment and try again.",
            }

        except Exception as e:
            logger.error("claude.error", error=str(e), error_type=type(e).__name__)
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {"type": "error", "message": f"Claude API error: {str(e)}"}


_service: ClaudeService | None = None


def get_claude_service() -> ClaudeService:
    global _service
    if _service is None:
        _service = ClaudeService()
    return _service
