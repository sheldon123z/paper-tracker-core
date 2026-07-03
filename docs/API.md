# Paper Tracker Core API 文档

完整交互式文档：启动后端后访问 `http://localhost:5002/docs`。

## 认证

使用 JWT Bearer Token 认证。

```text
POST /api/auth/login    -> { "access_token": "...", "refresh_token": "..." }
POST /api/auth/refresh  -> { "access_token": "..." }
```

需要认证的请求添加 Header：

```text
Authorization: Bearer <access_token>
```

## API 端点概览

### 论文管理 (`/api/papers`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/papers` | 论文列表，支持分页、筛选、搜索 |
| GET | `/api/papers/:id` | 论文详情 |
| PATCH | `/api/papers/:id` | 更新论文 |
| POST | `/api/papers/:id/tags` | 论文打标签 |
| POST | `/api/papers/:id/translate-abstract` | 翻译摘要 |
| GET | `/api/papers/:id/files` | 附件列表 |
| POST | `/api/papers/:id/files` | 上传附件 |
| GET | `/api/papers/duplicates` | 查找重复论文 |
| POST | `/api/papers/duplicates/merge` | 合并重复论文 |
| POST | `/api/papers/batch` | 批量操作 |
| GET | `/api/papers/export/bibtex` | BibTeX 导出 |

### RSS 订阅源 (`/api/feeds`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/feeds` | 订阅源列表 |
| POST | `/api/feeds` | 添加订阅源 |
| GET | `/api/feeds/:id` | 订阅源详情 |
| PATCH | `/api/feeds/:id` | 更新订阅源 |
| DELETE | `/api/feeds/:id` | 删除订阅源 |
| POST | `/api/feeds/:id/run` | 立即抓取订阅源 |

### AG-UI 流式对话 (`/api/agui`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agui/paper` | 论文分析 Agent |
| POST | `/api/agui/global` | 全局研究 Agent |
| POST | `/api/agui/assistant` | 通用助手 Agent |
| GET | `/api/agui/assistant/sessions` | 助手会话列表 |
| DELETE | `/api/agui/assistant/:session_id` | 删除会话 |

### 科研工作流 (`/api/agui/workflow`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agui/workflow` | 执行工作流 |
| GET | `/api/agui/workflow/templates` | 工作流模板列表 |
| GET | `/api/agui/workflow/sessions` | 工作流会话列表 |
| GET | `/api/agui/workflow/:session_id` | 工作流详情 |
| GET | `/api/agui/workflow/:session_id/messages` | 工作流消息 |
| DELETE | `/api/agui/workflow/:session_id` | 删除工作流会话 |

### LLM 模型配置 (`/api/llm-configs`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm-configs` | 配置列表 |
| GET | `/api/llm-configs/providers` | 可用 Provider |
| POST | `/api/llm-configs` | 添加配置 |
| PATCH | `/api/llm-configs/:id` | 更新配置 |
| DELETE | `/api/llm-configs/:id` | 删除配置 |
| POST | `/api/llm-configs/batch-test` | 批量健康检查 |
| POST | `/api/llm-configs/batch-action` | 批量操作 |
| GET | `/api/llm-configs/export` | 导出，不含 API Key |
| POST | `/api/llm-configs/import` | 导入 |

### 使用统计与预算

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/usage/summary` | 使用摘要 |
| GET | `/api/usage/by-model` | 按模型统计 |
| GET | `/api/usage/by-agent` | 按 Agent 统计 |
| GET | `/api/usage/timeline` | 时间线趋势 |
| GET | `/api/usage/audit` | 审计日志 |
| GET | `/api/budget` | 预算列表 |
| POST | `/api/budget` | 创建预算 |
| GET | `/api/budget/status` | 预算状态 |

### 其他端点

| 模块 | 前缀 | 说明 |
|------|------|------|
| auth | `/api/auth` | 注册、登录、刷新、登出 |
| tags | `/api/tags` | 标签 CRUD |
| skills | `/api/skills` | Agent 技能管理 |
| prompt-templates | `/api/prompt-templates` | Prompt 模板 |
| system-prompts | `/api/system-prompts` | 系统提示词 |
| files | `/api/papers/:id/files` | 论文附件 |
| feedback | `/api/feedback` | 用户反馈 |
| scheduler | `/api/scheduler` | 定时任务 |
| stats | `/api/stats` | 统计概览 |

## AG-UI 流式协议

AG-UI 端点返回 Server-Sent Events 流。主要事件：

| 事件 | 说明 |
|------|------|
| `RUN_STARTED` | 运行开始 |
| `TEXT_MESSAGE_START` | 文本消息开始 |
| `TEXT_MESSAGE_CONTENT` | 文本内容片段 |
| `TEXT_MESSAGE_END` | 文本消息结束 |
| `TOOL_CALL_START` | 工具调用开始 |
| `TOOL_CALL_ARGS` | 工具参数 |
| `TOOL_CALL_END` | 工具调用结束 |
| `TOOL_CALL_RESULT` | 工具结果 |
| `MESSAGES_SNAPSHOT` | 历史消息恢复 |
| `STATE_SNAPSHOT` | 状态快照 |
| `RUN_FINISHED` | 运行结束 |
