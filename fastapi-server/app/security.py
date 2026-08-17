import secrets

from fastapi import Header, HTTPException, status

from app.config import API_KEY, ENVIRONMENT


async def require_api_key(x_api_key: str | None = Header(default=None)):
    """
    Shared-secret gate for every AI endpoint.

    This service previously had no authentication of any kind. Anyone who could
    reach its URL — and it must be reachable by the Node backend, so in a real
    deployment that is anyone who finds the host — could call /ai/assistant in a
    loop and bill unlimited Gemini usage to our API key, or use it as a free
    general-purpose LLM proxy.

    `compare_digest` avoids leaking the secret's prefix through response timing.
    """
    if not API_KEY:
        # Development convenience only; config.py hard-fails in production.
        if ENVIRONMENT != "production":
            return
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service is not configured for authentication",
        )

    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
