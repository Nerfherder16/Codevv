# Spec: Phase 0 — Organization Layer & Onboarding

## Goal

Add a multi-tenant Organization layer between Users and Projects. Currently `User -> ProjectMember -> Project` with no team/company concept. After Phase 0: `User -> OrgMembership -> Organization -> Project`. Every project belongs to an org. Users belong to orgs via memberships. Invite links let non-technical users join without admin involvement. Claude integration config lives at the org level. A minimal frontend wizard lets the first user set up their org and invite others.

**What is NOT in Phase 0:** Persona sidebar reordering (Phase 3), full chat panel modes (Phase 4), session system (Phase 5). Keep scope tight.

## Architecture

```
User
 ├── personal_org_id -> Organization (auto-created on register)
 └── OrgMembership[] -> Organization[]
                              └── Project[] (org_id FK)
                                    └── ProjectMember[] (+ persona field)
```

**Invite flow:**
1. Org admin calls `POST /orgs/{id}/invite` -> creates `OrgMembership(status=invited, invite_token=uuid, invite_email=...)`
2. Token included in a link: `https://codevv.streamy.tube/invite/{token}`
3. Recipient visits link -> `GET /orgs/invites/{token}` returns invite details (public, no auth)
4. If logged in: `POST /orgs/invites/{token}/accept` -> membership activated
5. If not logged in: redirect to `/register?invite={token}` -> auto-activates on account creation

**Auto-add to projects:** When `org.auto_add_to_projects = True`, accepting an invite triggers `ProjectMember` creation for all org projects with `persona = membership.default_persona`.

**Personal org:** On register, a `Organization(name="<display_name>'s Workspace", slug="<email_prefix>-personal")` is auto-created, user added as owner, `user.personal_org_id` set.

## Tasks

### Task 1 — Organization & OrgMembership models + migrations
Create `backend/app/models/organization.py` with `Organization` and `OrgMembership` models.

**Models to implement:**

```python
import uuid, enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class OrgRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"

class OrgMemberStatus(str, enum.Enum):
    invited = "invited"
    active = "active"
    suspended = "suspended"

class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    claude_auth_mode: Mapped[str] = mapped_column(String(20), default="oauth_per_user")
    claude_subscription_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    anthropic_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_add_to_projects: Mapped[bool] = mapped_column(Boolean, default=True)
    default_persona: Mapped[str] = mapped_column(String(20), default="creator")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    members: Mapped[list["OrgMembership"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="organization")  # no cascade - projects survive org delete until we implement that

class OrgMembership(Base):
    __tablename__ = "org_memberships"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    role: Mapped[OrgRole] = mapped_column(SAEnum(OrgRole), default=OrgRole.member)
    default_persona: Mapped[str] = mapped_column(String(20), default="creator")
    status: Mapped[OrgMemberStatus] = mapped_column(SAEnum(OrgMemberStatus), default=OrgMemberStatus.invited)
    invite_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invite_token: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
```

Add to `backend/app/models/__init__.py`:
```python
from app.models.organization import Organization, OrgMembership
```

NOTE: `Project.organization` back-ref requires `organization: Mapped["Organization"] = relationship(back_populates="projects")` to be added to the Project class in Task 2.

Run migration:
```bash
cd /DATA/AppData/codevv
docker compose exec backend alembic revision --autogenerate -m "create organizations and org_memberships tables"
docker compose exec backend alembic upgrade head
```

Test: `docker compose exec backend python -c "from app.models.organization import Organization, OrgMembership; print('OK')"` should print OK.

- Parallel: No (foundational, must be first)

---

### Task 2 — Update User + Project models + migrations
Two model updates plus migrations.

**1. Add `personal_org_id` to User (`backend/app/models/user.py`):**
```python
personal_org_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
)
```

**2. Add `org_id` to Project and `persona` to ProjectMember (`backend/app/models/project.py`):**
```python
# Add ProjectPersona enum (new):
class ProjectPersona(str, enum.Enum):
    developer = "developer"
    creator = "creator"
    operations = "operations"
    finance = "finance"

# Add to Project class:
org_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True  # nullable for backward compat with existing rows
)
organization: Mapped["Organization | None"] = relationship(back_populates="projects")

# Add to ProjectMember class:
persona: Mapped[ProjectPersona] = mapped_column(
    SAEnum(ProjectPersona), default=ProjectPersona.creator
)
```

