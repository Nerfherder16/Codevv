"""
Test configuration for Codevv backend.
Uses the real database with per-test cleanup via tracking created records.
"""
import asyncio
import uuid
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import get_settings

settings = get_settings()
TEST_DB_URL = settings.database_url


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """
    Provide a real async DB session per test.
    Since org_service.create_org commits internally, we can't use nested transactions.
    Tests must clean up their own data or accept that test data persists in the dev DB.
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """
    Provide an HTTPX AsyncClient with the app, with the DB dependency overridden
    to use our test session.
    """
    from app.main import app
    from app.core.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_db, None)


def make_email():
    """Generate a unique test email."""
    return f"test-{uuid.uuid4().hex[:8]}@example.com"
