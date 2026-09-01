# Missy OS

A personal AI operating system: a chat assistant that keeps its own memory, searches a
knowledge base you build over time, calls tools (including external ones via MCP),
researches multi-step questions on its own, catches its own mistakes before answering,
and can act on a schedule without you sending a message. Backend is FastAPI +
LangGraph + Postgres/pgvector; frontend is Streamlit.

For how the pieces fit together (the LangGraph agent, the data model, the background
scheduler), see [ARCHITECTURE.md](ARCHITECTURE.md).

## What's in here

- **Chat** — streaming replies, multi-provider (OpenAI / Anthropic / Gemini / Groq),
  image and document attachments, voice in/out (transcription + TTS)
- **Multi-agent routing** — a supervisor classifies each message as a quick direct
  reply or a multi-step research task; research answers get a self-critique pass that
  can trigger one revision before the user ever sees them
- **Tools** — calculator, current date/time, knowledge-base search, remembering facts,
  plus anything exposed by a connected **MCP server** (local or remote). A tool judged
  risky (writes, deletes, anything not explicitly read-only) pauses for your explicit
  approval before it runs — except in scheduled/unattended runs, where it's auto-denied
  instead, since there's nobody there to approve it
- **Knowledge base** — upload files (PDF/DOCX/TXT/MD, with OCR fallback for scanned
  PDFs) or images (captioned by a vision model), add URLs, or write notes. Retrieval is
  hybrid (vector + keyword, fused and reranked) and automatically enriched with a
  lightweight knowledge graph extracted from what you add
- **Memory** — durable facts about you are extracted from conversation automatically,
  deduped against near-duplicates on write, and periodically consolidated by an LLM
  pass that merges duplicates and resolves contradictions (`scripts/consolidate_memories.py`,
  run manually — it deletes entries, so it always shows a plan and asks for confirmation
  first)
- **Conversation compression** — old conversation history is folded into a running
  summary once it grows past a threshold, so token cost doesn't grow forever; nothing is
  ever deleted from the raw message history, only excluded from future prompts
- **Scheduled tasks** — give Missy a prompt to run on its own (daily at a time, or every
  N hours); results land as messages you can review, no need for you to be present
- **Evals & guardrails** — a live eval harness (`scripts/run_evals.py`) checks routing,
  tool use, grounding, and a confidentiality guardrail against your real configured
  model — separate from the pytest suite, which uses fake models for deterministic CI
- **Process supervision** — macOS LaunchAgents (`scripts/launchd/`) keep the backend and
  frontend running and auto-restart them on crash

## Quick start

**1. Postgres** (pgvector image, via Docker)
```bash
docker compose up -d postgres
```

**2. Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in JWT_SECRET_KEY and FERNET_KEY - see "Generating secrets" below
alembic upgrade head
uvicorn app.main:app --reload
```
API docs: http://localhost:8000/docs

**3. Frontend** (second terminal)
```bash
cd frontend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run streamlit_app.py
```
App: http://localhost:8501

Register an account, complete the one-time assistant onboarding, then add an LLM
provider under **API Connections** before chatting.

### Generating secrets
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # FERNET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                                 # JWT_SECRET_KEY
```

## Configuration

All backend settings live in `backend/.env` (see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET_KEY` | Signs auth tokens |
| `FERNET_KEY` | Encrypts stored LLM API keys and MCP server credentials at rest |
| `ALLOWED_ORIGINS` | CORS allowlist (the frontend's origin) |
| `ALLOW_MCP_STDIO_SERVERS` | Off by default. A local (stdio) MCP server runs an arbitrary command with the backend's own OS privileges on behalf of whichever account configures it — only enable this if every account that can log in is already fully trusted with that |
| `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT` | Optional tracing (smith.langchain.com); leave blank to disable |

The frontend only needs `API_BASE_URL` (`frontend/.env.example`), defaulting to
`http://localhost:8000`.

**By default both services bind to `127.0.0.1` only** (see `scripts/launchd/*.plist`) —
neither is reachable from other devices on your network. Registration is open to
anyone who can reach the backend, so don't change that binding without adding your own
access control first.

## Running in the background (macOS)

`scripts/launchd/` sets up both services as LaunchAgents that start at login and
restart automatically on crash:
```bash
scripts/launchd/install.sh    # install + start
scripts/launchd/status.sh     # check state, PID, last exit code, health
scripts/launchd/uninstall.sh  # remove
```
Logs land in `logs/{backend,frontend}.{out,err}.log`.

## Maintenance scripts

| Script | Run from | What it does |
|---|---|---|
| `scripts/backup.sh` / `scripts/restore.sh` | project root | Dump/restore the Postgres database to a gzipped file outside Docker's own storage |
| `python -m scripts.run_evals --username <name>` | `backend/`, venv active | Runs the live agent-quality eval suite against that user's real configured LLM |
| `python -m scripts.consolidate_memories --username <name>` | `backend/`, venv active | Reviews and cleans up a user's remembered facts (shows a plan, asks for confirmation) |

None of these run automatically — they're maintenance you trigger, not background jobs.

## Testing

```bash
cd backend && source .venv/bin/activate && pytest
```
Tests run against a real Postgres database (`missy_os_test`, migrated fresh each
session) using SQLAlchemy savepoints for isolation, with fake chat models everywhere
determinism matters. `scripts/run_evals.py` is the live counterpart that hits a real
provider — deliberately kept separate from the deterministic suite.

## Project structure

```
backend/app/
  ai/            prompts, the LangGraph agent, embeddings, RAG, document/image/audio processing
  api/routes/    FastAPI endpoints
  core/          config, auth, encryption, rate limiting, logging, the scheduler loop
  db/            SQLAlchemy engine/session setup
  models/        SQLAlchemy models
  repositories/  data access
  schemas/       Pydantic request/response models
  services/      business logic (one per feature area)
backend/scripts/ maintenance scripts (evals, memory consolidation)
backend/alembic/ migrations
backend/tests/   pytest suite (real Postgres, fake models)
frontend/views/  one Streamlit view per page
scripts/         backup/restore, launchd process supervision
```
