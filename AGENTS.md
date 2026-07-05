# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Project Overview

Paper Tracker Core is a local-first full-stack academic paper tracking system with RSS ingestion, AI-powered analysis, local paper library management, attachment viewing, and AG-UI/CopilotKit workflows.

## Repository and PR Discipline

以下规则为 P1 级稳定性约束。若与通用开发习惯或其他文档冲突，以本节中更严格的要求为准。

### Main Workspace Is Read-Only

- 主工作区 `/Users/xiaodongzheng/exps/paper-tracker-core` 永远只检出 `main`。
- 主工作区仅允许 `git fetch origin main`、`git pull --ff-only`，以及只读运行常驻后端。
- 禁止在主工作区执行任何本地写入：编辑文件、`git add`、`git commit`、切分支、`cherry-pick`、从其他 worktree 复制文件进来等。
- 违反主工作区只读纪律即视为破坏 `main` 稳定性，按 P1 处理。

### Worktree Rules

- 所有改动一律在基于最新 `origin/main` 的独立 worktree 中完成，并通过 PR 合入。
- 一个分支只对应一个 worktree。
- 创建 worktree 前必须先同步：`git fetch origin main`。
- 基于最新 `origin/main` 创建 worktree：`git worktree add <path> -b <branch> origin/main`。
- 本机工具调用间 `cwd` 可能重置；每条命令都必须显式锚定 worktree，例如 `git -C <worktree> ...` 或 `cd <worktree> && ...`。
- 写文件必须使用目标 worktree 的绝对路径。
- 绝不在主工作区运行写命令。

### Sync and Push Discipline

- 创建 PR 前必须在功能 worktree 中同步一次 `main`：`git fetch origin main && git merge origin/main`。
- 合并 PR 前必须再次同步 `main`：`git fetch origin main && git merge origin/main`。
- 若出现冲突，先解决冲突并重新验证，再继续。
- 与 `origin/main` 冲突时严禁 push；否则 PR 可能进入 `mergeState=DIRTY`，CI 不触发。
- 合并前若 `main` 再次前进，必须先同步、验证，并等待 CI 转绿后再合并。

### PR Merge Discipline

模型确定的 PR 可自主合并；不确定或高风险时必须询问用户。自主合并必须全部满足以下条件：

1. 已完成 `roborev review --branch` 的事前审查，并执行 `roborev refine` 的 fix/re-review 循环 1-2 轮，且无新问题。
2. 模型对正确性高确定性，无 `uncertain`、争议点或未解决的 P1 问题。
3. 本地 `npm run check` 与对应面的 `verify:*`，或 CI，全部通过。
4. 变更完整，PR 四章节齐全，且无 WIP。
5. 已与 `origin/main` 同步且无冲突。

以下情况必须询问用户，不能自主合并：

- 模型不确定，存在 `uncertain`、争议点或未解决 P1。
- 涉及删文件、生产写入、安全、RBAC、资金等高风险区域。
- 审查仍为红色。
- PR 不是当前 LLM 创建的。
- dependabot 以外的特殊 PR，包括修改本纪律本身的元改动。

### Post-Merge Cleanup

- PR 合并后必须立即收尾：删除本地分支、删除远程分支、删除对应 worktree。
- 收尾后在主工作区执行 `git pull --ff-only`。
- 清理任何脏残留。
- 收尾未完成前不得开始下一个任务。

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
5. Database backup jobs are registered.

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
