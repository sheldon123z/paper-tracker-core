# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Project Overview

Paper Tracker Core is a full-stack academic paper tracking system with RSS ingestion, AI-powered analysis, local paper library management, attachment viewing, Cloudflare D1 sync, and AG-UI/CopilotKit workflows.

## Development Commands

### Backend (FastAPI)

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python main.py                    # Starts uvicorn on port 5002 with reload
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev                       # Dev server on port 3457
npm run build                     # Production build to dist/
npm run preview                   # Preview production build
```

### Copilot Runtime

```bash
cd copilot-runtime
npm install
node server.js                    # Proxy server on port 4100
```

### Cloudflare Worker

```bash
cd cf-worker
npm install
npm run build
```

### One-Click Start

```bash
./start.sh                        # Starts backend, Copilot runtime, and frontend
```

### Manual Feed Ingestion

```bash
python scripts/scheduled_fetch.py --base-url http://localhost:5002
```

## Architecture

### Service Architecture

- **Backend** (`backend/`): FastAPI + SQLAlchemy + SQLite on port 5002
- **Frontend** (`frontend/`): React 18 + Vite + Tailwind + Zustand on port 3457
- **Copilot Runtime** (`copilot-runtime/`): CopilotKit runtime proxy on port 4100
- **Cloudflare Worker** (`cf-worker/`): Optional D1-backed edge routes and sync
- **MCP Server** (`mcp_server/`): Paper tracking tools for MCP clients

### Backend Structure (`backend/app/`)

```text
app/
├── main.py              # FastAPI app, CORS, router registration, startup events
├── database.py          # SQLAlchemy engine, SessionLocal, Base, get_db dependency
├── models.py            # ORM models: Paper, Feed, Tag, LLMConfig, ChatMessage, WorkflowSession
├── schemas.py           # Pydantic request/response schemas
├── routes/              # API route modules
│   ├── papers.py        # CRUD, search, batch ops, duplicates, BibTeX export
│   ├── feeds.py         # RSS feed management
│   ├── agui.py          # Streaming AG-UI chat
│   ├── agui_workflow.py # Multi-stage research workflows
│   ├── llm_config.py    # LLM provider config with encrypted API keys
│   ├── prompt_templates.py
│   ├── tags.py
│   └── scheduler_routes.py
└── services/            # Business logic
    ├── rss_parser.py    # Feed ingestion with deduplication
    ├── llm_service.py   # litellm streaming with multi-provider support
    ├── encryption.py    # Fernet encryption for API keys
    ├── seed.py          # Auto-seed configs, skills, and prompt templates
    ├── scheduler.py     # APScheduler in-memory job management
    ├── relevance.py     # Keyword-weighted scoring from TRACKER_KEYWORDS
    └── dedup_service.py # SequenceMatcher title similarity
```

### Frontend Structure (`frontend/src/`)

- **State**: Zustand store (`store.js`) for tabs, dark mode, and global chat drawer
- **API**: Axios instance (`api.js`) with `VITE_API_BASE_URL` defaulting to `http://localhost:5002`
- **Routing**: React Router v6 routes for dashboard, papers, feeds, tags, duplicates, settings, workflows, and assistant
- **Streaming**: Chat components use native Fetch + ReadableStream for SSE parsing
- **Theming**: CSS variables in `index.css` with `.dark` class toggle

## Key Technical Details

### Environment Variables

Root `.env` is loaded by the backend from the project root. See `.env.example` for the full list. Critical vars:

- `ENCRYPTION_KEY` - Fernet key, required for LLM API key storage
- `JWT_SECRET_KEY` - JWT signing key
- `DATABASE_URL` - defaults to `sqlite:///./paper_tracker.db`
- `TRACKER_KEYWORDS` - format: `llm:2.0,transformer:1.5,...`
- Provider keys: `DEEPSEEK_API_KEY`, `ARK_API_KEY`, `OPENAI_API_KEY`, etc.

### Encryption

`encryption.py` uses Fernet symmetric encryption. The `ENCRYPTION_KEY` must be loaded lazily because dotenv loading happens after module initialization.

### LLM Provider Mapping

litellm provider prefixes: `openai` -> `openai`, `Codex` -> `anthropic`, `deepseek` -> `openai`. Custom providers use OpenAI-compatible mode with `base_url`. Volcengine models use endpoint IDs (`ep-xxx`) as `model_name`.

### Startup Sequence

1. `Base.metadata.create_all()` auto-creates tables.
2. Schema migrations run for existing local databases.
3. Prompt templates, LLM configs, system prompts, and agent skills are seeded.
4. APScheduler initializes jobs for active feeds.
5. Optional D1 sync and database backup jobs are registered.

## AG-UI Protocol Reference

The AG-UI reference is stored in `docs/llms.md`.

- Events: line 1076
- Messages: line 1895
- State Management: line 3224
- Tools: line 3475
- Generative UI: line 3879
- Build Applications: line 5675
- Server Guide: line 6897
- Python SDK: line 10586

## API Documentation

Auto-generated Swagger UI is available at `http://localhost:5002/docs`.

## Conventions

- GitHub review workflows should be configured in Chinese (中文审查).
- Always backup data files before deletion: `cp file file.bak` before any `rm` on databases or configs.
