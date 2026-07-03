# Workflow Guide

本文档描述 workflow 页的当前实现方式，供后续 agent、联调和回归测试使用。

## 1. 当前模板

当前共有 5 个 workflow 模板：

- `literature_survey`
- `trend_radar`
- `paper_comparison`
- `gap_finder`
- `submission_prep`

模板的单一来源是 `shared/workflow_templates.json`。

消费方式：

- 前端通过 `frontend/src/components/workflow/templates.js` 做薄适配
- 后端通过 `backend/app/services/workflow_template_registry.py` 读取和校验
- `backend/app/services/workflow_graph.py` 不再内嵌模板常量

约定：

- 不在前后端各自手写一份模板定义
- 新增模板、阶段标签或参数字段时，只改共享 JSON，再补测试

## 2. 执行链路

workflow 页面入口是 `frontend/src/pages/WorkflowPage.jsx`。

运行时链路：

1. 用户选择模板并填写参数。
2. 前端创建新的 workflow thread / tab，并生成首条用户消息。
3. `ThreadsProvider + useAgent` 调用 `workflowAgent`。
4. `CopilotProvider` 透传 `templateId / templateParams / workflowStateSnapshot`。
5. 后端 `/api/agui/workflow` 构造 LangGraph workflow graph。
6. workflow graph 按模板阶段执行，持续返回 `STATE_SNAPSHOT`。
7. workflow 运行过程中会把 `WorkflowSession + ChatMessage(session_type="workflow")` 持久化。
8. 前端左侧状态面板与右侧聊天面板消费同一 thread。
9. workflow 完成后，右侧继续追问会走 discussion 分支，而不是重跑整个模板。

## 3. 后端阶段设计

workflow graph 采用模板驱动状态机，核心阶段包括：

- `normalize`
- `search`
- `select`
- `analysis`
- `trends`
- `comparison`
- `gap`
- `submission`
- `synthesis`
- `discussion`

模板与阶段映射：

- `literature_survey`: `normalize -> search -> select -> analysis -> trends -> synthesis`
- `trend_radar`: `normalize -> search -> select -> trends -> synthesis`
- `paper_comparison`: `normalize -> search -> select -> analysis -> comparison -> synthesis`
- `gap_finder`: `normalize -> search -> select -> analysis -> gap -> synthesis`
- `submission_prep`: `normalize -> search -> select -> analysis -> comparison -> submission -> synthesis`

说明：

- `search / select / analysis / trends / comparison / gap / submission` 当前以确定性逻辑和工具为主
- `synthesis / discussion` 由统一 LLM runtime 驱动
- `search` 会执行“整句 topic + 拆词 + 低召回兜底最新论文”的组合检索
- 阻塞工具调用会 offload 到后台线程，避免单 worker 事件循环被长查询卡住

## 4. 关键状态字段

workflow 前后端共享的核心字段：

- `template_id`
- `template_params`
- `workflow_status`
- `active_agent`
- `current_stage`
- `planned_stages`
- `completed_stages`
- `completed_agents`
- `research_topic`
- `source_scope`
- `normalized_sources`
- `search_results`
- `candidate_papers`
- `selected_papers`
- `paper_analyses`
- `trend_data`
- `comparison_pairs`
- `comparison_report`
- `gap_report`
- `submission_plan`
- `final_report`
- `literature_draft`
- `recommendations`
- `follow_up_questions`
- `error`

约定：

- `completed_agents` 当前表示“已完成阶段”，不是旧版 agent 名称
- `current_stage` 由后端驱动，前端不要自行推断核心业务状态
- 需要跨 tab 或追问续跑时，优先使用 `workflowStateSnapshot`

## 5. 会话恢复接口

- `GET /api/agui/workflow/templates`
- `GET /api/agui/workflow/sessions`
- `GET /api/agui/workflow/{session_id}`
- `GET /api/agui/workflow/{session_id}/messages`
- `DELETE /api/agui/workflow/{session_id}`