Run migration:
```bash
docker compose exec backend alembic revision --autogenerate -m "add personal_org_id to users, org_id to projects, persona to project_members"
docker compose exec backend alembic upgrade head
```

Test: `docker compose exec backend python -c "from app.models.project import ProjectPersona; from app.models.user import User; print('OK')"` should print OK.

- Parallel: No (depends on Task 1 — organization.py must exist for FK references)

---

### Task 3 — Org service + Pydantic schemas
Create `backend/app/services/org_service.py`:

```python
async def create_org(name: str, slug: str, owner: User, claude_auth_mode: str, default_persona: str, auto_add_to_projects: bool, db: AsyncSession) -> Organization:
    # Creates Organization, creates OrgMembership(role=owner, status=active, user_id=owner.id, joined_at=now())
    # Returns org

async def get_user_orgs(user_id: uuid.UUID, db: AsyncSession) -> list[Organization]:
    # SELECT orgs WHERE id IN (SELECT org_id FROM org_memberships WHERE user_id=user_id AND status=active)

async def get_org(org_id: uuid.UUID, db: AsyncSession) -> Organization | None:
    # SELECT by id

async def get_org_by_slug(slug: str, db: AsyncSession) -> Organization | None:

async def invite_member(org: Organization, email: str, role: str, persona: str, invited_by: User, db: AsyncSession) -> OrgMembership:
    # Check if OrgMembership already exists for this email
    # Generate invite_token = str(uuid.uuid4())
    # Create OrgMembership(status=invited, invite_email=email, invite_token=token, role=role, default_persona=persona, invited_by=invited_by.id)
    # Return membership

async def get_invite_by_token(token: str, db: AsyncSession) -> OrgMembership | None:
    # SELECT FROM org_memberships WHERE invite_token=token AND status='invited'

async def accept_invite(membership: OrgMembership, user: User, db: AsyncSession) -> OrgMembership:
    # membership.status = active
    # membership.user_id = user.id
    # membership.joined_at = now()
    # If org.auto_add_to_projects: call _auto_add_to_projects
    # Return updated membership

async def _auto_add_to_projects(org: Organization, user: User, persona: str, db: AsyncSession):
    # Get all projects with org_id=org.id
    # For each project, check if user is already a ProjectMember
    # If not: create ProjectMember(project_id=p.id, user_id=user.id, role='editor', persona=persona)

async def create_personal_org(user: User, db: AsyncSession) -> Organization:
    # email_prefix = user.email.split('@')[0].lower() with non-alphanumeric replaced by -
    # slug = f"{email_prefix}-personal" — ensure uniqueness by appending random suffix if slug exists
    # name = f"{user.display_name}'s Workspace"
    # org = await create_org(name, slug, user, "oauth_per_user", "developer", False, db)
    # user.personal_org_id = org.id
    # return org
```

Create `backend/app/schemas/org.py` with Pydantic v2 models:
```python
from pydantic import BaseModel, Field, ConfigDict

class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=200, pattern=r'^[a-z0-9-]+$')
    claude_auth_mode: str = "oauth_per_user"
    claude_subscription_type: str | None = None
    default_persona: str = "creator"
    auto_add_to_projects: bool = True

class OrgResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    owner_id: str
    claude_auth_mode: str
    claude_subscription_type: str | None
    auto_add_to_projects: bool
    default_persona: str
    created_at: str

class OrgUpdate(BaseModel):
    name: str | None = None
    claude_auth_mode: str | None = None
    claude_subscription_type: str | None = None
    auto_add_to_projects: bool | None = None
    default_persona: str | None = None

class OrgMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str | None
    invite_email: str | None
    display_name: str | None = None
    email: str | None = None
    role: str
    default_persona: str
    status: str
    joined_at: str | None

class InviteCreate(BaseModel):
    email: str = Field(pattern=r'^[\w.+-]+@[\w-]+\.\w+$')
    role: str = "member"
    persona: str = "creator"

class InviteDetail(BaseModel):
    org_name: str
    org_slug: str
    invite_email: str
    role: str
    persona: str
    invited_by_name: str | None
```

