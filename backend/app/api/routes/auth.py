import secrets
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.core.rate_limit import check_rate_limit
from app.models.user import User
from app.models.password_reset import PasswordResetToken
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.schemas.invite import PasswordResetRequest, PasswordResetConfirm
from app.services.email import send_password_reset_email
from app.services.org_service import create_personal_org, get_invite_by_token, accept_invite
import structlog

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(
    req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    await check_rate_limit(request, "register", settings.rate_limit_register_per_minute)

    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        display_name=req.display_name,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.flush()

    # Auto-create personal org for every new user
    await create_personal_org(user, db)

    # Accept org invite if provided (silently ignore invalid tokens)
    if req.invite_token:
        try:
            membership = await get_invite_by_token(req.invite_token, db)
            if membership:
                await accept_invite(membership, user, db)
        except Exception:
            # Invalid or expired invite — register still succeeds
            logger.warning("auth.register.invite_ignored", token=req.invite_token)

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    await check_rate_limit(request, "login", settings.rate_limit_login_per_minute)

    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if (
        not user
        or not user.password_hash
        or not verify_password(req.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    req: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.display_name is not None:
        user.display_name = req.display_name
    if req.avatar_url is not None:
        user.avatar_url = req.avatar_url
    if req.onboarding_completed is not None:
        user.onboarding_completed = req.onboarding_completed
    await db.flush()
    return user


@router.post("/forgot-password", status_code=200)
async def forgot_password(
    req: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, "forgot", 3)

    # Always return 200 to prevent email enumeration
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"message": "If that email exists, a reset link has been sent."}

    token = secrets.token_urlsafe(48)
    reset = PasswordResetToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc)
        + timedelta(minutes=settings.reset_token_expire_minutes),
    )
    db.add(reset)
    await db.flush()

    await send_password_reset_email(user.email, token)
    logger.info("auth.reset_requested", email=user.email)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
async def reset_password(
    req: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == req.token)
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if reset_token.used:
        raise HTTPException(status_code=400, detail="Token has already been used")

    if reset_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")

    # Update user password
    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.password_hash = hash_password(req.new_password)
    reset_token.used = True
    await db.flush()

    logger.info("auth.password_reset", email=user.email)
    return {"message": "Password has been reset successfully."}
