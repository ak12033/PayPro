"""Liveness, readiness and route registration — no Gemini calls involved."""


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "PayPro AI service"}


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_reports_the_database(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_all_ai_routes_are_registered(client):
    paths = set(client.get("/openapi.json").json()["paths"])
    assert {
        "/ai/categorize",
        "/ai/fraud-check",
        "/ai/chat",
        "/ai/history",
        "/ai/insights",
    } <= paths


def test_obsolete_routes_are_gone(client):
    """`/ai/assistant` and the POST form of `/ai/insights` had no callers left."""
    paths = client.get("/openapi.json").json()["paths"]
    assert "/ai/assistant" not in paths
    assert "post" not in paths["/ai/insights"]


def test_docs_exposed_outside_production(client):
    # ENVIRONMENT is "test" here, so the schema should be reachable.
    assert client.get("/openapi.json").status_code == 200


def test_cors_allows_the_configured_origin(client):
    response = client.options(
        "/ai/insights",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    # Bearer tokens, not cookies — credentials stay off.
    assert "access-control-allow-credentials" not in response.headers


def test_cors_rejects_an_unknown_origin(client):
    response = client.options(
        "/ai/insights",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers
