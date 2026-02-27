from fastapi import HTTPException, Request, status
from app.core.redis import redis_client
import structlog

logger = structlog.get_logger()


async def check_rate_limit(
    request: Request, key_prefix: str, max_requests: int, window_seconds: int = 60
):
    client_ip = request.client.host if request.client else "unknown"
    key = f"rate_limit:{key_prefix}:{client_ip}"

    try:
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, window_seconds)

        if current > max_requests:
            logger.warning(
                "rate_limit.exceeded", key=key, current=current, max=max_requests
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
            )
    except HTTPException:
        raise
    except Exception as e:
        # If Redis is down, allow the request through
        logger.error("rate_limit.redis_error", error=str(e))
