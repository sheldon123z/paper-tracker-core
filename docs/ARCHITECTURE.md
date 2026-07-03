# Paper Tracker Core 架构地图

开始排查或实现功能前，建议先阅读 `docs/PROJECT_GUIDE.md`，再回到本文件查看模块结构。

## 系统总览

```text
用户浏览器 (localhost:3457)
    |
    | React 前端 (Vite + Tailwind + Zustand)
    | - 页面路由
    | - 论文标签页和附件查看器
    | - CopilotKit UI
    |
    v
CopilotRuntime (localhost:4100, Express)
    |
    | 代理 AG-UI 事件流
    v
FastAPI 后端 (localhost:5002)
    | - REST API
    | - AG-UI Agent 和 workflow
    | - LangGraph 图引擎
    | - SQLite 数据库
    |
    +--> 可选 MCP server
```

## 前端文件结构

```text
frontend/src/
├── App.jsx                          # 根布局：Sidebar + Routes + GlobalChatDrawer
├── api.js                           # Axios 实例
├── store.js                         # Zustand 全局状态
├── index.css                        # CSS 变量主题系统
├── pages/
│   ├── Dashboard.jsx                # 仪表盘
│   ├── PapersPage.jsx               # 论文列表
│   ├── FeedsPage.jsx                # RSS 订阅源管理
│   ├── TagsPage.jsx                 # 标签管理
│   ├── DuplicatesPage.jsx           # 重复检测
│   ├── SettingsPage.jsx             # 设置页
│   ├── WorkflowPage.jsx             # 科研工作流
│   └── AssistantPage.jsx            # AI 助手全页面
├── components/
│   ├── copilot/                     # CopilotKit Provider、模型选择、工具渲染
│   ├── paper/                       # 论文详情、筛选、附件查看器
│   ├── workflow/                    # 工作流模板和运行面板
│   ├── settings/                    # LLM、技能、模板、提示词、监控
│   ├── layout/                      # 侧边栏和标签栏
│   └── ui/                          # 基础 UI 组件
└── styles/
    └── copilotkit-theme.css
```

## 后端文件结构

```text
backend/app/
├── main.py                          # FastAPI 入口 + startup/shutdown
├── database.py                      # SQLAlchemy 引擎
├── models.py                        # ORM 模型
├── schemas.py                       # Pydantic 请求/响应模型
├── routes/
│   ├── agui.py                      # AG-UI chat endpoints
│   ├── agui_workflow.py             # 科研工作流 endpoints
│   ├── auth.py                      # 用户认证
│   ├── papers.py                    # 论文 CRUD + 搜索 + 批量操作
│   ├── feeds.py                     # RSS 源管理
│   ├── tags.py                      # 标签管理
│   ├── files.py                     # 论文附件
│   ├── llm_config.py                # LLM 配置管理
│   ├── prompt_templates.py          # Prompt 模板
│   ├── system_prompts.py            # 系统提示词
│   ├── usage.py                     # 使用统计
│   ├── budget.py                    # 预算管理
│   └── scheduler_routes.py          # APScheduler 路由
└── services/
    ├── graph_factory.py             # LangGraph 图工厂
    ├── tools/registry.py            # Agent 工具定义与调度
    ├── skill_registry.py            # DB 驱动的动态工具绑定
    ├── checkpointer.py              # LangGraph checkpointer
    ├── llm_registry.py              # Provider registry
    ├── llm_runtime.py               # LLM runtime
    ├── llm_service.py               # LLM 配置解析和流式调用
    ├── workflow_graph.py            # 科研 workflow 状态机
    ├── rss_parser.py                # RSS 解析和去重
    ├── encryption.py                # Fernet 加密
    ├── seed.py                      # 启动时种子数据
    ├── scheduler.py                 # APScheduler
    └── relevance.py                 # 关键词相关度评分
```

## Agent 工具链

```text
用户消息 -> CopilotChat -> CopilotRuntime -> /api/agui/assistant
    |
    v
agui.py: 解析请求 -> 获取技能 -> 创建 ToolGraph -> 流式执行
    |
    v
graph_factory.py: START -> call_model -> should_continue
    |                                   |
    | tool_calls                        | no tool_calls
    v                                   v
call_tools -> execute_tool(name, args)  END
    |
    v
tools/registry.py -> paper/feed/stats tool executors
    |
    v
AG-UI events -> 前端 ToolCallRenderer -> rich tool cards
```

## Agent 工具

| 工具名 | 功能 | 默认分配 |
|--------|------|----------|
| `search_papers` | 搜索论文 | paper/global/assistant |
| `get_paper_detail` | 获取论文完整信息 | paper/global/assistant |
| `get_latest_papers` | 最新论文列表 | global/assistant |
| `get_research_stats` | 统计概览 | global/assistant |
| `compare_papers` | 对比两篇论文 | paper/assistant |
| `get_category_papers` | 按分类筛选 | global/assistant |
| `get_feed_status` | RSS 源状态 | global/assistant |
| `get_paper_timeline` | 论文时间线 | global/assistant |
| `get_tag_analysis` | 标签分析 | global/assistant |
| `get_reading_progress` | 阅读进度 | global/assistant |
| `get_recent_activity` | 近期活动 | global/assistant |
| `get_paper_notes` | 论文笔记 | paper/global/assistant |
| `find_duplicates` | 重复检测 | global/assistant |
| `get_favorites_overview` | 收藏概览 | global/assistant |
| `analyze_paper_highlights` | 论文要点 | paper/global/assistant |
| `get_research_trends` | 研究趋势 | global/assistant |

## 数据库模型

| 表名 | 主要字段 | 用途 |
|------|----------|------|
| `papers` | title, authors, abstract, relevance, category | 论文数据 |
| `feeds` | name, url, fetch_interval, is_active | RSS 订阅源 |
| `tags` / `paper_tags` | name, color / paper_id, tag_id | 标签系统 |
| `paper_files` | paper_id, filename, storage_path | 附件 |
| `llm_configs` | provider, model_name, api_key_encrypted, base_url | LLM 配置 |
| `prompt_templates` | name, prompt_text, icon | 快捷模板 |
| `system_prompt_configs` | prompt_type, prompt_text | 系统提示词 |
| `chat_messages` | session_id, session_type, role, content | 聊天记录 |
| `global_chat_sessions` | session_id, title | 会话管理 |
| `workflow_sessions` | session_id, template_id, state_snapshot | 工作流会话 |
| `agent_skills` | tool_name, agent_type, is_enabled | 技能注册表 |
