from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, knowledge, mcp_servers, memory, profile, providers, voice
from app.core.checkpointer import open_checkpointer
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.tracing import configure_tracing

configure_logging()
configure_tracing()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # The LangGraph checkpointer (backs the human-in-the-loop tool
    # confirmation flow in app/ai/graph.py) needs one long-lived connection
    # pool, not one opened per request - held here for the app's lifetime.
    async with open_checkpointer() as checkpointer:
        app.state.checkpointer = checkpointer
        yield


app = FastAPI(title="Missy OS", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(providers.router)
app.include_router(chat.router)
app.include_router(voice.router)
app.include_router(knowledge.router)
app.include_router(memory.router)
app.include_router(mcp_servers.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
