import os
import sys

from dotenv import load_dotenv

# ENV_FILE lets the env file live outside the source tree (plan.md §4.13).
# Unset, python-dotenv finds `.env` exactly as before. Set in the process
# environment, not inside a .env file — it decides which file is read.
_env_file = os.getenv("ENV_FILE")
if _env_file and not os.path.isfile(_env_file):
    print(f"FATAL: ENV_FILE={_env_file} does not exist.", file=sys.stderr)
    sys.exit(1)
load_dotenv(_env_file or None)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Shared secret with the Node backend, for the two server-to-server endpoints it
# still calls during money movement. See app/security.py.
API_KEY = os.getenv("FASTAPI_API_KEY")

# The same secret the Node backend signs access tokens with. The browser now
# calls this service directly and presents the very same bearer token, so this
# service verifies it locally rather than asking Node to vouch for it.
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

# The application's existing database. Node appends /PayPro to its own URI; we
# select the database explicitly instead, which reaches the same place without
# depending on the URI carrying (or not carrying) a path segment.
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "PayPro")

# Browser origins allowed to call this service. Mirrors the Node backend's
# CORS_ORIGIN: a permissive local default, mandatory in production.
_DEFAULT_ORIGINS = "" if ENVIRONMENT == "production" else "http://localhost:5173"

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

# Per-user ceiling on browser-facing AI calls, matching the Node aiLimiter this
# service replaces (25 requests / 5 minutes).
AI_RATE_LIMIT = int(os.getenv("AI_RATE_LIMIT", "25"))
AI_RATE_WINDOW_S = int(os.getenv("AI_RATE_WINDOW_S", "300"))

# Node caps request bodies at 100kb; keep the same ceiling now that the browser
# posts here directly.
MAX_REQUEST_BYTES = int(os.getenv("MAX_REQUEST_BYTES", str(100 * 1024)))


def _fatal(message: str) -> None:
    print(f"FATAL: {message}", file=sys.stderr)
    sys.exit(1)


if not GEMINI_API_KEY:
    # Previously genai.Client(api_key=None) constructed successfully and only
    # failed later, per request, deep inside the SDK — so the service looked
    # healthy while every AI call silently fell back to its error default.
    _fatal("GEMINI_API_KEY is not set.")

if not JWT_SECRET:
    _fatal("JWT_SECRET is not set. It must match the Node backend's JWT_SECRET.")

if not MONGO_URI:
    _fatal("MONGO_URI is not set.")

if ENVIRONMENT == "production":
    if not API_KEY:
        _fatal("FASTAPI_API_KEY must be set in production.")
    if not ALLOWED_ORIGINS:
        _fatal("ALLOWED_ORIGINS must list the frontend origin(s) in production.")
