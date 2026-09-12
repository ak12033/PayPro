import logging

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.config import MONGO_DB_NAME, MONGO_URI

logger = logging.getLogger("paypro-ai")

_client: AsyncMongoClient | None = None
_database: AsyncDatabase | None = None


async def connect() -> None:
    """
    Open the pool against the application's existing database.

    Pool and timeout settings mirror server/config/db.js so both services put
    comparable load on the same cluster.
    """
    global _client, _database

    _client = AsyncMongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=10_000,
        socketTimeoutMS=45_000,
        maxPoolSize=20,
        minPoolSize=2,
        tz_aware=True,
        appname="paypro-ai",
    )
    await _client.aconnect()
    await _client.admin.command("ping")
    _database = _client[MONGO_DB_NAME]
    logger.info("Connected to MongoDB database %s", MONGO_DB_NAME)


async def disconnect() -> None:
    global _client, _database
    if _client is not None:
        await _client.aclose()
    _client = None
    _database = None


def get_database() -> AsyncDatabase:
    if _database is None:
        raise RuntimeError("Database is not connected")
    return _database


async def is_connected() -> bool:
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        return False
