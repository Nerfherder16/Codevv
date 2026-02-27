"""
RED phase tests for Task 5: Auth update — auto-create personal org on register + invite_token

Tests:
1. POST /api/auth/register creates a personal org for the new user
2. POST /api/auth/register with valid invite_token adds user to that org
3. POST /api/auth/register with invalid invite_token still succeeds (org invite silently ignored)
4. Startup seeding creates personal org for existing admin if missing
"""
import uuid
import pytest
import pytest_asyncio
from sqlalchemy import select

from tests.conftest import make_email


@pytest.mark.asyncio
async def test_register_creates_personal_org(client, db_session):
    """After registering, the user should have a personal_org_id set."""
    email = make_email()
    resp = await client.post("/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "display_name": "Test User",
    })
    assert resp.status_code == 200, resp.text
    assert "access_token" in resp.json()

    # Verify user has personal_org_id set
    from app.models.user import User
    from app.models.organization import Organization

    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.personal_org_id is not None, "personal_org_id should be set after register"

    # Verify the org actually exists
    org_result = await db_session.execute(
        select(Organization).where(Organization.id == user.personal_org_id)
    )
    org = org_result.scalar_one_or_none()
    assert org is not None, "Personal org should exist in DB"
    assert "Workspace" in org.name or user.display_name.lower() in org.name.lower(), \
        f"Org name '{org.name}' should reference user's workspace"


@pytest.mark.asyncio
async def test_register_with_valid_org_invite_token(client, db_session):
    """
    Registering with a valid org invite_token should accept the invite
    and add the new user to the org.
    """
    from app.models.user import User
    from app.models.organization import Organization, OrgMembership, OrgMemberStatus
    from app.services.org_service import create_org, invite_member

    # Create an org with an owner
    owner_email = make_email()
    owner = User(
        id=uuid.uuid4(),
        email=owner_email,
        display_name="Org Owner",
        password_hash="fakehash",
    )
    db_session.add(owner)
    await db_session.flush()

    org = await create_org(
        name="Test Org",
        slug=f"test-org-{uuid.uuid4().hex[:6]}",
        owner=owner,
        db=db_session,
    )

    # Create an org invite for the new user's email
    new_user_email = make_email()
    membership = await invite_member(
        org=org,
        email=new_user_email,
        role="member",
        persona="developer",
        invited_by=owner,
        db=db_session,
    )
    invite_token = membership.invite_token
    assert invite_token is not None

    # Register with the invite token
    resp = await client.post("/api/auth/register", json={
        "email": new_user_email,
        "password": "testpass123",
        "display_name": "Invited User",
        "invite_token": invite_token,
    })
    assert resp.status_code == 200, resp.text

    # Verify user was added to the org
    result = await db_session.execute(select(User).where(User.email == new_user_email))
    user = result.scalar_one_or_none()
    assert user is not None

    # Check their org membership is active
    mem_result = await db_session.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == org.id,
            OrgMembership.user_id == user.id,
            OrgMembership.status == OrgMemberStatus.active,
        )
    )
    active_membership = mem_result.scalar_one_or_none()
    assert active_membership is not None, "User should be an active member of the invited org"

    # Also check personal org was created
    assert user.personal_org_id is not None, "personal_org_id should still be set"


@pytest.mark.asyncio
async def test_register_with_invalid_invite_token_still_succeeds(client, db_session):
    """
    Registering with an invalid/bogus invite_token should still succeed.
    The invite is silently ignored (no 400/500 error).
    """
    email = make_email()
    resp = await client.post("/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "display_name": "Another User",
        "invite_token": "totally-invalid-token-that-does-not-exist",
    })
    assert resp.status_code == 200, resp.text
    assert "access_token" in resp.json()

    # User should still have a personal org
    from app.models.user import User
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.personal_org_id is not None, "personal_org_id should be set even with invalid invite_token"


@pytest.mark.asyncio
async def test_startup_creates_personal_org_for_admin_if_missing(db_session):
    """
    If admin user exists but has no personal_org_id, startup seeding should create one.
    We test the org_service function directly since lifespan is complex to test.
    """
    import uuid
    from app.models.user import User
    from app.models.organization import Organization
    from app.services.org_service import create_personal_org

    # Create a user without a personal org (simulating pre-migration admin)
    admin_email = make_email()
    admin = User(
        id=uuid.uuid4(),
        email=admin_email,
        display_name="Admin User",
        password_hash="fakehash",
        is_admin=True,
        personal_org_id=None,  # No personal org yet
    )
    db_session.add(admin)
    await db_session.flush()

    assert admin.personal_org_id is None

    # Call the function that startup seeding should call
    org = await create_personal_org(admin, db_session)

    # Verify
    assert org is not None
    assert admin.personal_org_id == org.id, "personal_org_id should be updated"

    # Verify org exists in DB
    org_result = await db_session.execute(
        select(Organization).where(Organization.id == org.id)
    )
    found_org = org_result.scalar_one_or_none()
    assert found_org is not None
    assert found_org.owner_id == admin.id