- Parallel: Yes (can run alongside Task 2 once Task 1 is done)

---

### Task 4 — Org routes
Create `backend/app/api/routes/orgs.py` implementing these endpoints:

```
POST   /api/orgs                                     create org (auth required)
GET    /api/orgs/me                                   list caller's orgs (auth required)
GET    /api/orgs/{org_id}                             org detail + member list (member required)
PATCH  /api/orgs/{org_id}                             update settings (owner/admin required)
DELETE /api/orgs/{org_id}                             delete org (owner required)
POST   /api/orgs/{org_id}/invite                      invite by email (admin/owner required)
GET    /api/orgs/{org_id}/members                     list members with user details (member required)
PATCH  /api/orgs/{org_id}/members/{member_id}         update role/persona (admin/owner required)
DELETE /api/orgs/{org_id}/members/{member_id}         remove member (admin/owner required)
GET    /api/orgs/invites/{token}                      invite details - NO AUTH, public endpoint
POST   /api/orgs/invites/{token}/accept               accept invite (auth required)
GET    /api/orgs/{org_id}/claude-status               subscription validation (member required)
```

IMPORTANT: `GET /api/orgs/invites/{token}` must NOT have an auth dependency. It's a public endpoint — unauthenticated users need to read it to decide whether to register.

Route order matters: define `/api/orgs/me` and `/api/orgs/invites/{token}` BEFORE `/{org_id}` routes to avoid `me` and `invites` being interpreted as org_id values.

For `GET /api/orgs/{org_id}/claude-status`, import and call `validate_subscription` from `claude_auth.py` (which will be added in Task 7).

Register router in `backend/app/main.py`:
```python
from app.api.routes import orgs
app.include_router(orgs.router, prefix="/api/orgs", tags=["organizations"])
```

Test with curl:
```bash
TOKEN=$(curl -s -X POST http://192.168.50.19:8002/api/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=trg1685@gmail.com&password=lacetimcat1216" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s http://192.168.50.19:8002/api/orgs/me -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

- Parallel: No (depends on Tasks 2 + 3)

---

### Task 5 — Update auth: auto-create personal org on register + invite_token support
Modify `backend/app/api/routes/auth.py`:

1. Add `invite_token: str | None = None` to the register request body schema (wherever RegisterRequest is defined — if it's a Pydantic model, add the field; if it's form-based, add as optional query param).

2. After creating the user and flushing to DB, call:
```python
from app.services.org_service import create_personal_org, get_invite_by_token, accept_invite
await create_personal_org(user, db)
```

3. If `invite_token` was provided:
```python
if invite_token:
    membership = await get_invite_by_token(invite_token, db)
    if membership:
        await accept_invite(membership, user, db)
```

4. Update `backend/app/main.py` startup seeding: the admin user `trg1685@gmail.com` is seeded on startup. After Phase 0, this user needs a personal org too. Add a check: if admin user exists but has no `personal_org_id`, create one:
```python
if admin_user and not admin_user.personal_org_id:
    await create_personal_org(admin_user, db)
