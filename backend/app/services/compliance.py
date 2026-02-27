"""Compliance service — reactive re-evaluation helpers."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import ComplianceCheck, CheckStatus


async def reevaluate_architecture_compliance(
    project_id: uuid.UUID, db: AsyncSession
) -> None:
    """Flag auto_evaluate checks for re-review when architecture changes.

    Called as a fire-and-forget background task from activity logging.
    Marks any auto_evaluate checks that are currently 'passed' back to
    'in_progress' so reviewers know the architecture has changed since
    the last sign-off.
    """
    try:
        # compliance_checks does not have project_id directly — go via checklist
        from app.models.compliance import ComplianceChecklist
        from sqlalchemy.orm import selectinload

        result = await db.execute(
            select(ComplianceCheck)
            .join(ComplianceChecklist, ComplianceCheck.checklist_id == ComplianceChecklist.id)
            .where(
                ComplianceChecklist.project_id == project_id,
                ComplianceCheck.auto_evaluate == True,  # noqa: E712
            )
        )
        checks = result.scalars().all()
        flagged = 0
        for check in checks:
            if check.status == CheckStatus.passed:
                check.status = CheckStatus.in_progress
                flagged += 1
        if flagged:
            await db.commit()
    except Exception:
        pass
