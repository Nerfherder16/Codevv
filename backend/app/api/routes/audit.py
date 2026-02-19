from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.audit import AuditReport, AuditStatus
from app.models.canvas import Canvas, CanvasComponent
from app.models.scaffold import ScaffoldJob
from app.models.deploy import DeployJob, Environment
from app.models.idea import Idea
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation
from app.schemas.audit import AuditReportCreate, AuditReportResponse
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/audit", tags=["audit"])


async def _build_report(
    project_id: uuid.UUID, sections: list[str], db: AsyncSession
) -> dict:
    report: dict = {"sections": []}

    if "architecture" in sections:
        comp_count = await db.scalar(
            select(func.count(CanvasComponent.id))
            .join(Canvas, Canvas.id == CanvasComponent.canvas_id)
            .where(Canvas.project_id == project_id)
        )
        canvas_count = await db.scalar(
            select(func.count(Canvas.id)).where(Canvas.project_id == project_id)
        )
        # Get component type distribution
        type_result = await db.execute(
            select(CanvasComponent.component_type, func.count(CanvasComponent.id))
            .join(Canvas, Canvas.id == CanvasComponent.canvas_id)
            .where(Canvas.project_id == project_id)
            .group_by(CanvasComponent.component_type)
        )
        type_dist = {row[0]: row[1] for row in type_result.all()}
        score = min(100, (comp_count or 0) * 10 + (canvas_count or 0) * 5)
        report["sections"].append(
            {
                "name": "Architecture",
                "items": [
                    {"label": "Canvases", "value": canvas_count or 0},
                    {"label": "Components", "value": comp_count or 0},
                    {"label": "Type Distribution", "value": type_dist},
                ],
                "score": score,
            }
        )

    if "code_generation" in sections:
        total_jobs = await db.scalar(
            select(func.count(ScaffoldJob.id)).where(
                ScaffoldJob.project_id == project_id
            )
        )
        # Count by status
        status_result = await db.execute(
            select(ScaffoldJob.status, func.count(ScaffoldJob.id))
            .where(ScaffoldJob.project_id == project_id)
            .group_by(ScaffoldJob.status)
        )
        status_dist = {row[0]: row[1] for row in status_result.all()}
        approved = status_dist.get("approved", 0)
        score = min(100, int((approved / max(total_jobs or 1, 1)) * 100))
        report["sections"].append(
            {
                "name": "Code Generation",
                "items": [
                    {"label": "Total Jobs", "value": total_jobs or 0},
                    {
                        "label": "Status Distribution",
                        "value": {str(k): v for k, v in status_dist.items()},
                    },
                ],
                "score": score,
            }
        )

    if "deployment" in sections:
        env_count = await db.scalar(
            select(func.count(Environment.id)).where(
                Environment.project_id == project_id
            )
        )
        deploy_count = await db.scalar(
            select(func.count(DeployJob.id))
            .join(Environment, Environment.id == DeployJob.environment_id)
            .where(Environment.project_id == project_id)
        )
        score = min(100, (env_count or 0) * 20 + (deploy_count or 0) * 5)
        report["sections"].append(
            {
                "name": "Deployment",
                "items": [
                    {"label": "Environments", "value": env_count or 0},
                    {"label": "Deploy Jobs", "value": deploy_count or 0},
                ],
                "score": score,
            }
        )

    if "ideas" in sections:
        idea_count = await db.scalar(
            select(func.count(Idea.id)).where(Idea.project_id == project_id)
        )
        status_result = await db.execute(
            select(Idea.status, func.count(Idea.id))
            .where(Idea.project_id == project_id)
            .group_by(Idea.status)
        )
        status_dist = {str(row[0]): row[1] for row in status_result.all()}
        implemented = status_dist.get("IdeaStatus.implemented", 0) + status_dist.get(
            "implemented", 0
        )
        score = min(100, int((implemented / max(idea_count or 1, 1)) * 100))
        report["sections"].append(
            {
                "name": "Ideas",
                "items": [
                    {"label": "Total Ideas", "value": idea_count or 0},
                    {"label": "Status Distribution", "value": status_dist},
                ],
                "score": score,
            }
        )

    if "knowledge" in sections:
        entity_count = await db.scalar(
            select(func.count(KnowledgeEntity.id)).where(
                KnowledgeEntity.project_id == project_id
            )
        )
        relation_count = await db.scalar(
            select(func.count(KnowledgeRelation.id)).where(
                KnowledgeRelation.project_id == project_id
            )
        )
        density = (relation_count or 0) / max(entity_count or 1, 1)
        score = min(100, int(density * 20 + (entity_count or 0) * 2))
        report["sections"].append(
            {
                "name": "Knowledge",
                "items": [
                    {"label": "Entities", "value": entity_count or 0},
                    {"label": "Relations", "value": relation_count or 0},
                    {"label": "Graph Density", "value": round(density, 2)},
                ],
                "score": score,
            }
        )

    # Overall score
    if report["sections"]:
        report["overall_score"] = sum(s["score"] for s in report["sections"]) // len(
            report["sections"]
        )
    else:
        report["overall_score"] = 0

    return report


@router.get("", response_model=list[AuditReportResponse])
async def list_reports(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(AuditReport)
        .where(
            AuditReport.project_id == project_id,
            AuditReport.status != AuditStatus.archived,
        )
        .order_by(AuditReport.created_at.desc())
    )
    return [AuditReportResponse.model_validate(r) for r in result.scalars().all()]


@router.post("", response_model=AuditReportResponse, status_code=201)
async def generate_report(
    project_id: uuid.UUID,
    req: AuditReportCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    report_data = await _build_report(project_id, req.sections, db)
    report = AuditReport(
        id=uuid.uuid4(),
        project_id=project_id,
        title=req.title,
        report_json=report_data,
        status=AuditStatus.ready,
        generated_by=user.id,
    )
    db.add(report)
    await db.flush()
    return AuditReportResponse.model_validate(report)


@router.get("/{report_id}", response_model=AuditReportResponse)
async def get_report(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(AuditReport).where(
            AuditReport.id == report_id, AuditReport.project_id == project_id
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return AuditReportResponse.model_validate(report)


@router.delete("/{report_id}", status_code=204)
async def archive_report(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(AuditReport).where(
            AuditReport.id == report_id, AuditReport.project_id == project_id
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = AuditStatus.archived
    await db.flush()
