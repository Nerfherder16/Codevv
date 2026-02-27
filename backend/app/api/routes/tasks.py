"""Task routes — project-scoped and cross-project (my tasks)."""

import uuid
from typing import Optional
from datetime import datetime, timezone, date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.project import ProjectRole
from app.api.routes.projects import get_project_with_access
from app.services.activity import log_activity
from app.services.events import user_event

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])
my_tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


# ─── Schemas ─────────────────────────────────────────────────────────────────


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    assigned_to: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assigned_to: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None


class AssigneeInfo(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str

    model_config = {"from_attributes": True}


class TaskResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    created_by: uuid.UUID
    assigned_to: Optional[uuid.UUID]
    assignee: Optional[AssigneeInfo]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    linked_entity_type: Optional[str]
    linked_entity_id: Optional[str]
    source_type: Optional[str]
    source_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _build_response(task: Task, assignee: Optional[User]) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        created_by=task.created_by,
        assigned_to=task.assigned_to,
        assignee=AssigneeInfo(
            id=assignee.id,
            display_name=assignee.display_name,
            email=assignee.email,
        )
        if assignee
        else None,
        due_date=task.due_date,
        completed_at=task.completed_at,
        linked_entity_type=task.linked_entity_type,
        linked_entity_id=task.linked_entity_id,
        source_type=task.source_type,
        source_id=task.source_id,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


# ─── Project-scoped task routes ───────────────────────────────────────────────


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    project_id: uuid.UUID,
    req: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    task = Task(
        project_id=project_id,
        title=req.title,
        description=req.description,
        status=req.status,
        priority=req.priority,
        created_by=user.id,
        assigned_to=req.assigned_to,
        due_date=req.due_date,
        linked_entity_type=req.linked_entity_type,
        linked_entity_id=req.linked_entity_id,
        source_type=req.source_type,
        source_id=req.source_id,
    )
    db.add(task)
    await db.flush()

    # Load assignee
    assignee: Optional[User] = None
    if task.assigned_to:
        res = await db.execute(select(User).where(User.id == task.assigned_to))
        assignee = res.scalar_one_or_none()

    try:
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action="created",
            entity_type="task",
            entity_id=str(task.id),
            entity_name=task.title,
            db=db,
        )
        # Notify assignee
        if task.assigned_to and task.assigned_to != user.id:
            await user_event(
                task.assigned_to,
                "task.assigned",
                {
                    "task_id": str(task.id),
                    "title": task.title,
                    "project_id": str(project_id),
                },
                user.id,
            )
    except Exception:
        pass

    return _build_response(task, assignee)


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    project_id: uuid.UUID,
    status: Optional[TaskStatus] = Query(default=None),
    priority: Optional[TaskPriority] = Query(default=None),
    assigned_to: Optional[uuid.UUID] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    q = (
        select(Task, User)
        .outerjoin(User, Task.assigned_to == User.id)
        .where(Task.project_id == project_id)
    )
    if status:
        q = q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
    if assigned_to:
        q = q.where(Task.assigned_to == assigned_to)

    q = q.order_by(desc(Task.created_at)).offset(offset).limit(limit)
    rows = await db.execute(q)

    return [_build_response(task, assignee) for task, assignee in rows.all()]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    row = await db.execute(
        select(Task, User)
        .outerjoin(User, Task.assigned_to == User.id)
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    result = row.first()
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    task, assignee = result
    return _build_response(task, assignee)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    req: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    res = await db.execute(
        select(Task).where(Task.id == task_id, Task.project_id == project_id)
    )
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    prev_status = task.status
    prev_assignee = task.assigned_to

    if req.title is not None:
        task.title = req.title
    if req.description is not None:
        task.description = req.description
    if req.status is not None:
        task.status = req.status
        if req.status == TaskStatus.done and prev_status != TaskStatus.done:
            task.completed_at = datetime.now(timezone.utc)
        elif req.status != TaskStatus.done:
            task.completed_at = None
    if req.priority is not None:
        task.priority = req.priority
    if req.assigned_to is not None:
        task.assigned_to = req.assigned_to
    if req.due_date is not None:
        task.due_date = req.due_date
    if req.linked_entity_type is not None:
        task.linked_entity_type = req.linked_entity_type
    if req.linked_entity_id is not None:
        task.linked_entity_id = req.linked_entity_id

    await db.flush()

    # Load assignee
    assignee: Optional[User] = None
    if task.assigned_to:
        r = await db.execute(select(User).where(User.id == task.assigned_to))
        assignee = r.scalar_one_or_none()

    try:
        action = f"status_{task.status.value}" if req.status else "updated"
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action=action,
            entity_type="task",
            entity_id=str(task.id),
            entity_name=task.title,
            db=db,
        )
        # Notify new assignee
        if (
            req.assigned_to
            and req.assigned_to != prev_assignee
            and req.assigned_to != user.id
        ):
            await user_event(
                req.assigned_to,
                "task.assigned",
                {
                    "task_id": str(task.id),
                    "title": task.title,
                    "project_id": str(project_id),
                },
                user.id,
            )
        # Notify creator on completion (if someone else completed it)
        if req.status == TaskStatus.done and user.id != task.created_by:
            await user_event(
                task.created_by,
                "task.completed",
                {
                    "task_id": str(task.id),
                    "title": task.title,
                    "project_id": str(project_id),
                },
                user.id,
            )
    except Exception:
        pass

    return _build_response(task, assignee)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    res = await db.execute(
        select(Task).where(Task.id == task_id, Task.project_id == project_id)
    )
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)


# ─── Cross-project "my tasks" ─────────────────────────────────────────────────


@my_tasks_router.get("/me", response_model=list[TaskResponse])
async def my_tasks(
    status: Optional[TaskStatus] = Query(default=None),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All tasks assigned to the current user across all projects."""
    q = (
        select(Task, User)
        .outerjoin(User, Task.assigned_to == User.id)
        .where(Task.assigned_to == user.id)
    )
    if status:
        q = q.where(Task.status == status)
    q = q.order_by(desc(Task.created_at)).limit(limit)
    rows = await db.execute(q)
    return [_build_response(task, assignee) for task, assignee in rows.all()]
