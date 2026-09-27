"""plan.md §39.2: error tracking with PII scrubbing (app/observability.py)."""

import logging

import sentry_sdk
from sentry_sdk.transport import Transport

from app.observability import init_error_tracking, scrub_event, scrub_string


def test_disabled_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert init_error_tracking("test") is False


def test_scrub_string_masks_email_ip_and_rupees():
    assert scrub_string("a.b+c@example.co.in paid ₹1,250.50 from 203.0.113.9") == (
        "[email] paid ₹[amount] from [ip]"
    )
    assert scrub_string(None) is None


def test_scrub_event_filters_sensitive_keys_and_keeps_the_rest():
    event = scrub_event(
        {
            "extra": {
                "orderId": "order_1",
                "amount": 500,
                "balance": 10.5,
                "prompt": "what did I spend at Zomato?",
                "nested": {"email": "a@b.co", "path": "/ai/insights"},
            },
            "user": {"id": "u1", "email": "a@b.co", "ip_address": "10.0.0.1"},
        }
    )
    assert event["extra"] == {
        "orderId": "order_1",
        "amount": "[Filtered]",
        "balance": "[Filtered]",
        "prompt": "[Filtered]",
        "nested": {"email": "[Filtered]", "path": "/ai/insights"},
    }
    assert event["user"] == {"id": "u1"}


def test_scrub_event_drops_request_body_query_and_identifying_headers():
    event = scrub_event(
        {
            "request": {
                "method": "POST",
                "url": "https://ai.example.com/ai/assistant?q=a@b.co",
                "data": {"message": "my balance?"},
                "query_string": "q=a@b.co",
                "headers": {"user-agent": "UA", "authorization": "Bearer x", "x-api-key": "k"},
            }
        }
    )
    assert event["request"] == {
        "method": "POST",
        "url": "https://ai.example.com/ai/assistant",
        "headers": {"user-agent": "UA"},
    }


def test_scrub_event_strips_frame_locals_and_raw_log_params():
    event = scrub_event(
        {
            "logentry": {"message": "spent %s", "params": ["₹900"], "formatted": "spent ₹900"},
            "exception": {
                "values": [
                    {
                        "value": "bad amount ₹12",
                        "stacktrace": {"frames": [{"function": "f", "vars": {"prompt": "secret"}}]},
                    }
                ]
            },
        }
    )
    assert event["logentry"] == {"message": "spent ₹[amount]"}
    value = event["exception"]["values"][0]
    assert value["value"] == "bad amount ₹[amount]"
    assert value["stacktrace"]["frames"] == [{"function": "f"}]


class _CaptureTransport(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(item.payload.json)


def test_logger_error_reaches_sentry_scrubbed(monkeypatch):
    """The real SDK path: logging integration -> before_send -> transport."""
    monkeypatch.setenv("SENTRY_DSN", "https://public@o0.ingest.sentry.io/0")
    transport = _CaptureTransport()
    real_init = sentry_sdk.init
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: real_init(transport=transport, **kw))
    try:
        assert init_error_tracking("test") is True
        logging.getLogger("paypro-ai").error("Scoring failed for bob@example.com on ₹500")
        sentry_sdk.flush()

        assert len(transport.events) == 1
        event = transport.events[0]
        assert event["logentry"]["message"] == "Scoring failed for [email] on ₹[amount]"
    finally:
        sentry_sdk.init()  # reset to a disabled client for the rest of the suite
