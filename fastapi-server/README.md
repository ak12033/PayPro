# PayPro AI Service

The AI backend for the PayPro wallet. It owns every AI-related responsibility
end to end: it authenticates the request, reads and writes the **same MongoDB
database** the Node backend uses, calls Gemini, and answers the caller directly.

It has **two kinds of caller**, with two different credentials:

```
Browser ──(user access token)──▶  /ai/chat  /ai/history  /ai/insights
Node    ──(X-API-Key)─────────▶  /ai/categorize  /ai/fraud-check
```

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /` | — | Identity |
| `GET /health` | — | Liveness probe (used by the Docker healthcheck) |
| `GET /ready` | — | Readiness — checks the database |
| `POST /ai/chat` | Bearer | The assistant. Tool-calls into Mongo, persists the conversation |
| `GET /ai/history` | Bearer | The caller's stored conversation |
| `DELETE /ai/history` | Bearer | Clear it |
| `GET /ai/insights` | Bearer | 3–5 structured insights over the caller's last 50 transactions |
| `POST /ai/categorize` | X-API-Key | Classify a transaction into one of 19 categories + a Lucide icon |
| `POST /ai/fraud-check` | X-API-Key | Score a transaction against recent history (0–100, low/medium/high) |

The bearer routes verify the access token the **Node backend signed** — same
`JWT_SECRET`, same `tokenVersion` check, same `code` values on a 401 — so this
service authenticates the browser without calling back into Node.

The two `X-API-Key` routes stay server-to-server because they run inside the
ledger's write path: a transaction cannot be created without them, so they belong
to the Node money flow rather than to the browser.

---

## Setup

Requires **Python 3.12** (matches `python:3.12-slim` in the `Dockerfile`).

### 1. Create the virtual environment

From the `fastapi-server/` directory:

```bash
python -m venv .venv
```

`.venv` is the standard location and is git-ignored. Never commit it.

### 2. Activate it

Windows (PowerShell / cmd):

```bash
.venv\Scripts\activate
```

Linux / macOS:

```bash
source .venv/bin/activate
```

### 3. Install dependencies

Runtime only:

```bash
pip install -r requirements.txt
```

Runtime + test/lint tooling (what you want for development):

```bash
pip install -r requirements-dev.txt
```

> If you'd rather not activate the environment, every command below also works by
> calling the interpreter directly, e.g.
> `.venv\Scripts\python -m pip install -r requirements-dev.txt`.

### 4. Configure environment variables

```bash
copy .env.example .env      # Windows
cp .env.example .env        # Linux / macOS
```

Then fill in the values. `.env.example` documents every variable; `.env` is
git-ignored and must never be committed.

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | The service **exits at startup** if this is missing, rather than failing silently on every request. Never exposed to the browser. |
| `MONGO_URI` | Yes | **The same cluster the Node backend uses.** Give it without a trailing database name. |
| `MONGO_DB_NAME` | No | Defaults to `PayPro`, matching what Node appends to its own URI. |
| `JWT_SECRET` | Yes | Must be **byte-identical** to `JWT_SECRET` in `server/.env`. This service verifies the access tokens Node signs. |
| `ALLOWED_ORIGINS` | In production | Comma-separated browser origins allowed to call this service. Defaults to `http://localhost:5173` outside production. |
| `FASTAPI_API_KEY` | In production | Shared secret for the two server-to-server routes. Without it they are an open, billable Gemini proxy for anyone who can reach the URL. |
| `ENVIRONMENT` | No | `development` (default) or `production`. In production `/docs` and `/openapi.json` are disabled, and `FASTAPI_API_KEY` + `ALLOWED_ORIGINS` become mandatory. |
| `AI_RATE_LIMIT` / `AI_RATE_WINDOW_S` | No | Per-user ceiling on the browser-facing routes. Defaults to 25 per 5 minutes. |
| `MAX_REQUEST_BYTES` | No | Request body cap, default 100kb — the same ceiling `express.json()` applies on Node. |

`app/config.py` uses `python-dotenv`, which walks up from this directory. A
repo-root `PayPro/.env` is therefore picked up if `fastapi-server/.env` does not
exist — convenient when running the whole stack, but a local `.env` here takes
precedence.

### 5. Run the service

```bash
uvicorn app.main:app --port 8000 --reload
```

Interactive docs: <http://localhost:8000/docs> (development only).

Both the browser and the Node backend must be able to reach it: the SPA uses
`VITE_FASTAPI_URL` (default `http://localhost:8000`) and Node uses `FASTAPI_URL`.

---

## Tests

```bash
pytest
```

63 tests covering routing, the JWT gate, the API-key gate, per-user rate
limiting, CORS, ownership scoping, request validation and the degraded-mode
fallbacks. Both the Gemini call and the database are stubbed in every test, so
the suite **never hits the network, never bills the API key and needs no running
MongoDB** — no real credentials are required to run it.

## Lint

```bash
ruff check .
ruff format .
```

Rules live in `pyproject.toml`, which holds tooling configuration only — this
service is deployed by copying `app/` into the image, not by `pip install`-ing
itself, so there is no packaging metadata and no Poetry/uv/Pipenv involved.

---

## Docker

The `Dockerfile` builds a non-root image and is wired into the repo-root
`docker-compose.yml` as the `ai` service:

```bash
docker compose up ai
```

---

## Layout

```
fastapi-server/
├── .venv/                  # local virtual environment (git-ignored)
├── app/
│   ├── __init__.py
│   ├── main.py             # app, lifespan, CORS, error handlers, health  ← entry point
│   ├── config.py           # env loading + fail-fast validation
│   ├── database.py         # AsyncMongoClient lifecycle over the shared database
│   ├── auth.py             # bearer-token dependency (verifies Node's JWT)
│   ├── security.py         # X-API-Key shared-secret dependency
│   ├── errors.py           # {message, code} error envelope, matching Node's
│   ├── ratelimit.py        # per-user sliding window
│   ├── routes/
│   │   ├── ai.py           # server-to-server: categorize, fraud-check
│   │   └── assistant.py    # browser-facing: chat, history, insights
│   ├── services/
│   │   ├── gemini.py       # Gemini client, timeouts, prompt fencing
│   │   ├── scoring.py      # categorisation + fraud prompts
│   │   ├── insights.py     # insights prompt over the user's transactions
│   │   └── assistant.py    # system prompt, tool declarations, tool loop
│   ├── repositories/       # users, transactions, notifications, chat_sessions
│   └── schemas/            # Pydantic request/response models
├── tests/
│   ├── conftest.py
│   ├── test_health.py
│   ├── test_ai_routes.py
│   ├── test_auth.py
│   ├── test_assistant_routes.py
│   └── test_security.py
├── .env                    # your secrets (git-ignored)
├── .env.example            # documented template
├── .gitignore
├── .dockerignore
├── Dockerfile
├── pyproject.toml          # ruff + pytest configuration
├── requirements.txt        # pinned production dependencies
└── requirements-dev.txt    # pytest, httpx, ruff (includes requirements.txt)
```
