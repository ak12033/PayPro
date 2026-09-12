"""
The JWT gate on the browser-facing routes.

The `code` values matter as much as the status: the SPA's axios interceptor only
attempts a silent refresh for TOKEN_EXPIRED and signs the user out for anything
else, so these are part of the contract rather than cosmetic.
"""

import jwt
import pytest
from bson import ObjectId

from app.config import JWT_SECRET
from tests.conftest import USER_ID, make_token

PROTECTED = [
    ("get", "/ai/history", None),
    ("delete", "/ai/history", None),
    ("get", "/ai/insights", None),
    ("post", "/ai/chat", {"query": "hi"}),
]


def _call(client, method, path, body, headers=None):
    kwargs = {"headers": headers} if headers else {}
    if body is not None:
        kwargs["json"] = body
    return client.request(method.upper(), path, **kwargs)


@pytest.fixture
def stub_insights(monkeypatch):
    from app.schemas.ai import InsightsResponse

    async def _fake(prompt, schema, temperature):
        return InsightsResponse(insights=[])

    monkeypatch.setattr("app.services.gemini.generate_structured", _fake)


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_missing_token_is_rejected(client, method, path, body):
    response = _call(client, method, path, body)
    assert response.status_code == 401
    assert response.json()["code"] == "NO_TOKEN"


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_garbage_token_is_rejected(client, method, path, body):
    response = _call(client, method, path, body, {"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_INVALID"


def test_expired_token_asks_the_client_to_refresh(client):
    token = make_token(expires_in=-10)
    response = client.get("/ai/history", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_EXPIRED"


def test_token_signed_with_another_secret_is_rejected(client):
    token = jwt.encode({"id": USER_ID, "tv": 0}, "a-different-secret-entirely", algorithm="HS256")
    response = client.get("/ai/history", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_INVALID"


def test_unsigned_token_is_rejected(client):
    """`alg: none` must never be accepted — algorithms is pinned to HS256."""
    token = jwt.encode({"id": USER_ID, "tv": 0}, key="", algorithm="none")
    response = client.get("/ai/history", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_stale_token_version_is_revoked(client, db):
    db.store["users"] = [{"_id": ObjectId(USER_ID), "tokenVersion": 3}]
    token = make_token(tv=0)

    response = client.get("/ai/history", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_REVOKED"


def test_deleted_user_is_rejected(client, db):
    db.store["users"] = []
    response = client.get("/ai/history", headers={"Authorization": f"Bearer {make_token()}"})
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_INVALID"


def test_valid_token_passes(client, auth_headers):
    response = client.get("/ai/history", headers=auth_headers)
    assert response.status_code == 200


def test_signature_is_verified_not_just_decoded(client):
    """A token whose payload was edited after signing must not pass."""
    good = make_token()
    header, payload, _ = good.split(".")
    forged = jwt.encode({"id": USER_ID, "tv": 0}, JWT_SECRET, algorithm="HS256")
    tampered = f"{header}.{payload}.{forged.split('.')[2]}"

    response = client.get("/ai/history", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401


def test_rate_limit_applies_per_user(client, auth_headers, stub_insights):
    from app.config import AI_RATE_LIMIT

    for _ in range(AI_RATE_LIMIT):
        assert client.get("/ai/insights", headers=auth_headers).status_code == 200

    blocked = client.get("/ai/insights", headers=auth_headers)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMITED"


def test_rate_limit_does_not_apply_to_history(client, auth_headers):
    """Reading stored history costs nothing on the Gemini key."""
    for _ in range(40):
        assert client.get("/ai/history", headers=auth_headers).status_code == 200
