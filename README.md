# Paper Tracker Core

A full-stack local research paper tracking system with RSS ingestion, AI-powered analysis, local paper library management, and multi-stage research workflows.

## Documentation

- General project guide: `docs/PROJECT_GUIDE.md`
- System architecture map: `docs/ARCHITECTURE.md`
- Workflow implementation guide: `docs/WORKFLOWS.md`
- LLM provider registry plan: `docs/llm-provider-registry-plan.md`
- AG-UI protocol reference: `docs/llms.md`

## Features

### Core
- RSS feed ingestion with automatic deduplication by link, arXiv ID, and content hash
- Built-in APScheduler jobs for periodic feed fetching
- Paper search, filtering, sorting, tagging, and duplicate merging
- Batch operations for read state, favorites, tags, and deletion
- BibTeX export
- Attachment upload and inline file viewing

### AI Analysis
- Per-paper AI chat with streaming responses
- Global research assistant with local paper library context
- Workflow workspace with reusable research templates and follow-up chat
- Configurable LLM providers including OpenAI, Claude, DeepSeek, OpenRouter, ARK, Ollama, and vLLM
- Custom prompt templates and system prompts
- Chat history persistence

### Frontend
- React + Vite application with sidebar navigation
- Tab-based paper detail views
- Dark mode support
- Tag management with color customization
- Settings for LLM providers, monitoring, skills, prompt templates, and scheduler

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, Vite 5, Tailwind CSS, Zustand |
| AI | litellm, AG-UI, CopilotKit, SSE streaming |
| Scheduler | APScheduler |
| Encryption | cryptography (Fernet) |

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Generate keys for encrypted LLM API storage and JWT auth:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### 2. Start Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

API: `http://localhost:5002`

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:3457`

### 4. One-Click Start

```bash
./start.sh
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `INFO` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:3457` |
| `DATABASE_URL` | SQLite path | `sqlite:///./paper_tracker.db` |
| `TRACKER_KEYWORDS` | Relevance scoring keywords | `llm:2.0,...` |
| `ENCRYPTION_KEY` | Fernet key for API key encryption | required |
| `JWT_SECRET_KEY` | JWT signing secret | required |
| `LLM_API_KEY` | Default LLM API key | |
| `LLM_MODEL` | Default LLM model | `openai/gpt-4o-mini` |
| `LLM_BASE_URL` | Custom LLM endpoint | |

## API Endpoints

### Papers
- `GET /api/papers` - List with search, filters, and pagination
- `GET /api/papers/{id}` - Single paper detail
- `PATCH /api/papers/{id}` - Update paper metadata
- `POST /api/papers/{id}/tags` - Assign tags
- `POST /api/papers/batch` - Batch operations
- `GET /api/papers/duplicates` - Detect duplicates
- `POST /api/papers/duplicates/merge` - Merge duplicates
- `GET /api/papers/export/bibtex` - Export BibTeX

### Feeds
- `GET /api/feeds` - List feeds
- `POST /api/feeds` - Create feed
- `PUT /api/feeds/{id}` - Update feed
- `DELETE /api/feeds/{id}` - Delete feed
- `POST /api/feeds/{id}/run` - Fetch a feed immediately

### AI And Workflows
- `POST /api/agui/paper` - Per-paper AG-UI chat
- `POST /api/agui/global` - Global AG-UI chat
- `POST /api/agui/assistant` - Assistant AG-UI chat
- `POST /api/agui/workflow` - Multi-stage research workflow
- `GET /api/agui/workflow/templates` - Workflow templates

### Settings And Operations
- `GET /api/stats` - Statistics
- `GET /api/tags` - Tag list with counts
- `GET /api/scheduler/status` - Scheduler status
- `GET /api/llm-configs` - LLM provider configs
- `GET /api/skills/available-tools` - Available agent tools

## Project Structure

```text
paper-tracker-core/
├── backend/
│   ├── app/
│   │   ├── routes/          # API route modules
│   │   ├── services/        # Business logic
│   │   ├── database.py      # SQLAlchemy config
│   │   ├── main.py          # FastAPI app
│   │   ├── models.py        # ORM models
│   │   └── schemas.py       # Pydantic schemas
│   ├── main.py              # Entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/           # Page views
│   │   ├── api.js           # Axios client
│   │   └── store.js         # Zustand state
│   └── package.json
├── copilot-runtime/         # CopilotKit runtime proxy
├── mcp_server/              # MCP server for paper tracking tools
└── docs/                    # Architecture and workflow docs
```