```

Test: Register a new test user, check that a personal org was created:
```bash
curl -s -X POST http://192.168.50.19:8002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test_phase0@example.com","password":"TestPass123","display_name":"Test User"}' | python3 -m json.tool
# Then verify org was created:
# GET /api/orgs/me with the new user's token should return 1 org ("Test User's Workspace")
```

- Parallel: No (depends on Tasks 3 + 4)

---

### Task 6 — Update projects routes to accept org_id
Modify `backend/app/api/routes/projects.py`:

1. Update `POST /api/projects` (project creation):
   - Add `org_id: str | None = None` to the project create schema
   - If `org_id` provided: verify caller is an active member of that org before allowing creation. Set `project.org_id = org_id`.
   - If not provided: check if caller has a personal org (`current_user.personal_org_id`), use that. If neither, allow null for backward compat.

2. Update `GET /api/projects`:
   - Add optional `org_id: str | None = None` query param
   - If provided: filter projects by `project.org_id = org_id`, verify caller is org member
   - If not provided: existing behavior (return all projects where user is a ProjectMember)

3. Update Recall domain in `backend/app/services/claude_service.py` and wherever `project.slug` is used as Recall domain:
   - If project has an org: domain = `f"{org.slug}:{project.slug}"`
   - If no org (legacy): domain = `project.slug` (unchanged)

Look for the Recall domain string by searching: `grep -r "project.slug\|project_slug\|recall.*domain" /DATA/AppData/codevv/backend/app/` via SSH to find all usages.

- Parallel: No (depends on Task 4)

---

### Task 7 — Claude subscription validation
Add `validate_subscription` function to `backend/app/services/claude_auth.py`:

```python
async def validate_subscription(user_id: uuid.UUID, org: "Organization", db: AsyncSession) -> dict:
    """Check if user's Claude subscription matches org expectation. Non-blocking — returns warning only."""
    from app.models.claude_credential import ClaudeCredential
    from sqlalchemy import select
    result = await db.execute(select(ClaudeCredential).where(ClaudeCredential.user_id == user_id))
    cred = result.scalar_one_or_none()
    if not cred:
        return {"valid": False, "reason": "not_connected", "subscription": None}
    if org.claude_subscription_type and cred.subscription_type != org.claude_subscription_type:
        return {
            "valid": False,
            "reason": "subscription_mismatch",
            "expected": org.claude_subscription_type,
            "actual": cred.subscription_type,
            "subscription": cred.subscription_type,
        }
    return {"valid": True, "reason": None, "subscription": cred.subscription_type}
```

Check what fields exist on `ClaudeCredential` (read `backend/app/models/claude_credential.py` first). If `subscription_type` doesn't exist on the model, add it as a nullable String field and add a migration.

- Parallel: Yes (can run alongside Tasks 5 + 6 once Task 4 is done)

---

### Task 8 — Frontend types + API functions
Update `frontend/src/types/index.ts` — add org types and update existing types:

```typescript
// NEW: Org types
export type OrgRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "invited" | "active" | "suspended";
export type ProjectPersona = "developer" | "creator" | "operations" | "finance";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  claude_auth_mode: "oauth_per_user" | "api_key" | "none";
  claude_subscription_type: string | null;
  auto_add_to_projects: boolean;
  default_persona: ProjectPersona;
  created_at: string;
}

export interface OrgMember {
  id: string;
  user_id: string | null;
  invite_email: string | null;
  display_name: string | null;
  email: string | null;
  role: OrgRole;
  default_persona: ProjectPersona;
  status: OrgMemberStatus;
  joined_at: string | null;
}

export interface InviteDetail {
  org_name: string;
  org_slug: string;
  invite_email: string;
  role: OrgRole;
  persona: ProjectPersona;
  invited_by_name: string | null;
}

