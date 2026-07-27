# CLAUDE.md

Paper Tracker Core is a local-first full-stack academic paper tracking system focused on local paper library management, RSS ingestion, AI analysis, AG-UI workflows, and attachment viewing.

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

### Backend

```bash
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd backend
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

### Manual Feed Ingestion

```bash
python scripts/scheduled_fetch.py --base-url http://localhost:5002
```

## Architecture

- `backend/`: FastAPI, SQLAlchemy, SQLite, APScheduler, AG-UI endpoints, LLM configuration, paper/files/tags/feed APIs.
- `frontend/`: React 18, Vite, Tailwind, Zustand, CopilotKit UI, workflow pages, paper viewer.
- `copilot-runtime/`: Node/Express CopilotKit runtime proxy with AG-UI agents for paper, global, assistant, and workflow chats.
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
- `COPILOT_RUNTIME_SECRET` and `LLM_CONFIG_ADMIN_TOKEN` are optional hardening secrets.

## Startup Sequence

1. Load root `.env`.
2. Validate security secrets.
3. Create or migrate database tables.
4. Seed prompt templates, system prompts, LLM configs, and agent skills.
5. Initialize feed scheduler.
6. Register database backup jobs.
7. Open the LangGraph checkpointer.

## Testing

Backend tests:

```bash
source .venv/bin/activate
python -m pytest backend/tests
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
