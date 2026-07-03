# CLAUDE.md

Paper Tracker Core is a full-stack academic paper tracking system focused on local paper library management, RSS ingestion, AI analysis, AG-UI workflows, attachment viewing, and optional Cloudflare D1 sync.

## Development Commands

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Runs FastAPI on `http://localhost:5002`.

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
```

Runs Vite on `http://localhost:3457`.

### Copilot Runtime

```bash
cd copilot-runtime
npm install
node server.js
```

Runs the CopilotKit runtime proxy on `http://localhost:4100`.

### Cloudflare Worker

```bash
cd cf-worker
npm install
npm run build
```

### Manual Feed Ingestion

```bash
python scripts/scheduled_fetch.py --base-url http://localhost:5002
```

## Architecture

- `backend/`: FastAPI, SQLAlchemy, SQLite, APScheduler, AG-UI endpoints, LLM configuration, paper/files/tags/feed APIs.
- `frontend/`: React 18, Vite, Tailwind, Zustand, CopilotKit UI, workflow pages, paper viewer.
- `copilot-runtime/`: Node/Express CopilotKit runtime proxy with AG-UI agents for paper, global, assistant, and workflow chats.
- `cf-worker/`: Hono-based Cloudflare Worker with D1-backed public routes and sync endpoints.
- `mcp_server/`: MCP tools for paper search, stats, feeds, and library operations.
- `shared/`: Shared workflow template definitions.

## Backend Notes

- `backend/app/main.py` registers routers and startup/shutdown hooks.
- `backend/app/models.py` defines ORM tables for papers, feeds, tags, LLM configs, prompts, chat, usage, files, workflows, and auth.
- `backend/app/services/rss_parser.py` ingests feeds and deduplicates by link, arXiv ID, and content hash.
- `backend/app/services/llm_service.py` streams LLM responses via litellm.
- `backend/app/services/tools/registry.py` defines available agent tools.
- `backend/app/services/workflow_graph.py` powers template-driven research workflows.
- `backend/app/services/encryption.py` lazily loads Fernet keys from environment variables.

## Frontend Notes

- `frontend/src/api.js` creates the Axios client. `VITE_API_BASE_URL` defaults to `http://localhost:5002`.
- `frontend/src/store.js` manages tabs, dark mode, selected model state, and global chat drawer state.
- `frontend/src/components/copilot/` contains CopilotKit configuration, labels, and tool renderers.
- `frontend/src/components/workflow/` contains workflow execution UI.
- `frontend/src/components/paper/viewer/` contains inline file viewers.

## Environment Variables

Root `.env` is loaded by the backend from the project root.

Required or important:

- `ENCRYPTION_KEY`: Fernet key for LLM API key storage.
- `JWT_SECRET_KEY`: JWT signing key.
- `DATABASE_URL`: defaults to `sqlite:///./paper_tracker.db`.
- `TRACKER_KEYWORDS`: relevance scoring weights, e.g. `llm:2.0,transformer:1.5`.
- LLM provider keys such as `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ARK_API_KEY`, `OPENROUTER_API_KEY`.
- `COPILOT_RUNTIME_SECRET`, `LLM_CONFIG_ADMIN_TOKEN`, and `SYNC_SECRET` are optional hardening secrets.

## Startup Sequence

1. Load root `.env`.
2. Validate security secrets.
3. Create or migrate database tables.
4. Seed prompt templates, system prompts, LLM configs, and agent skills.
5. Initialize feed scheduler.
6. Register optional D1 sync and backup jobs.
7. Open the LangGraph checkpointer.

## Testing

Backend tests:

```bash
cd backend
source .venv/bin/activate
pytest
```

Frontend build:

```bash
cd frontend
npm run build
```

## Conventions

- Keep changes scoped to the requested behavior.
- Prefer existing local helper APIs and component patterns.
- Back up database/config files before deleting them.
- GitHub review workflow copy should be written in Chinese.
