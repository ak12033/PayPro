import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import ai
from app.config import ALLOWED_ORIGINS, ENVIRONMENT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("paypro-ai")

app = FastAPI(
    title="PayPro AI Service",
    # Hide the interactive schema in production: it enumerates every endpoint
    # and its exact request shape for anyone who finds the host.
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if ENVIRONMENT == "production" else "/openapi.json",
)

# There was no CORS configuration at all. This service is called
# server-to-server by the Node backend, so the browser-facing origin list is
# empty by default rather than wide open.
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the detail, return a generic message — never leak internals."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def home():
    return {"message": "PayPro AI service"}


@app.get("/health")
def health():
    """Liveness probe for the Node client and any load balancer."""
    return {"status": "ok"}


app.include_router(ai.router, prefix="/ai")
