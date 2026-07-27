# Missy OS — V1: Foundation

Personal AI operating system. V1 covers: auth, one-time assistant onboarding (persona),
multi-provider LLM settings (OpenAI / Anthropic / Gemini), and a basic chat loop routed
through LangChain.

## Architecture

```
Streamlit (frontend/)  --HTTP-->  FastAPI (backend/)  -->  Postgres
                                        |
                                        v
                                  LangChain (init_chat_model)
                                        |
                              OpenAI / Anthropic / Gemini
```

## Run it locally

1. **Start Postgres**
   ```
   docker compose up -d postgres
   ```

2. **Backend**
   ```
   cd backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env   # then fill in JWT_SECRET_KEY and FERNET_KEY
   alembic upgrade head
   uvicorn app.main:app --reload
   ```
   API docs: http://localhost:8000/docs

3. **Frontend** (in a second terminal)
   ```
   cd frontend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   streamlit run streamlit_app.py
   ```
   App: http://localhost:8501

## Generating secrets

```
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # FERNET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                                 # JWT_SECRET_KEY
```