// UPDATES to existing types:
// User: add   personal_org_id: string | null;
// ProjectMember: add   persona: ProjectPersona;
```

Also add org API functions to `frontend/src/lib/api.ts` (read the file first to see how existing calls are structured, then add matching functions):
```typescript
// GET /api/orgs/me -> Organization[]
// POST /api/orgs -> Organization
// GET /api/orgs/{id} -> Organization & { members: OrgMember[] }
// PATCH /api/orgs/{id} -> Organization
// POST /api/orgs/{id}/invite -> OrgMember
// GET /api/orgs/{id}/members -> OrgMember[]
// DELETE /api/orgs/{id}/members/{memberId} -> void
// GET /api/orgs/invites/{token} -> InviteDetail (no auth header)
// POST /api/orgs/invites/{token}/accept -> OrgMember
// GET /api/orgs/{id}/claude-status -> { valid: bool; reason: string | null; subscription: string | null }
```

- Parallel: Yes (can run alongside Tasks 3-7)

---

### Task 9 — InviteAcceptPage
Create `frontend/src/pages/InviteAcceptPage.tsx`.

Route: `/invite/:token` — **outside ProtectedRoute** (public, unauthenticated users must be able to access).

Page behavior:
1. On mount: call `GET /api/orgs/invites/{token}` (unauthenticated)
2. If error (404/invalid): show "This invite link is invalid or has expired."
3. If user IS logged in (check AuthContext):
   - Show: org name, "Tim invited you to join [Org Name]", Accept button
   - On Accept: call `POST /api/orgs/invites/{token}/accept`
   - On success: navigate to `/projects`
4. If user is NOT logged in:
   - Show org name + invitation message
   - "Sign in to accept" -> `/login?invite={token}`
   - "Create an account" -> `/register?invite={token}`

Style: Dark page (`bg-[#0a0e14]`), centered card (`bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 max-w-md mx-auto`), Codevv logo at top center, teal accent (`#00AFB9`) for primary button.

Add to `App.tsx` OUTSIDE the ProtectedRoute wrapper:
```tsx
<Route path="/invite/:token" element={<InviteAcceptPage />} />
```

- Parallel: No (depends on Task 8)

---

### Task 10 — OrgSetupPage + ProjectListPage org switcher + AuthContext update
Three frontend changes:

**A) Update `AuthContext.tsx`:**
Add to context state:
```typescript
currentOrg: Organization | null;
userOrgs: Organization[];
setCurrentOrg: (org: Organization) => void;
fetchUserOrgs: () => Promise<void>;
```
On login/token load: call `GET /api/orgs/me`, store in `userOrgs`. Set `currentOrg` to first org, or restore from `localStorage.getItem('currentOrgId')`. When `setCurrentOrg` called, save to localStorage.

**B) Create `OrgSetupPage.tsx`:**
Route: `/orgs/new` (inside ProtectedRoute)

3-step wizard:
- Step 1: "Name your organization" — text input for name, auto-derives slug (lowercase, spaces->hyphens, strip special chars). Show preview: `codevv.streamy.tube/org/{slug}`.
- Step 2: "How does your team use Claude?" — Three radio cards:
  - "We have Claude Teams" -> claude_auth_mode: "oauth_per_user"
  - "I have an API key" -> claude_auth_mode: "api_key" (show masked input)
  - "Skip for now" -> claude_auth_mode: "none"
- Step 3: Review card + "Create Organization" button -> POST /api/orgs -> navigate to /projects

Step indicator: simple numbered pills (1, 2, 3) at top. Back/Next buttons. Dark glass card style matching InviteAcceptPage.

Add to App.tsx inside ProtectedRoute:
```tsx
<Route path="/orgs/new" element={<OrgSetupPage />} />
```

**C) Update `ProjectListPage.tsx`:**
- Add org switcher at page top: shows current org name + chevron, dropdown lists all orgs + "Personal Workspace" + "+ New Organization" (links to /orgs/new)
- "New Project" button: when creating, pass `org_id: currentOrg?.id` in the request body
- Project list: if currentOrg is set, call `GET /api/projects?org_id={currentOrg.id}` instead of `GET /api/projects`

- Parallel: No (depends on Tasks 8 + 9)

---

## Tech Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, ARQ, PostgreSQL 16+pgvector
- Frontend: React 19, TypeScript, Vite, Tailwind v4, React Router v6
- Infra: Docker Compose on CasaOS (192.168.50.19), backend port 8002, frontend dev server port 5173
- Testing: Verify via curl + python3 -c checks for backend; TypeScript compile for frontend

## Agent Hints

ALL work is on the remote server. Use SSH for everything:
```bash
ssh nerfherder@192.168.50.19 "<command>"
```

Read a file:
```bash
ssh nerfherder@192.168.50.19 "cat /DATA/AppData/codevv/backend/app/models/project.py"
```

Write a file (preferred method — use python3 to write to avoid shell escaping issues):
```bash
ssh nerfherder@192.168.50.19 "python3 -c \"
content = '''
file content here
'''
with open('/path/to/file', 'w') as f:
    f.write(content)
print('written')
\""
```

Or SCP a locally-written temp file:
```bash
scp /tmp/localfile.py nerfherder@192.168.50.19:/DATA/AppData/codevv/backend/app/models/organization.py
```

