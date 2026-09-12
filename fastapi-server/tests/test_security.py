"""The shared-secret gate in app/security.py."""

import pytest

from app.schemas.ai import CategorizeResponse

CATEGORIZE_PAYLOAD = {"description": "Dinner", "amount": 420}


async def _fake_generate(prompt, schema, temperature):
    return CategorizeResponse(category="Food", confidence_score=1.0, icon="Utensils")


@pytest.fixture
def with_api_key(monkeypatch):
    """Configure a shared secret, as production does."""
    monkeypatch.setattr("app.security.API_KEY", "s3cret")
    monkeypatch.setattr("app.security.ENVIRONMENT", "production")


def test_request_without_key_is_rejected(client, with_api_key):
    assert client.post("/ai/categorize", json=CATEGORIZE_PAYLOAD).status_code == 401


def test_request_with_wrong_key_is_rejected(client, with_api_key):
    response = client.post(
        "/ai/categorize", json=CATEGORIZE_PAYLOAD, headers={"X-API-Key": "wrong"}
    )
    assert response.status_code == 401


def test_correct_key_passes_the_gate(client, with_api_key, monkeypatch):
    monkeypatch.setattr("app.services.gemini.generate_structured", _fake_generate)

    response = client.post(
        "/ai/categorize", json=CATEGORIZE_PAYLOAD, headers={"X-API-Key": "s3cret"}
    )
    assert response.status_code == 200


def test_production_without_configured_key_fails_closed(client, monkeypatch):
    # config.py refuses to start in this state; if it were ever reached, the
    # gate must not silently allow the request through.
    monkeypatch.setattr("app.security.API_KEY", None)
    monkeypatch.setattr("app.security.ENVIRONMENT", "production")

    assert client.post("/ai/categorize", json=CATEGORIZE_PAYLOAD).status_code == 500


def test_key_is_optional_outside_production(client, monkeypatch):
    monkeypatch.setattr("app.services.gemini.generate_structured", _fake_generate)
    monkeypatch.setattr("app.security.API_KEY", None)
    monkeypatch.setattr("app.security.ENVIRONMENT", "development")

    assert client.post("/ai/categorize", json=CATEGORIZE_PAYLOAD).status_code == 200
