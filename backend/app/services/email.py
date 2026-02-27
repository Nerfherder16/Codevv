import structlog
from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


async def send_invite_email(
    to: str, project_name: str, inviter_name: str, token: str
) -> bool:
    if not settings.resend_api_key:
        logger.info("email.skip", reason="no resend_api_key", to=to, token=token)
        return False

    import resend

    resend.api_key = settings.resend_api_key

    accept_url = f"{settings.frontend_url}/invite/{token}"
    html = f"""
    <div style="background:#0f0d1a;color:#e5e7eb;font-family:system-ui;padding:40px;max-width:500px;margin:0 auto">
      <h2 style="color:#38bdf8;margin:0 0 8px">You're invited to Codevv</h2>
      <p style="color:#9ca3af;margin:0 0 24px">{inviter_name} invited you to join <strong style="color:#e5e7eb">{project_name}</strong></p>
      <a href="{accept_url}" style="display:inline-block;background:#38bdf8;color:#0f0d1a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Accept Invite</a>
      <p style="color:#4b5563;font-size:12px;margin:24px 0 0">This invite expires in 72 hours.</p>
    </div>
    """
    try:
        resend.Emails.send(
            {
                "from": settings.from_email,
                "to": [to],
                "subject": f"Join {project_name} on Codevv",
                "html": html,
            }
        )
        logger.info("email.sent", type="invite", to=to)
        return True
    except Exception as e:
        logger.error("email.failed", type="invite", to=to, error=str(e))
        return False


async def send_password_reset_email(to: str, token: str) -> bool:
    if not settings.resend_api_key:
        logger.info("email.skip", reason="no resend_api_key", to=to, token=token)
        return False

    import resend

    resend.api_key = settings.resend_api_key

    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    html = f"""
    <div style="background:#0f0d1a;color:#e5e7eb;font-family:system-ui;padding:40px;max-width:500px;margin:0 auto">
      <h2 style="color:#38bdf8;margin:0 0 8px">Reset your password</h2>
      <p style="color:#9ca3af;margin:0 0 24px">Click below to set a new password for your Codevv account.</p>
      <a href="{reset_url}" style="display:inline-block;background:#38bdf8;color:#0f0d1a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
      <p style="color:#4b5563;font-size:12px;margin:24px 0 0">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
    </div>
    """
    try:
        resend.Emails.send(
            {
                "from": settings.from_email,
                "to": [to],
                "subject": "Reset your Codevv password",
                "html": html,
            }
        )
        logger.info("email.sent", type="reset", to=to)
        return True
    except Exception as e:
        logger.error("email.failed", type="reset", to=to, error=str(e))
        return False