Run backend commands:
```bash
ssh nerfherder@192.168.50.19 "cd /DATA/AppData/codevv && docker compose exec backend <cmd>"
```

Run migrations:
```bash
ssh nerfherder@192.168.50.19 "cd /DATA/AppData/codevv && docker compose exec -T backend alembic revision --autogenerate -m 'description'"
ssh nerfherder@192.168.50.19 "cd /DATA/AppData/codevv && docker compose exec -T backend alembic upgrade head"
```

NOTE: Use `-T` flag with docker compose exec when piping to avoid TTY issues.

Restart backend after code changes:
```bash
ssh nerfherder@192.168.50.19 "cd /DATA/AppData/codevv && docker compose restart backend worker"
```

Frontend hot-reloads automatically — no restart needed for frontend file changes.

Key file paths:
- `/DATA/AppData/codevv/backend/app/models/` — SQLAlchemy models
- `/DATA/AppData/codevv/backend/app/api/routes/` — FastAPI routers
- `/DATA/AppData/codevv/backend/app/schemas/` — Pydantic schemas
- `/DATA/AppData/codevv/backend/app/services/` — business logic
- `/DATA/AppData/codevv/backend/app/main.py` — router registration + lifespan
- `/DATA/AppData/codevv/backend/app/models/__init__.py` — model imports
- `/DATA/AppData/codevv/frontend/src/types/index.ts` — TypeScript types
- `/DATA/AppData/codevv/frontend/src/lib/api.ts` — API client
- `/DATA/AppData/codevv/frontend/src/contexts/AuthContext.tsx` — auth state
- `/DATA/AppData/codevv/frontend/src/pages/` — page components
- `/DATA/AppData/codevv/frontend/src/App.tsx` — React Router routes

TypeScript check:
```bash
ssh nerfherder@192.168.50.19 "cd /DATA/AppData/codevv && docker compose exec -T frontend npx tsc --noEmit 2>&1 | head -50"
```

Backend health check:
```bash
curl -s http://192.168.50.19:8002/health
```

Admin credentials for testing: `trg1685@gmail.com` / `lacetimcat1216`

Get auth token for testing:
```bash
TOKEN=$(curl -s -X POST http://192.168.50.19:8002/api/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=trg1685@gmail.com&password=lacetimcat1216" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

## Constraints
- Make `Project.org_id` NULLABLE in both model and migration. Existing projects have no org — do not break them.
- Do NOT delete or change `project_invite.py` (project-level invites). Org invites use `org_memberships.invite_token`.
- Do NOT change existing project CRUD behavior for callers that omit org_id — backward compat required.
- Frontend: design tokens are `#0a0e14` page bg, `#00AFB9` teal accent, `#F07167` coral. Fonts: Satoshi (display), Geist Mono (code). No DaisyUI, no shadcn — raw Tailwind only.
- Do NOT touch the Claude OAuth PKCE flow or callback handler beyond adding `validate_subscription`.

## Definition of Done
- [ ] `organizations` and `org_memberships` tables exist in Postgres with correct columns
- [ ] `users.personal_org_id` column exists (nullable UUID)
- [ ] `projects.org_id` column exists (nullable UUID FK to organizations)
- [ ] `project_members.persona` column exists with ProjectPersona enum
- [ ] All migrations applied cleanly (`alembic upgrade head` succeeds)
- [ ] `POST /api/orgs` creates an org with owner membership
- [ ] `GET /api/orgs/me` returns caller's orgs
- [ ] `POST /api/orgs/{id}/invite` creates OrgMembership with invite_token
- [ ] `GET /api/orgs/invites/{token}` works without auth header
- [ ] `POST /api/orgs/invites/{token}/accept` activates membership
- [ ] New user registration auto-creates personal org + sets personal_org_id
- [ ] Frontend `/invite/:token` page loads, shows org name, Accept button (logged in) or register/login links (logged out)
- [ ] Frontend `/orgs/new` wizard creates an org via API
- [ ] Frontend project list shows org switcher, filters by current org
- [ ] Backend restarts cleanly with no startup errors
- [ ] TypeScript compiles with no errors
