"""
Shared test setup.

These assignments must run BEFORE `app.config` is imported anywhere: that
module calls `sys.exit(1)` when a required variable is absent, which would abort
the whole pytest process rather than fail a test. pytest imports conftest.py
first, so setting them here is enough.

`load_dotenv()` in app/config.py does not override variables that are already
set, so a developer's real .env cannot leak a live API key into the suite.
"""

import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ["GEMINI_API_KEY"] = "test-key-not-a-real-credential"
os.environ["FASTAPI_API_KEY"] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["JWT_SECRET"] = "test-jwt-secret-at-least-32-characters-long"
os.environ["MONGO_URI"] = "mongodb://localhost:27017"

from datetime import UTC, datetime, timedelta  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from bson import ObjectId  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import database  # noqa: E402
from app.config import JWT_ALGORITHM, JWT_SECRET  # noqa: E402
from app.main import app  # noqa: E402

USER_ID = "507f1f77bcf86cd799439011"


class FakeCursor:
    """Just enough of the driver's cursor to satisfy the repositories."""

    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return self._rows[:length] if length else self._rows


class FakeCollection:
    def __init__(self, name, store):
        self.name = name
        self.store = store
        self.calls = []

    def find(self, query=None, projection=None):
        self.calls.append(("find", query))
        return FakeCursor(self.store.get(self.name, []))

    async def find_one(self, query=None, projection=None):
        self.calls.append(("find_one", query))
        rows = self.store.get(self.name, [])
        return rows[0] if rows else None

    async def aggregate(self, pipeline):
        # Awaitable, like the real driver's async aggregate — a synchronous
        # stand-in here hid a missing `await` in the repository.
        self.calls.append(("aggregate", pipeline))
        return FakeCursor(self.store.get(f"{self.name}:aggregate", []))

    async def update_one(self, query, update, upsert=False):
        self.calls.append(("update_one", query, update))

    async def delete_one(self, query):
        self.calls.append(("delete_one", query))


class FakeDatabase:
    def __init__(self, store):
        self.store = store
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection(name, self.store)
        return self.collections[name]


@pytest.fixture
def db(monkeypatch):
    """
    Replace the shared database with an in-memory stand-in.

    Seed it by assigning to `db.store[<collection>]`. The suite never opens a
    real connection, so it stays runnable in CI without a Mongo service.
    """
    store = {"users": [{"_id": ObjectId(USER_ID), "tokenVersion": 0}]}
    fake = FakeDatabase(store)
    monkeypatch.setattr(database, "get_database", lambda: fake)
    fake.store = store
    return fake


@pytest.fixture
def client(db):
    # `lifespan` would open a real connection; the fake database replaces it.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def stub_connection(monkeypatch):
    async def _noop():
        return None

    async def _connected():
        return True

    monkeypatch.setattr(database, "connect", _noop)
    monkeypatch.setattr(database, "disconnect", _noop)
    monkeypatch.setattr(database, "is_connected", _connected)


def make_token(user_id: str = USER_ID, tv: int = 0, expires_in: int = 900) -> str:
    return jwt.encode(
        {
            "id": user_id,
            "email": "user@example.com",
            "tv": tv,
            "exp": datetime.now(UTC) + timedelta(seconds=expires_in),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from app.auth import _limiter

    _limiter._hits.clear()
    yield
    _limiter._hits.clear()
