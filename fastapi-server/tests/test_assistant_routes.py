"""The browser-facing routes: chat, history and insights."""

from datetime import UTC, datetime

import pytest
from bson import ObjectId

from app.schemas.ai import InsightItem, InsightsResponse
from app.services import assistant
from tests.conftest import USER_ID


@pytest.fixture
def stub_generate(monkeypatch):
    def _install(result=None, raises=None):
        async def _fake(prompt, schema, temperature):
            if raises is not None:
                raise raises
            return result

        monkeypatch.setattr("app.services.gemini.generate_structured", _fake)

    return _install


@pytest.fixture
def stub_chat(monkeypatch):
    def _install(reply=None, raises=None):
        async def _fake(user_id, query, path):
            if raises is not None:
                raise raises
            _fake.seen = (user_id, query, path)
            return reply

        monkeypatch.setattr("app.services.assistant.chat", _fake)
        return _fake

    return _install


# -- Insights ----------------------------------------------------------------

def test_insights_returns_model_output(client, auth_headers, stub_generate):
    stub_generate(
        InsightsResponse(
            insights=[InsightItem(title="Rising spend", description="Up 20%", type="trend")]
        )
    )

    response = client.get("/ai/insights", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "insights": [{"title": "Rising spend", "description": "Up 20%", "type": "trend"}]
    }


def test_insights_falls_back_to_empty(client, auth_headers, stub_generate):
    stub_generate(raises=RuntimeError("boom"))

    response = client.get("/ai/insights", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["insights"] == []


def test_insights_reads_only_the_callers_transactions(client, auth_headers, db, stub_generate):
    stub_generate(InsightsResponse(insights=[]))

    client.get("/ai/insights", headers=auth_headers)

    finds = [call for call in db["transactions"].calls if call[0] == "find"]
    assert finds
    assert finds[0][1] == {"userId": ObjectId(USER_ID)}


# -- Chat --------------------------------------------------------------------

def test_chat_returns_the_reply(client, auth_headers, stub_chat):
    fake = stub_chat(reply="You spent 1,200 on food.")

    response = client.post(
        "/ai/chat", json={"query": "How much on food?", "path": "/insights"}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json() == {"response": "You spent 1,200 on food."}
    assert fake.seen == (ObjectId(USER_ID), "How much on food?", "/insights")


def test_chat_reports_an_ai_outage_as_503(client, auth_headers, stub_chat):
    stub_chat(raises=RuntimeError("gemini down"))

    response = client.post("/ai/chat", json={"query": "hi"}, headers=auth_headers)

    assert response.status_code == 503
    assert "too long" in response.json()["message"]


def test_chat_never_leaks_internal_detail(client, auth_headers, stub_chat):
    stub_chat(raises=RuntimeError("mongodb://user:password@cluster"))

    body = client.post("/ai/chat", json={"query": "hi"}, headers=auth_headers).json()

    assert "mongodb" not in str(body)


@pytest.mark.parametrize(
    "payload",
    [
        {"query": ""},
        {"query": "x" * 2001},
        {},
        {"query": "ok", "path": "x" * 201},
    ],
)
def test_chat_rejects_bad_input(client, auth_headers, payload):
    assert client.post("/ai/chat", json=payload, headers=auth_headers).status_code == 422


# -- History -----------------------------------------------------------------

def test_history_returns_stored_messages(client, auth_headers, db):
    db.store["chatsessions"] = [
        {
            "messages": [
                {"sender": "user", "text": "hi", "createdAt": datetime.now(UTC)},
                {"sender": "ai", "text": "hello", "createdAt": datetime.now(UTC)},
            ]
        }
    ]

    response = client.get("/ai/history", headers=auth_headers)

    assert response.status_code == 200
    messages = response.json()["messages"]
    assert [m["sender"] for m in messages] == ["user", "ai"]
    assert messages[0]["text"] == "hi"


def test_history_is_empty_for_a_new_user(client, auth_headers):
    assert client.get("/ai/history", headers=auth_headers).json() == {"messages": []}


def test_clear_history_is_scoped_to_the_caller(client, auth_headers, db):
    response = client.delete("/ai/history", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"message": "Chat history cleared successfully", "messages": []}
    assert ("delete_one", {"userId": ObjectId(USER_ID)}) in db["chatsessions"].calls


# -- Tool execution ----------------------------------------------------------

@pytest.mark.asyncio
async def test_tools_always_use_the_authenticated_id(db):
    user_id = ObjectId(USER_ID)
    db.store["users"] = [{"_id": user_id, "accountBalance": 250.5}]

    result = await assistant.execute_tool(user_id, "getWalletBalance", {})
    assert result == {"balance": 250.5}

    await assistant.execute_tool(user_id, "getTransactions", {"limit": 999, "type": "Debit"})
    find = next(call for call in db["transactions"].calls if call[0] == "find")
    assert find[1] == {"userId": user_id, "type": "Debit"}


@pytest.mark.asyncio
async def test_spending_analytics_is_aggregated_in_the_database(db):
    """The totals must come back from one pipeline, not a full collection scan."""
    user_id = ObjectId(USER_ID)
    db.store["transactions:aggregate"] = [
        {"totalSent": 5400, "totalReceived": 100, "totalAdded": 10000, "totalTransactions": 7}
    ]

    result = await assistant.execute_tool(user_id, "getSpendingAnalytics", {})

    assert result["totalSent"] == 5400
    assert result["totalTransactions"] == 7
    stage = db["transactions"].calls[0]
    assert stage[0] == "aggregate"
    assert stage[1][0] == {"$match": {"userId": user_id}}


@pytest.mark.asyncio
async def test_spending_analytics_with_no_transactions(db):
    result = await assistant.execute_tool(ObjectId(USER_ID), "getSpendingAnalytics", {})
    assert result == {
        "totalSent": 0,
        "totalReceived": 0,
        "totalAdded": 0,
        "totalTransactions": 0,
    }


@pytest.mark.asyncio
async def test_unknown_tool_is_refused(db):
    with pytest.raises(ValueError):
        await assistant.execute_tool(ObjectId(USER_ID), "dropDatabase", {})


def test_bson_values_are_made_json_safe():
    payload = {"id": ObjectId(USER_ID), "at": datetime(2026, 1, 2, tzinfo=UTC), "rows": [{"n": 1}]}
    safe = assistant._jsonable(payload)

    assert safe["id"] == USER_ID
    assert safe["at"].startswith("2026-01-02")
    assert safe["rows"] == [{"n": 1}]


def test_history_window_starts_on_a_user_turn():
    """Gemini rejects a history that opens with a model turn."""
    contents = assistant._history_contents(
        [{"sender": "ai", "text": "orphan"}, {"sender": "user", "text": "hi"}]
    )
    assert [c.role for c in contents] == ["user"]


def test_history_with_no_user_turn_is_dropped():
    assert assistant._history_contents([{"sender": "ai", "text": "orphan"}]) == []
