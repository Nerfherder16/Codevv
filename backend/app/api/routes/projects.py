from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember, ProjectRole
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectMemberAdd,
    ProjectResponse, ProjectDetailResponse, MemberResponse,
)
import uuid
import re

router = APIRouter(prefix="/projects", tags=["projects"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower().strip())
    return re.sub(r"[-\s]+", "-", slug)


async def get_project_with_access(
    project_id: uuid.UUID, user: User, db: AsyncSession, min_role: ProjectRole = ProjectRole.viewer
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.members))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role_priority = {ProjectRole.owner: 0, ProjectRole.editor: 1, ProjectRole.viewer: 2}
    member = next((m for m in project.members if m.user_id == user.id), None)
    if not member or role_priority.get(member.role, 99) > role_priority.get(min_role, 99):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return project


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug = slugify(req.name)
    # Ensure unique slug
    existing = await db.execute(select(Project).where(Project.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    project = Project(
        id=uuid.uuid4(),
        name=req.name,
        slug=slug,
        description=req.description,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()

    # Add creator as owner
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        role=ProjectRole.owner,
    )
    db.add(member)
    await db.flush()

    return ProjectResponse(
        id=project.id, name=project.name, slug=project.slug,
        description=project.description, archived=project.archived,
        created_by=project.created_by, created_at=project.created_at,
        updated_at=project.updated_at, member_count=1,
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id, Project.archived == False)
        .options(selectinload(Project.members))
    )
    projects = result.scalars().unique().all()
    return [
        ProjectResponse(
            id=p.id, name=p.name, slug=p.slug, description=p.description,
            archived=p.archived, created_by=p.created_by,
            created_at=p.created_at, updated_at=p.updated_at,
            member_count=len(p.members),
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db)
    members = []
    for m in project.members:
        u_result = await db.execute(select(User).where(User.id == m.user_id))
        u = u_result.scalar_one()
        members.append(MemberResponse(
            id=m.id, user_id=m.user_id, display_name=u.display_name,
            email=u.email, role=m.role, joined_at=m.joined_at,
        ))
    return ProjectDetailResponse(
        id=project.id, name=project.name, slug=project.slug,
        description=project.description, archived=project.archived,
        created_by=project.created_by, created_at=project.created_at,
        updated_at=project.updated_at, member_count=len(members),
        members=members,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    req: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    if req.name is not None:
        project.name = req.name
    if req.description is not None:
        project.description = req.description
    if req.archived is not None:
        project.archived = req.archived
    await db.flush()
    return ProjectResponse(
        id=project.id, name=project.name, slug=project.slug,
        description=project.description, archived=project.archived,
        created_by=project.created_by, created_at=project.created_at,
        updated_at=project.updated_at, member_count=len(project.members),
    )


@router.post("/{project_id}/members", response_model=MemberResponse, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    req: ProjectMemberAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db, min_role=ProjectRole.owner)

    target_result = await db.execute(select(User).where(User.email == req.email))
    target_user = target_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = next((m for m in project.members if m.user_id == target_user.id), None)
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")

    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=target_user.id,
        role=req.role,
    )
    db.add(member)
    await db.flush()
    return MemberResponse(
        id=member.id, user_id=target_user.id, display_name=target_user.display_name,
        email=target_user.email, role=member.role, joined_at=member.joined_at,
    )
