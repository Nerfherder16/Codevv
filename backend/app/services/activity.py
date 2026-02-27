"""Activity logging service — writes DB record and publishes real-time event."""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services.events import project_event


async def log_activity(
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str,
    entity_name: str | None = None,
    details: dict | None = None,
    *,
    db: AsyncSession,
) -> Activity:
    """Log an activity entry and publish a real-time project event."""
    activity = Activity(
        project_id=project_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details,
    )
    db.add(activity)
    await db.flush()

    try:
        await project_event(
            project_id,
            f"{entity_type}.{action}",
            {
                "activity_id": str(activity.id),
                "entity_id": entity_id,
                "entity_name": entity_name,
                "actor_id": str(actor_id),
                **(details or {}),
            },
            actor_id,
        )
    except Exception:
        pass  # Never let Redis failure break a write

    return activity
