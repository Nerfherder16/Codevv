from contextlib import asynccontextmanager
from fastapi import FastAPI, Query as Q
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from app.core.config import get_settings
from app.core.database import init_db, get_db as _get_db
from app.api.routes import (
    ai,
    auth,
    projects,
    canvases,
    conversations,
    ideas,
    scaffold,
    knowledge,
    video,
    deploy,
    rules,
    dependencies,
    pipeline,
    solana,
    audit,
    compliance,
    documents,
    workspaces,
    ws_terminal,
    activity,
    events,
    tasks,
    comments,
    files,
    search,
)
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ]
)

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", app=settings.app_name, env=settings.environment)
    await init_db()

    # Add new columns to existing users table (create_all doesn't ALTER)
    from app.core.database import engine
    from sqlalchemy import text as _text

    async with engine.begin() as conn:
        for col, default in [("is_admin", "false"), ("onboarding_completed", "false")]:
            try:
                await conn.execute(
                    _text(
                        f"ALTER TABLE users ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT {default}"
                    )
                )
                logger.info("migration.column_added", table="users", column=col)
            except Exception:
                pass  # Column already exists

        # Same for project_invites and password_reset_tokens (new tables handled by create_all)

    # Seed admin account
    from app.core.database import async_session
    from app.models.user import User
    from app.models.project import Project, ProjectMember, ProjectRole
    from app.core.security import hash_password
    from app.services.org_service import create_personal_org
    from sqlalchemy import select

    async with async_session() as db:
        result = await db.execute(select(User).where(User.is_admin == True).limit(1))  # noqa: E712
        admin = result.scalar_one_or_none()
        if not admin:
            existing = await db.execute(
                select(User).where(User.email == "trg1685@gmail.com")
            )
            admin = existing.scalar_one_or_none()
            if admin:
                admin.is_admin = True
                admin.onboarding_completed = True
                admin.password_hash = hash_password("lacetimcat1216")
                logger.info("admin.upgraded", email="trg1685@gmail.com")
            else:
                admin = User(
                    email="trg1685@gmail.com",
                    display_name="nerfherder",
                    password_hash=hash_password("lacetimcat1216"),
                    is_admin=True,
                    onboarding_completed=True,
                )
                db.add(admin)
                await db.flush()
                logger.info("admin.seeded", email="trg1685@gmail.com")
            await db.commit()
        else:
            admin.password_hash = hash_password("lacetimcat1216")
            await db.commit()
            logger.info("admin.exists", email=admin.email)

        # Ensure admin has a personal org (handles migration case for existing accounts)
        await db.refresh(admin)
        if admin.personal_org_id is None:
            try:
                await create_personal_org(admin, db)
                logger.info("admin.personal_org_created", email=admin.email)
            except Exception as e:
                logger.warning("admin.personal_org_failed", error=str(e))

        # Ensure admin is owner of all projects
        all_projects = await db.execute(select(Project))
        for project in all_projects.scalars().all():
            membership = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.user_id == admin.id,
                )
            )
            if not membership.scalar_one_or_none():
                db.add(
                    ProjectMember(
                        project_id=project.id,
                        user_id=admin.id,
                        role=ProjectRole.owner,
                    )
                )
                logger.info("admin.project_added", project=project.name)
        await db.commit()

    yield
    logger.info("shutdown")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(ai.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(canvases.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(ideas.router, prefix="/api")
app.include_router(scaffold.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(video.router, prefix="/api")
app.include_router(deploy.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(dependencies.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(solana.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(workspaces.router, prefix="/api")
app.include_router(ws_terminal.router)

# Invites
from app.api.routes import invites  # noqa: E402, F811

app.include_router(invites.router, prefix="/api")

# Organizations
from app.api.routes import orgs  # noqa: E402

app.include_router(orgs.router, prefix="/api/orgs")

# Code-server reverse proxy (no /api prefix — routes are /workspace-proxy/...)
from app.api.routes import ws_proxy  # noqa: E402

app.include_router(ws_proxy.router)

# Real-time event stream + activity feed
app.include_router(activity.router, prefix="/api")
app.include_router(events.router)

# Phase 2: tasks + comments + references
app.include_router(tasks.router, prefix="/api")
app.include_router(tasks.my_tasks_router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(search.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


# OAuth callback at /callback (matches Claude Code CLI's registered redirect URI)


@app.get("/callback")
async def oauth_callback(code: str = Q(...), state: str = Q(...)):
    from app.services import claude_auth

    async for db in _get_db():
        try:
            await claude_auth.handle_callback(code, state, db)
            await db.commit()
            return HTMLResponse(
                "<html><body style='background:#0f0d1a;color:#e5e7eb;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
                "<div style='text-align:center'>"
                "<h2 style='color:#38bdf8'>Logged in to Claude!</h2>"
                "<p>You can close this tab and return to Codevv.</p>"
                "<script>setTimeout(()=>window.close(),1500)</script>"
                "</div></body></html>"
            )
        except Exception as e:
            await db.rollback()
            logger.error("oauth.callback_error", error=str(e))
            return HTMLResponse(
                f"<html><body style='background:#0f0d1a;color:#e5e7eb;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
                f"<div style='text-align:center'><h2 style='color:#ef4444'>Login failed</h2><p>{str(e)}</p></div></body></html>",
                status_code=400,
            )
