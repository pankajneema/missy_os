from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, knowledge, profile, providers, voice
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Missy OS", version="0.1.0")

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
