import os
import sys
from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Shared secret with the Node backend. See app/security.py.
API_KEY = os.getenv("FASTAPI_API_KEY")

# Comma-separated list of origins allowed to call this service directly.
# Normally empty: only the Node backend should talk to it, server-to-server.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if not GEMINI_API_KEY:
    # Previously genai.Client(api_key=None) constructed successfully and only
    # failed later, per request, deep inside the SDK — so the service looked
    # healthy while every AI call silently fell back to its error default.
    print("FATAL: GEMINI_API_KEY is not set.", file=sys.stderr)
    sys.exit(1)

if ENVIRONMENT == "production" and not API_KEY:
    print("FATAL: FASTAPI_API_KEY must be set in production.", file=sys.stderr)
    sys.exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)
