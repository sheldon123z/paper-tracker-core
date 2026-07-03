# Paper Tracker Core Project Guide

这份文档是仓库内 agent 的统一入口说明。开始改动前，优先阅读本文件，再按需查看 `docs/ARCHITECTURE.md`、`docs/WORKFLOWS.md` 和 `docs/llm-provider-registry-plan.md`。

## 1. 项目目标

Paper Tracker Core 是一个面向学术论文追踪和研究助手的全栈系统，核心能力包括：

- RSS 论文抓取、去重、标签与检索
- 本地论文库管理、附件上传与内联预览
- AI 助手、论文侧边对话和全局研究助手
- 五类科研 workflow：文献调研、趋势分析、论文对比、研究空白、投稿准备
- 多供应商大模型接入与统一运行时
- MCP 工具服务

## 2. 服务结构

仓库包含这些主要服务：

- `backend/`：FastAPI + SQLAlchemy + SQLite，默认端口 `5002`
- `frontend/`：React 18 + Vite + Tailwind + Zustand，默认端口 `3457`
- `copilot-runtime/`：CopilotKit runtime 代理，默认端口 `4100`
- `mcp_server/`：面向 MCP 客户端的论文库工具

主要交互链路：

1. 前端页面和 Copilot UI 发起请求
2. 后端 REST API 或 AG-UI 路由处理请求
3. LangGraph 图编排调用统一 LLM Runtime
4. LLM Runtime 通过 Provider Registry 适配具体模型供应商
5. 结果回写前端或 SQLite 数据库

## 3. 本地开发命令

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Copilot Runtime

```bash
cd copilot-runtime
npm install
node server.js
```

### 一键启动

```bash
./start.sh
```

## 4. 关键目录

### 后端

- `backend/app/main.py`：FastAPI 启动入口和 startup 流程
- `backend/app/routes/`：REST 与 AG-UI 路由
- `backend/app/services/`：业务逻辑、LLM、调度、迁移与工作流
- `backend/app/models.py`：数据库 ORM 模型
- `backend/tests/`：后端自动化测试目录

### 前端

- `frontend/src/pages/`：页面级入口
- `frontend/src/components/copilot/`：AI 助手与模型选择
- `frontend/src/components/workflow/`：科研工作流 UI
- `frontend/src/components/settings/`：系统设置页
- `frontend/src/store.js`：全局状态
- `frontend/src/api.js`：Axios API 封装

### 文档

- `docs/ARCHITECTURE.md`：功能架构地图
- `docs/WORKFLOWS.md`：workflow 模板、状态字段与联调说明
- `docs/llms.md`：AG-UI 协议参考
- `docs/llm-provider-registry-plan.md`：LLM 集成与安全方案

## 5. 环境与数据

根目录 `.env` 会被后端加载。关键变量：

- `ENCRYPTION_KEY`：LLM API Key 加密必需
- `JWT_SECRET_KEY`：JWT 签名密钥
- `ENCRYPTION_KEY_VERSION`：当前密钥版本
- `ENCRYPTION_KEY_FALLBACKS`：密钥轮换时的旧 key 列表
- `DATABASE_URL`：默认 `sqlite:///./paper_tracker.db`
- `LLM_CONFIG_ADMIN_TOKEN`：LLM 配置接口管理员令牌
- `ALLOW_LOCAL_LLM_BASE_URLS`：是否允许 `ollama/vllm/local` 类 base URL
- `LLM_ALLOWED_REMOTE_HOSTS`：generic OpenAI-compatible 远端白名单

数据库默认解析到 `backend/paper_tracker.db`，避免因相对路径导致主仓库和后端目录各自生成数据库。

## 6. LLM 集成约定

后端使用统一的 `LLM Provider Registry`，让运行时、设置页测试、健康检查和 AG-UI 共用同一套 provider 规范。

核心文件：

- `backend/app/services/llm_registry.py`
- `backend/app/services/llm_runtime.py`
- `backend/app/services/llm_service.py`
- `backend/app/routes/llm_config.py`
- `backend/app/routes/agui.py`

运行时约定：

- provider 默认头由 registry 注入，不直接写入数据库
- 流式输出统一通过 runtime 正规化，兼容 reasoning/thinking block
- 图编排会根据 `supports_tool_calling` 决定是否绑定工具

## 7. 安全边界

- API key 必须加密存储
- JWT secret 和 Fernet key 不能复用
- 文件上传路由要维持大小限制与路径校验
- 数据库或配置文件删除前必须先备份
