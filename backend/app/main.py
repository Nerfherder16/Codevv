from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import init_db
from app.api.routes import (
    auth,
    projects,
    canvases,
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
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(canvases.router, prefix="/api")
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


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}
