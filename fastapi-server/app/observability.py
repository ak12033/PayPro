"""
Error tracking (plan.md §39.2): Sentry, with PII scrubbing.

Off unless SENTRY_DSN is set; `sentry_sdk` is not even imported otherwise, so
tests and a deployment without an account behave exactly as before.

When on, the SDK's default logging integration turns every `logger.error` /
`logger.exception` into an event — the same contract as the Node API, where
every `logger.error` is forwarded — and the FastAPI integration reports
unhandled exceptions. Nothing is sent before `scrub_event` has removed money
amounts, balances, emails, IP addresses and credentials (§39.3), and
`send_default_pii` stays off, so request bodies, cookies and the client IP are
never attached in the first place. That matters doubly here: this service
handles AI prompts built from the user's own transaction history.
"""

import logging
import os
import re
from typing import Any

logger = logging.getLogger("paypro-ai")

# Broader than a log redaction list on purpose: this data leaves our
# infrastructure. Mirrors server/utils/errorTracking.js.
_SENSITIVE_KEY = re.compile(
    r"pass(word)?|secret|token|otp|authori[sz]ation|cookie|signature|api[-_]?key|fcm|firebase"
    r"|amount|balance|email|^ip$|ip_?address|forwarded|real-ip|phone|card|upi|account[-_]?number"
    r"|prompt|history|description",
    re.IGNORECASE,
)
_EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_RUPEES = re.compile(r"₹\s?[\d,]+(?:\.\d+)?")
_DROPPED_HEADERS = re.compile(
    r"^(authorization|cookie|set-cookie|x-csrf-token|x-api-key|x-forwarded-for|x-real-ip"
    r"|cf-connecting-ip|true-client-ip)$",
    re.IGNORECASE,
)


def scrub_string(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    return _RUPEES.sub("₹[amount]", _IPV4.sub("[ip]", _EMAIL.sub("[email]", value)))


def _scrub_value(value: Any, depth: int = 0) -> Any:
    if isinstance(value, str):
        return scrub_string(value)
    if depth > 6:
        return value
    if isinstance(value, dict):
        return {
            key: "[Filtered]" if _SENSITIVE_KEY.search(str(key)) else _scrub_value(val, depth + 1)
            for key, val in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_scrub_value(v, depth + 1) for v in value]
    return value


def scrub_event(event: dict, _hint: Any = None) -> dict:
    """Strip PII from a Sentry event. Pure; exported for tests."""
    event = dict(event)

    user = event.get("user")
    if user is not None:
        event["user"] = {"id": str(user["id"])} if user.get("id") else None

    request = event.get("request")
    if request is not None:
        url = request.get("url")
        headers = request.get("headers") or {}
        event["request"] = {
            "method": request.get("method"),
            # The query string can carry user-entered text.
            "url": url.split("?")[0] if isinstance(url, str) else url,
            "headers": {k: v for k, v in headers.items() if not _DROPPED_HEADERS.match(str(k))},
        }

    if "message" in event:
        event["message"] = scrub_string(event["message"])
    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        # The formatted message only: `params` can hold the raw values.
        event["logentry"] = {
            "message": scrub_string(logentry.get("formatted") or logentry.get("message"))
        }

    exception = event.get("exception")
    if isinstance(exception, dict) and isinstance(exception.get("values"), list):
        values = []
        for item in exception["values"]:
            item = dict(item)
            item["value"] = scrub_string(item.get("value"))
            # Frame locals would carry prompt text and amounts verbatim.
            stack = item.get("stacktrace")
            if isinstance(stack, dict) and isinstance(stack.get("frames"), list):
                item["stacktrace"] = {
                    **stack,
                    "frames": [
                        {k: v for k, v in f.items() if k != "vars"} for f in stack["frames"]
                    ],
                }
            values.append(item)
        event["exception"] = {**exception, "values": values}

    for key in ("extra", "contexts", "tags"):
        if key in event:
            event[key] = _scrub_value(event[key])

    breadcrumbs = event.get("breadcrumbs")
    if isinstance(breadcrumbs, dict) and isinstance(breadcrumbs.get("values"), list):
        event["breadcrumbs"] = {
            **breadcrumbs,
            "values": [scrub_breadcrumb(b) for b in breadcrumbs["values"]],
        }
    elif isinstance(breadcrumbs, list):
        event["breadcrumbs"] = [scrub_breadcrumb(b) for b in breadcrumbs]
    return event


def scrub_breadcrumb(crumb: dict, _hint: Any = None) -> dict:
    crumb = dict(crumb)
    crumb["message"] = scrub_string(crumb.get("message"))
    if isinstance(crumb.get("data"), dict):
        crumb["data"] = _scrub_value(crumb["data"])
    return crumb


def init_error_tracking(environment: str) -> bool:
    """Start Sentry if SENTRY_DSN is set. Never raises: tracking is not worth failing boot over."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT") or environment,
            release=os.getenv("SENTRY_RELEASE") or None,
            send_default_pii=False,
            include_local_variables=False,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or 0),
            before_send=scrub_event,
            before_breadcrumb=scrub_breadcrumb,
        )
    except Exception as exc:  # noqa: BLE001 — any failure here just means "no tracking"
        logger.warning("Error tracking disabled: %s", exc)
        return False
    logger.info("Error tracking enabled")
    return True
