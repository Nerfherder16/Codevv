import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.pipeline import (
    AgentRun,
    AgentFinding,
    AgentType,
    RunStatus,
    FindingSeverity,
)


async def create_run(
    project_id: uuid.UUID,
    agent_type: AgentType,
    input_json: dict | None,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> AgentRun:
    run = AgentRun(
        id=uuid.uuid4(),
        project_id=project_id,
        agent_type=agent_type,
        status=RunStatus.queued,
        input_json=input_json,
        created_by=user_id,
    )
    db.add(run)
    await db.flush()
    return run


async def complete_run(
    run: AgentRun,
    output_json: dict | None,
    db: AsyncSession,
) -> AgentRun:
    run.status = RunStatus.completed
    run.output_json = output_json
    run.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return run


async def fail_run(
    run: AgentRun,
    error: str,
    db: AsyncSession,
) -> AgentRun:
    run.status = RunStatus.failed
    run.error_message = error
    run.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return run


async def add_finding(
    run_id: uuid.UUID,
    severity: FindingSeverity,
    title: str,
    description: str | None,
    db: AsyncSession,
    file_path: str | None = None,
) -> AgentFinding:
    finding = AgentFinding(
        id=uuid.uuid4(),
        run_id=run_id,
        severity=severity,
        title=title,
        description=description,
        file_path=file_path,
    )
    db.add(finding)
    await db.flush()
    return finding
