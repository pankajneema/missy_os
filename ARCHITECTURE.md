# Architecture

## Components

```
Streamlit (frontend/)  --HTTP-->  FastAPI (backend/)  -->  Postgres + pgvector
                                        |                    (data, embeddings,
                                        v                     LangGraph checkpoints)
                                  LangGraph agent
                                        |
                        +---------------+---------------+
                        v                                v
              OpenAI / Anthropic /                 MCP servers
              Gemini / Groq                    (stdio or remote SSE)
```

The frontend never talks to an LLM provider or the database directly — every request
goes through the FastAPI backend. `PostgresChatMessageHistory` (`app/ai/chains.py`)
reads/writes chat turns straight from the `messages` table rather than keeping a
second copy of conversation state anywhere.

## The agent (`app/ai/graph.py`)

One `StateGraph` handles every chat turn, live or scheduled:

```
supervisor --DIRECT--> agent ------------------> execute_tools -+
    |                     ^                            |         |
    +--RESEARCH--> researcher <-------------------------+        |
                       |                                          |
                       +----(no more tool calls)---> finalize --> critique --APPROVED--> END
                                                                       |
                                                                    REVISE
                                                                       v
                                                                    revise --> END
```

- **supervisor** classifies the message as `DIRECT` (simple, at most one quick tool
  call) or `RESEARCH` (needs multi-step investigation). The classification call isn't
  persisted to the visible conversation.
- **agent** / **researcher** both call the model with tools bound; researcher re-injects
  a directive each round and is hard-capped at 3 rounds (`_MAX_RESEARCH_ROUNDS`) —
  found necessary in practice when a smaller model looped on tool calls until it hit a
  provider's rate limit.
- **execute_tools** runs in two passes: first it resolves every approval needed for
  risky tools in the batch (via `interrupt()`), *then* it executes anything approved.
  This ordering matters — LangGraph replays a node from the top on resume, so
  interleaving execution with interrupts would re-run an already-executed tool for
  real on resume.
- **finalize** turns whatever research gathered into one answer, with no tools bound.
- **critique** judges that answer against what was gathered; if it finds a real problem
  it triggers exactly one **revise** pass (never a loop back to critique).
- Only `agent`, `finalize`, and `revise` output is streamed to the user
  (`USER_FACING_NODES`) — supervisor's classification, researcher's intermediate
  steps, and critique's verdict are internal.

### Risky tool confirmation

`is_tool_risky()` treats a tool as safe only if it's one of the native tools in
`app/ai/tools.py`, or an MCP tool explicitly annotated `readOnlyHint: true`. Everything
else pauses the whole graph run via `interrupt()`, persisted by the LangGraph
checkpointer (`AsyncPostgresSaver`) so a later request with `Command(resume=...)`
picks up exactly where it stopped. **Unattended runs** (scheduled tasks — see below)
pass `unattended=True` into `build_graph()`, which skips `interrupt()` entirely and
auto-denies any risky tool instead, since there's no one present to ever answer a
paused confirmation.

## Data model

Everything is scoped to `user_id`. Key tables:

- `users`, `assistant_profiles` — auth + one-time persona onboarding
- `llm_credentials` — Fernet-encrypted API keys per provider
- `conversations`, `messages` — chat history. `conversations.summary` +
  `summarized_through_message_id` hold the compressed-history pointer (see below);
  raw messages are never deleted
- `knowledge_sources`, `knowledge_chunks` — uploaded/fetched content, chunked and
  embedded (pgvector, HNSW index) with a `tsvector` column for keyword search
- `knowledge_entities`, `knowledge_relationships` — a lightweight knowledge graph
  extracted from ingested content (Postgres tables, not a graph database)
- `memory_entries` — durable facts/preferences, each with its own embedding
- `mcp_servers` — user-configured MCP connections (stdio or SSE), credentials/env
  Fernet-encrypted
- `pending_tool_confirmations` — a paused risky-tool call awaiting approval
- `scheduled_tasks` — prompt + schedule (daily-at-time or every-N-hours) +
  `next_run_at`/`last_run_at`

## RAG: knowledge base + graph RAG

