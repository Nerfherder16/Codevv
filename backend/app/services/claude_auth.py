"""OAuth credential manager for Anthropic API — Redis-backed PKCE for multi-worker Docker."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.claude_credential import ClaudeCredential

logger = structlog.get_logger()

# Constants (from Claude Code VS Code extension v2.1.42)
_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
_SCOPES = [
    "user:profile",
    "user:inference",
    "user:sessions:claude_code",
    "user:mcp_servers",
]
_OAUTH_BETA_HEADER = "oauth-2025-04-20"
_REFRESH_BUFFER_MS = 60_000  # Refresh 60s before expiry
_PKCE_TTL = 300  # 5 minutes


def get_beta_header() -> str:
    return _OAUTH_BETA_HEADER


async def _get_redis():
    """Get an async Redis connection."""
    import redis.asyncio as aioredis

    settings = get_settings()
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def start_login(user_id: str) -> dict:
    """Start PKCE OAuth flow. Stores PKCE state in Redis with 5min TTL."""
    settings = get_settings()

    # Generate PKCE code verifier (32 random bytes, base64url-encoded)
    verifier = secrets.token_bytes(32)
    verifier_b64 = base64.urlsafe_b64encode(verifier).rstrip(b"=").decode("ascii")

    # Generate code challenge (SHA-256 of verifier, base64url-encoded)
    challenge = hashlib.sha256(verifier_b64.encode("ascii")).digest()
    challenge_b64 = base64.urlsafe_b64encode(challenge).rstrip(b"=").decode("ascii")

    # Random state
    state = secrets.token_urlsafe(32)

    # Determine callback URL — must be localhost:8000 (Anthropic's allowlist for this client ID)
    callback_url = settings.claude_oauth_callback_url
    if not callback_url:
        callback_url = "http://localhost:8000/api/auth/claude-callback"

    # Store in Redis with TTL
    r = await _get_redis()
    pkce_data = json.dumps(
        {
            "verifier": verifier_b64,
            "redirect_uri": callback_url,
            "user_id": user_id,
        }
    )
    await r.set(f"claude_pkce:{state}", pkce_data, ex=_PKCE_TTL)
    await r.aclose()

    params = urlencode(
        {
            "code": "true",
            "client_id": _CLIENT_ID,
            "response_type": "code",
            "scope": " ".join(_SCOPES),
            "code_challenge": challenge_b64,
            "code_challenge_method": "S256",
            "state": state,
            "redirect_uri": callback_url,
        }
    )
    auth_url = f"{_AUTHORIZE_URL}?{params}"

    return {"auth_url": auth_url, "state": state}


async def handle_callback(code: str, state: str, db: AsyncSession) -> dict:
    """Exchange authorization code for tokens. Upserts ClaudeCredential row."""
    import uuid as uuid_mod

    r = await _get_redis()
    raw = await r.get(f"claude_pkce:{state}")
    await r.delete(f"claude_pkce:{state}")
    await r.aclose()

    if not raw:
        raise ValueError("Invalid or expired state parameter")

    pkce = json.loads(raw)
    verifier = pkce["verifier"]
    redirect_uri = pkce["redirect_uri"]
    user_id = pkce["user_id"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": _CLIENT_ID,
                "code_verifier": verifier,
                "state": state,
            },
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        token_data = resp.json()

    expires_in = token_data.get("expires_in", 3600)
    expires_at = int(time.time() * 1000) + (expires_in * 1000)
    scopes_str = token_data.get("scope", " ".join(_SCOPES))

    # Upsert credential
    uid = uuid_mod.UUID(user_id)
    result = await db.execute(
        select(ClaudeCredential).where(ClaudeCredential.user_id == uid)
    )
    cred = result.scalar_one_or_none()

    if cred:
        cred.access_token = token_data["access_token"]
        cred.refresh_token = token_data.get("refresh_token", "")
        cred.expires_at = expires_at
        cred.scopes = scopes_str
        cred.subscription_type = token_data.get("subscription_type")
        cred.rate_limit_tier = token_data.get("rate_limit_tier")
    else:
        cred = ClaudeCredential(
            user_id=uid,
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token", ""),
            expires_at=expires_at,
            scopes=scopes_str,
            subscription_type=token_data.get("subscription_type"),
            rate_limit_tier=token_data.get("rate_limit_tier"),
        )
        db.add(cred)

    await db.flush()
    logger.info(
        "claude_auth.login_complete",
        user_id=user_id,
        subscription=cred.subscription_type,
    )
    return {"success": True, "subscription": cred.subscription_type}


async def get_access_token(user_id, db: AsyncSession) -> str:
    """Return a valid access token for a user, refreshing if expired."""
    import uuid as uuid_mod

    uid = user_id if isinstance(user_id, uuid_mod.UUID) else uuid_mod.UUID(str(user_id))
    result = await db.execute(
        select(ClaudeCredential).where(ClaudeCredential.user_id == uid)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise RuntimeError("No Claude credentials found. Please log in first.")

    now_ms = int(time.time() * 1000)

    # Token still valid?
    if cred.access_token and cred.expires_at > now_ms + _REFRESH_BUFFER_MS:
        return cred.access_token

    # Refresh
    if not cred.refresh_token:
        raise RuntimeError("No refresh token available. Please log in again.")

    logger.info("claude_auth.refreshing_token", user_id=str(uid))
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _TOKEN_URL,
            json={
                "grant_type": "refresh_token",
                "refresh_token": cred.refresh_token,
                "client_id": _CLIENT_ID,
                "scope": " ".join(_SCOPES),
            },
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        token_data = resp.json()

    cred.access_token = token_data.get("access_token", cred.access_token)
    cred.refresh_token = token_data.get("refresh_token", cred.refresh_token)
    expires_in = token_data.get("expires_in", 3600)
    cred.expires_at = int(time.time() * 1000) + (expires_in * 1000)
    if token_data.get("scope"):
        cred.scopes = token_data["scope"]
    await db.flush()

    logger.info("claude_auth.token_refreshed", expires_in=expires_in)
    return cred.access_token


async def get_status(user_id, db: AsyncSession) -> dict:
    """Return auth status info for a user."""
    import uuid as uuid_mod

    uid = user_id if isinstance(user_id, uuid_mod.UUID) else uuid_mod.UUID(str(user_id))
    result = await db.execute(
        select(ClaudeCredential).where(ClaudeCredential.user_id == uid)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return {"authenticated": False}

    now_ms = int(time.time() * 1000)
    return {
        "authenticated": True,
        "subscription": cred.subscription_type or "unknown",
        "rate_limit_tier": cred.rate_limit_tier or "unknown",
        "expires_at": cred.expires_at,
        "expired": cred.expires_at <= now_ms,
        "scopes": cred.scopes.split(" ") if cred.scopes else [],
    }
