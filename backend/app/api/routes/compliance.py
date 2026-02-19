from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.compliance import (
    ComplianceChecklist,
    ComplianceCheck,
    CheckStatus,
    CheckCategory,
)
from app.schemas.compliance import (
    ChecklistCreate,
    ChecklistResponse,
    ChecklistDetailResponse,
    CheckCreate,
    CheckUpdate,
    CheckResponse,
    LaunchReadinessResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/compliance", tags=["compliance"])


def _build_checklist_response(cl: ComplianceChecklist) -> ChecklistResponse:
    checks = cl.checks if cl.checks else []
    total = len(checks)
    passed = sum(1 for c in checks if c.status == CheckStatus.passed)
    pass_rate = (passed / total * 100) if total > 0 else 0.0
    return ChecklistResponse(
        id=cl.id,
        project_id=cl.project_id,
        name=cl.name,
        description=cl.description,
        created_by=cl.created_by,
        created_at=cl.created_at,
        checks_count=total,
        pass_rate=round(pass_rate, 1),
    )


@router.get("", response_model=list[ChecklistResponse])
async def list_checklists(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(ComplianceChecklist)
        .where(ComplianceChecklist.project_id == project_id)
        .options(selectinload(ComplianceChecklist.checks))
        .order_by(ComplianceChecklist.created_at.desc())
    )
    checklists = result.scalars().unique().all()
    return [_build_checklist_response(cl) for cl in checklists]


@router.post("", response_model=ChecklistResponse, status_code=201)
async def create_checklist(
    project_id: uuid.UUID,
    req: ChecklistCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    cl = ComplianceChecklist(
        id=uuid.uuid4(),
        project_id=project_id,
        name=req.name,
        description=req.description,
        created_by=user.id,
    )
    db.add(cl)
    await db.flush()
    cl.checks = []
    return _build_checklist_response(cl)


@router.get("/{checklist_id}", response_model=ChecklistDetailResponse)
async def get_checklist(
    project_id: uuid.UUID,
    checklist_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(ComplianceChecklist)
        .where(
            ComplianceChecklist.id == checklist_id,
            ComplianceChecklist.project_id == project_id,
        )
        .options(selectinload(ComplianceChecklist.checks))
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist not found")
    base = _build_checklist_response(cl)
    return ChecklistDetailResponse(
        **base.model_dump(),
        checks=[CheckResponse.model_validate(c) for c in cl.checks],
    )


@router.post("/{checklist_id}/checks", response_model=CheckResponse, status_code=201)
async def add_check(
    project_id: uuid.UUID,
    checklist_id: uuid.UUID,
    req: CheckCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    # Verify checklist exists
    result = await db.execute(
        select(ComplianceChecklist).where(
            ComplianceChecklist.id == checklist_id,
            ComplianceChecklist.project_id == project_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Checklist not found")

    check = ComplianceCheck(
        id=uuid.uuid4(),
        checklist_id=checklist_id,
        title=req.title,
        description=req.description,
        category=req.category,
    )
    db.add(check)
    await db.flush()
    return CheckResponse.model_validate(check)


@router.patch("/{checklist_id}/checks/{check_id}", response_model=CheckResponse)
async def update_check(
    project_id: uuid.UUID,
    checklist_id: uuid.UUID,
    check_id: uuid.UUID,
    req: CheckUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(ComplianceCheck).where(
            ComplianceCheck.id == check_id,
            ComplianceCheck.checklist_id == checklist_id,
        )
    )
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    if req.status is not None:
        check.status = req.status
    if req.evidence_url is not None:
        check.evidence_url = req.evidence_url
    if req.notes is not None:
        check.notes = req.notes
    if req.assigned_to is not None:
        check.assigned_to = req.assigned_to
    check.updated_by = user.id
    await db.flush()
    return CheckResponse.model_validate(check)


@router.get("/readiness", response_model=LaunchReadinessResponse)
async def launch_readiness(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(ComplianceChecklist)
        .where(ComplianceChecklist.project_id == project_id)
        .options(selectinload(ComplianceChecklist.checks))
    )
    checklists = result.scalars().unique().all()

    all_checks: list[ComplianceCheck] = []
    for cl in checklists:
        all_checks.extend(cl.checks or [])

    total = len(all_checks)
    passed = sum(1 for c in all_checks if c.status == CheckStatus.passed)
    failed = sum(1 for c in all_checks if c.status == CheckStatus.failed)
    overall_score = (passed / total * 100) if total > 0 else 0.0

    # Per-category scores
    category_scores: dict[str, float] = {}
    for cat in CheckCategory:
        cat_checks = [c for c in all_checks if c.category == cat]
        if cat_checks:
            cat_passed = sum(1 for c in cat_checks if c.status == CheckStatus.passed)
            category_scores[cat.value] = round(cat_passed / len(cat_checks) * 100, 1)
        else:
            category_scores[cat.value] = 0.0

    blockers = [
        CheckResponse.model_validate(c)
        for c in all_checks
        if c.status == CheckStatus.failed
    ]

    return LaunchReadinessResponse(
        overall_score=round(overall_score, 1),
        category_scores=category_scores,
        blockers=blockers,
        total=total,
        passed=passed,
        failed=failed,
    )