Retrieval (`knowledge_service.search`) fuses vector similarity and keyword full-text
search via Reciprocal Rank Fusion, then reranks the merged candidates with a
cross-encoder — vector search alone can miss exact terms (names, codenames) that don't
embed distinctively.

On ingestion, an LLM extracts `(source, relationship, target)` triples into the
knowledge graph tables — best-effort, non-blocking, and skipped silently if the user
has no usable credential yet. The `search_knowledge_base` tool then auto-detects which
known entities appear in the retrieved chunks (a substring match, not another LLM call)
and appends their graph relationships to the context, so a single tool call gets both
the text and how the things in it relate to each other.

Images are ingested by generating a detailed caption with a vision-capable model, then
feeding that caption through the same chunk/embed/graph pipeline as any other document.

## Memory

Two layers, addressing different gaps:

1. **Write-time**: `remember()` embeds a new fact and checks it against the single
   closest existing memory; within a similarity threshold, it updates that entry
   in place instead of creating a duplicate.
2. **Consolidation** (`scripts/consolidate_memories.py`, manual only): an LLM reviews
   *all* of a user's memories in one pass, proposes merges for duplicates the
   per-write check missed (things that aren't each other's nearest neighbor) and
   resolutions for outright contradictions. It's split into `plan_consolidation`
   (read-only) and `apply_consolidation` so the script can show the full plan and
   require typed confirmation before deleting or creating anything.

## Conversation compression

`conversation_summary_service.maybe_compress()` runs as best-effort housekeeping after
every turn (same safety pattern as memory extraction: wrapped in `run_in_threadpool`,
never raises). Once the un-summarized tail exceeds 40 messages, everything except the
most recent 20 gets folded into an updated summary — merged with any prior summary,
not just appended, so it doesn't grow forever. The raw `messages` table is never
touched; only what gets sent to the model on future turns changes.

## Scheduled tasks

A background asyncio loop (`app/core/scheduler.py`), started in `main.py`'s lifespan,
polls once a minute for due tasks and runs each one's prompt through the same graph as
a live chat turn — with `unattended=True`. Results are posted as messages in a
dedicated conversation. `next_run_at` is always recomputed from *now* at completion
time, not from the previous scheduled time — if the app was down for a stretch, this
gives one catch-up run on the next tick instead of a burst of missed runs firing back
to back.

## MCP integration

`mcp_service.get_mcp_tools()` connects to each of a user's enabled MCP servers
independently via `langchain-mcp-adapters` — one broken server can't take the others
down or block the turn. **Local (stdio) servers are disabled by default**
(`ALLOW_MCP_STDIO_SERVERS=false`): a stdio server runs an arbitrary command with the
backend's own OS privileges on behalf of whichever account configures it, so this is an
explicit operator opt-in, not a per-user setting.

## Security posture

- Both services bind to `127.0.0.1` by default (`scripts/launchd/*.plist`) —
  registration is open to anyone who can reach the backend, so this is the actual
  access boundary, not an afterthought
- Login is rate-limited per username (`app/core/rate_limit.py`): 5 failures within 15
  minutes locks that username out for 15 minutes
- `fetch_page()` (Add URL) rejects private/loopback/link-local addresses and
  re-validates every redirect hop individually — a public-looking URL that redirects
  internally doesn't bypass the check
- API keys are Fernet-encrypted at rest and masked in every API response; provider
  error text is scrubbed of the raw key before being returned
- The system prompt includes an explicit confidentiality guardrail (never reveal itself
  or tool schemas, even under a direct override attempt) and untrusted-content framing
  around anything externally sourced (knowledge base, memory, attachments)

## Testing strategy

The pytest suite runs against a real Postgres database (`missy_os_test`, migrated
fresh per session) using SQLAlchemy savepoints for per-test isolation, with fake chat
models everywhere determinism matters — this catches real integration bugs (a prior
version had a confirmation-bypass bug and a double-tool-execution bug that only a real
checkpointer/DB round-trip surfaced). `scripts/run_evals.py` is the deliberately
separate, non-deterministic counterpart: it hits a real configured provider to check
agent *quality* (routing, grounding, tool selection) rather than code correctness.
