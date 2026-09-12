import secrets

from fastapi import Header

from app.config import API_KEY, ENVIRONMENT
from app.errors import ApiError


async def require_api_key(x_api_key: str | None = Header(default=None)):
    """
    Shared-secret gate for the server-to-server endpoints.

    Without it, anyone who can reach this service's URL could call it in a loop
    and bill unlimited Gemini usage to our API key, or use it as a free
    general-purpose LLM proxy.

    `compare_digest` avoids leaking the secret's prefix through response timing.
    """
    if not API_KEY:
        # Development convenience only; config.py hard-fails in production.
        if ENVIRONMENT != "production":
            return
        raise ApiError(500, "Service is not configured for authentication")

    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise ApiError(401, "Invalid or missing API key", "INVALID_API_KEY")
