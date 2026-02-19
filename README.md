<p align="center">
  <img src="codevvlogo.png" alt="Codevv" width="400" />
</p>

<h1 align="center">Codevv</h1>
<p align="center">Collaborative software design platform — AI-assisted, real-time, self-hosted.</p>

---

## Overview

Codevv is a collaborative platform for software design and development teams. It combines AI-assisted planning, real-time editing, visual design tools, and deployment orchestration in a single self-hosted application.

**GitHub:** https://github.com/Nerfherder16/Codevv

---

## Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy (async), Pydantic |
| Frontend | React 19, TypeScript, Tailwind v4, Vite |
| Database | PostgreSQL + pgvector |
| Cache | Redis |
| Real-time collab | Yjs (document sync) |
| Video | LiveKit |
| AI | Claude (OAuth PKCE, SSE streaming, 8 project-aware tools) |
| Memory | Recall semantic memory (http://192.168.50.19:8200) |

---

## Features

### Core
- **Overview** — Project dashboard with status KPIs and activity feed
- **Canvas** — tldraw-based visual design board
- **Idea Vault** — Capture and organize ideas with tagging and search
- **Knowledge Graph** — Semantic relationships between project concepts (Recall-backed)

### Build
- **Code Scaffold** — AI-generated project structure and boilerplate
- **Pipeline** — Agent run tracking and build status monitoring
- **Dependency Map** — Visual graph of project and service dependencies
- **Deploy** — Deployment configuration and status

### Platform
- **Business Rules** — Recall-backed rule definitions and policy management
- **Blockchain** — Solana devnet integration
- **Video Rooms** — LiveKit-powered real-time video collaboration

### Operations
- **Audit Prep** — Automated report generation for compliance audits
- **Launch Readiness** — Compliance checklists and go-live gates

### Settings
- Workspace configuration, integrations, user management

---

## AI Integration

Claude is integrated via OAuth PKCE (shared credentials with Claude Code CLI). Features:
- SSE streaming chat
- 8 project-aware tools (scaffold, pipeline, deploy, business rules, etc.)
- Per-project semantic memory via Recall (`codevv:{project_slug}` domain)

---

## Deployment

Codevv runs via Docker Compose. Services: `backend`, `frontend`, `postgres`, `redis`, `livekit`, `yjs-server`.

```bash
docker compose up -d
```

The frontend is served by Vite dev server proxying to the FastAPI backend.

### Deployment Modes

| Mode | Description |
|------|-------------|
| **Codevv** (this repo) | Full Docker server — main platform |
| **Codevv-Windows** | Lightweight desktop client that connects to a Codevv server |

---

## Development

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Architecture

```
backend/
  app/
    routers/      # FastAPI route handlers
    models/       # SQLAlchemy + Pydantic schemas
    services/     # Business logic
    core/         # Config, auth, middleware

frontend/
  src/
    components/   # common/ + features/
    pages/        # One file per route (named exports)
    contexts/     # React context providers
    hooks/        # Custom hooks
    lib/          # API client, utilities
    types/        # Shared TypeScript types
```

---

## Design

- Dark-first UI — page background `#0a0e14`, card surfaces with glass blur
- Accents: teal `#00AFB9` (primary), coral `#F07167` (hot)
- Typography: Satoshi (display), Geist Mono (code)
- Layout: icon sidebar + bento grid content area
