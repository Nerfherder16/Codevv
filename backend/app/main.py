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

# Code-server reverse proxy (no /api prefix — routes are /workspace-proxy/...)
from app.api.routes import ws_proxy  # noqa: E402

app.include_router(ws_proxy.router)


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
