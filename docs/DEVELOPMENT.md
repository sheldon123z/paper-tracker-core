# Paper Tracker Core 开发指南

## 环境要求

- Python 3.11+
- Node.js 18+
- SQLite 3

## 首次设置

```bash
# 1. 克隆仓库
git clone <repo-url> && cd paper-tracker-core

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ENCRYPTION_KEY 和所需的 LLM API Key

# 3. 安装后端依赖
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. 安装前端依赖
cd ../frontend
npm install

# 5. 安装 CopilotRuntime 依赖
cd ../copilot-runtime
npm install

# 6. 启动所有服务
cd ..
make dev
# 或: bash start.sh
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `make dev` | 启动所有开发服务 |
| `make backend` | 仅启动后端 (port 5002) |
| `make frontend` | 仅启动前端 (port 3457) |
| `make lint` | Ruff 检查后端代码 |
| `make lint-fix` | 自动修复 lint 问题 |
| `make api-docs` | 导出 OpenAPI schema |
| `make fetch` | 手动触发 RSS 抓取 |
| `make build` | 构建桌面发布包 |
| `make clean` | 清理构建产物 |
| `make help` | 显示所有可用命令 |

## 项目结构

完整架构文档见 `CLAUDE.md`，核心目录：

```
paper-tracker-core/
├── backend/           # FastAPI + SQLAlchemy (port 5002)
│   ├── app/
│   │   ├── routes/    # API 路由模块
│   │   ├── services/  # 业务逻辑 + AI 工具
│   │   ├── auth/      # JWT 认证
│   │   └── control_plane/  # 用户管理独立 DB
│   └── main.py        # uvicorn 入口
├── frontend/          # React 18 + Vite + Tailwind (port 3457)
│   └── src/
│       ├── pages/     # 9 个路由页面
│       ├── components/ # UI 组件
│       └── store.js   # Zustand 状态
├── copilot-runtime/   # Express 代理 (port 4100)
├── docs/              # 文档
└── scripts/           # 自动化脚本
```

## 数据库迁移

项目使用轻量级迁移方式（非 Alembic）：

- **新表**: 在 `models.py` 中定义 ORM 模型 → `Base.metadata.create_all()` 自动创建
- **新列**: 在 `services/db_migrations.py` 的 `_LLM_CONFIG_COLUMNS` 或对应 dict 中添加 → `ALTER TABLE ADD COLUMN`
- **新种子数据**: 在 `services/seed.py` 对应函数中添加

启动时自动执行顺序: `create_all` → `migrate_database_schema` → `seed_*`

## Git 提交规范

使用 Conventional Commits：

```
<type>(<scope>): <description>

类型: feat, fix, refactor, docs, style, test, chore
范围: backend, frontend, copilot-runtime, ci, docs
```

示例:
```
feat(backend): 添加论文批量导出功能
fix(frontend): 修复移动端底部导航样式
docs: 更新 API 文档
```

## CI 检查

每次 PR 和 push 到 main 会自动运行：

1. **Backend Lint** — Ruff 代码风格检查
2. **Backend Syntax** — Python 语法验证
3. **Frontend Build** — 前端构建验证

本地预检: `make lint`

## API 文档

- 交互式文档: `http://localhost:5002/docs` (Swagger UI)
- 静态导出: `make api-docs` → `docs/openapi.json`
- 端点概览: `docs/API.md`
