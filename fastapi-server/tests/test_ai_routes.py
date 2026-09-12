"""
Server-to-server scoring routes, with the Gemini call stubbed out.

Every test patches `app.services.gemini.generate_structured`, so the suite never
touches the network, never needs a real GEMINI_API_KEY and never bills the
account.
"""


import pytest

from app.schemas.ai import CategorizeResponse, FraudCheckResponse


@pytest.fixture
def stub_generate(monkeypatch):
    """Replace the Gemini call with a canned result or an exception."""

    def _install(result=None, raises=None):
        async def _fake(prompt, schema, temperature):
            if raises is not None:
                raise raises
            return result

        monkeypatch.setattr("app.services.gemini.generate_structured", _fake)

    return _install


# -- Happy paths -------------------------------------------------------------

def test_categorize_returns_model_output(client, stub_generate):
    stub_generate(CategorizeResponse(category="Food", confidence_score=0.93, icon="Utensils"))

    response = client.post("/ai/categorize", json={"description": "Dinner", "amount": 420})

    assert response.status_code == 200
    assert response.json() == {"category": "Food", "confidence_score": 0.93, "icon": "Utensils"}


def test_fraud_check_returns_model_output(client, stub_generate):
    stub_generate(FraudCheckResponse(risk_score=71, risk_level="high", reason="Unusual amount"))

    response = client.post(
        "/ai/fraud-check",
        json={
            "new_transaction": {
                "description": "Transfer",
                "amount": 90000,
                "type": "debit",
                "category": "P2P",
            },
            "history": [
                {"description": "Coffee", "amount": 150, "type": "debit", "category": "Food"}
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["risk_level"] == "high"


# -- Fallbacks: an AI outage must not surface as a 500 to the Node backend ----

@pytest.mark.parametrize("failure", [TimeoutError(), ValueError("no schema-valid content")])
def test_categorize_falls_back(client, stub_generate, failure):
    stub_generate(raises=failure)

    response = client.post("/ai/categorize", json={"description": "Dinner", "amount": 420})

    assert response.status_code == 200
    assert response.json()["category"] == "Others"
    assert response.json()["confidence_score"] == 0.0


def test_fraud_check_fails_open(client, stub_generate):
    stub_generate(raises=TimeoutError())

    response = client.post(
        "/ai/fraud-check",
        json={
            "new_transaction": {"description": "Transfer", "amount": 90000, "type": "debit"},
            "history": [],
        },
    )

    # Deliberate: blocking every payment during an AI outage is the worse
    # failure for a wallet. See the comment in app/services/scoring.py.
    assert response.status_code == 200
    assert response.json()["risk_level"] == "low"


# -- Validation --------------------------------------------------------------

@pytest.mark.parametrize(
    "payload",
    [
        {"description": "", "amount": 10},          # min_length=1
        {"description": "x" * 501, "amount": 10},   # max_length=500
        {"description": "ok", "amount": -1},        # ge=0
        {"amount": 10},                             # missing field
    ],
)
def test_categorize_rejects_bad_input(client, payload):
    assert client.post("/ai/categorize", json=payload).status_code == 422


def test_fraud_check_rejects_oversized_history(client):
    payload = {
        "new_transaction": {"description": "Transfer", "amount": 1, "type": "debit"},
        "history": [{"description": "x", "amount": 1, "type": "debit"}] * 51,
    }
    assert client.post("/ai/fraud-check", json=payload).status_code == 422


def test_validation_errors_carry_a_message(client):
    """Every client screen renders `data.message`; FastAPI's default has none."""
    body = client.post("/ai/categorize", json={"amount": 10}).json()
    assert body["message"]
    assert body["code"] == "VALIDATION_ERROR"


def test_oversized_body_is_rejected(client):
    response = client.post(
        "/ai/categorize",
        content=b"x" * 200_000,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_risk_level_is_normalised():
    # The model sometimes answers "High"; the Node side writes this straight
    # into a Mongoose enum, so it must be lowercased before it leaves here.
    assert FraudCheckResponse(risk_score=5, risk_level="  High ", reason="x").risk_level == "high"
