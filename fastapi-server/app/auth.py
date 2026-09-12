import jwt
from bson import ObjectId
from fastapi import Request
from pydantic import BaseModel

from app.config import AI_RATE_LIMIT, AI_RATE_WINDOW_S, JWT_ALGORITHM, JWT_SECRET
from app.errors import AuthError
from app.ratelimit import RateLimiter
from app.repositories import users as user_repo

_limiter = RateLimiter(AI_RATE_LIMIT, AI_RATE_WINDOW_S)


class CurrentUser(BaseModel):
    id: str
    email: str | None = None

    @property
    def oid(self) -> ObjectId:
        return ObjectId(self.id)


async def require_user(request: Request) -> CurrentUser:
    """
    Verify the access token the SPA already holds.

    Deliberately identical in behaviour to server/middlewares/authMiddleware.js,
    including the distinct `code` values: the browser's axios interceptor only
    attempts a silent refresh for TOKEN_EXPIRED and signs the user out for
    anything else, so an approximation here would either loop or end sessions
    early.

    `algorithms` is pinned to the one algorithm we sign with — accepting the
    token's own `alg` header is how HS/none confusion attacks get in.
    """
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        raise AuthError("Unauthorized", "NO_TOKEN")

    token = header[7:].strip()
    if not token:
        raise AuthError("Unauthorized", "NO_TOKEN")

    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AuthError("Token expired", "TOKEN_EXPIRED") from None
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token", "TOKEN_INVALID") from None

    user_id = claims.get("id")
    if not isinstance(user_id, str) or not ObjectId.is_valid(user_id):
        raise AuthError("Invalid token", "TOKEN_INVALID")

    stored = await user_repo.find_token_version(ObjectId(user_id))
    if stored is None:
        raise AuthError("Invalid token", "TOKEN_INVALID")

    # Honours a password change / "log out everywhere" without waiting out the
    # token's 15-minute expiry.
    if int(claims.get("tv") or 0) != int(stored.get("tokenVersion") or 0):
        raise AuthError("Session revoked", "TOKEN_REVOKED")

    email = claims.get("email")
    return CurrentUser(id=user_id, email=email if isinstance(email, str) else None)


async def require_user_within_rate_limit(request: Request) -> CurrentUser:
    user = await require_user(request)
    _limiter.check(user.id)
    return user
