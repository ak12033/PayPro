import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import database
from app.config import ALLOWED_ORIGINS, ENVIRONMENT, MAX_REQUEST_BYTES
from app.errors import ApiError
from app.routes import ai, assistant

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("paypro-ai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await database.connect()
    try:
        yield
    finally:
        await database.disconnect()


app = FastAPI(
    title="PayPro AI Service",
    # Hide the interactive schema in production: it enumerates every endpoint
    # and its exact request shape for anyone who finds the host.
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if ENVIRONMENT == "production" else "/openapi.json",
    lifespan=lifespan,
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Same 100kb ceiling express.json() applies on the Node backend."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"message": "Request body is too large"})
    return await call_next(request)


# The SPA now calls this service directly, so the browser-facing origin list is
# a real allow-list rather than empty. Credentials are off: authentication is a
# bearer token in the Authorization header, and no cookie is ever sent here —
# which also keeps this service out of the refresh-cookie's blast radius.
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key"],
        max_age=600,
    )


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content=exc.body())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"message": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Keep FastAPI's 422 but add the `message` key every client screen renders.
    The field-level detail stays, minus any echoed input value.
    """
    fields = [".".join(str(part) for part in error.get("loc", ())) for error in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={
            "message": "The request was rejected as invalid.",
            "code": "VALIDATION_ERROR",
            "fields": [field for field in fields if field],
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the detail, return a generic message — never leak internals."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"message": "Internal server error"})


@app.get("/")
def home():
    return {"message": "PayPro AI service"}


@app.get("/health")
def health():
    """Liveness — deliberately does not touch the database."""
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    """Readiness: this service is only useful with the shared database reachable."""
    db_up = await database.is_connected()
    return JSONResponse(
        status_code=200 if db_up else 503,
        content={
            "status": "ready" if db_up else "not_ready",
            "database": "connected" if db_up else "disconnected",
        },
    )


app.include_router(ai.router, prefix="/ai")
app.include_router(assistant.router, prefix="/ai")
