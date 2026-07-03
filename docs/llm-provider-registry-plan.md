# LLM Provider Registry 修复方案

本文描述 Paper Tracker Core 的后端大模型接入收敛方案，目标是把当前“按配置自由拼接”的模式收敛为“受控 Provider Registry + 统一运行时适配 + 可验证安全边界”。

## 目标

1. 统一所有主流模型服务商的接入方式，包括 `DeepSeek`、`Volcengine ARK`、`DashScope`、`OpenAI`、`Anthropic`、`OpenRouter`、`Moonshot`、`Zhipu`、`xAI`、`Ollama`、`vLLM`。
2. 让设置页、助手页、运行时测试和实际聊天链路共用同一份 provider 解析逻辑。
3. 收紧安全边界，避免任意 `base_url`、任意 header、内网/本机 SSRF 出站、明文密钥泄露和错误回显泄露。
4. 保留对旧配置的平滑迁移能力，不要求用户手工重建所有配置。

## 修复顺序

### Phase 0: 冻结与基线确认

目标：
- 锁定当前 worktree，所有改动都在独立分支内完成。
- 确认本地 `main` 上已有的 `agui.py` 修复已被纳入新的 worktree。

验收点：
- 新 worktree 可编译。
- 现有 assistant 流式修复不回退。
- 运行日志能说明当前数据库和环境加载路径一致。

### Phase 1: Provider Registry 规范化

目标：
- 定义 canonical `provider_key`。
- 为每个 provider 明确 `api_format`、默认 `base_url`、是否需要 API key、是否本地 provider、默认 headers、能力标签。
- 把 `OpenRouter`、`Ollama`、`vLLM` 纳入一等 provider，而不是 `custom` 兜底。

验收点：
- `/api/llm-configs/providers` 能返回完整 provider 列表。
- 每个 provider 能被唯一识别并映射到 LiteLLM 参数。
- `OpenRouter` 自动注入固定 headers，其他 provider 不能随意注入敏感 headers。

### Phase 2: 安全边界收紧

目标：
- 对远程 provider 强制 `https`。
- 对本地 provider 仅在显式允许时开放 `localhost / 127.0.0.1 / ::1`。
- 阻止 metadata、link-local、private-network 目标成为 LLM 出站地址。
- 错误响应结构化，避免透传 provider 原始报错。

验收点：
- 非 `https` 远程地址被拒绝。
- 未启用本地模式时，本地/内网地址被拒绝。
- 只有 `ollama` / `vllm` 这类本地 provider 能走本地地址。
- 测试接口返回标准错误码，而不是完整 SDK 异常字符串。

### Phase 3: 运行时统一

目标：
- 设置页的测试连接、助手运行时、LangGraph 适配层全部走同一个 resolver。
- 支持 reasoning / thinking / tool-call chunk 的文本归一化。
- 让流式输出和非流式探测得到一致的 provider 行为。

验收点：
- `test` 接口和实际聊天链路使用同一份配置解析。
- 思考流 chunk 不会再把 `delta` 当成固定字符串处理。
- `reasoning_content` 与可见文本能分离处理。

### Phase 4: 配置与迁移

目标：
- 扩展 `LLMConfig` 保存 provider 元信息、健康状态、最后测试时间、最后错误信息。
- 对旧配置做安全迁移：识别 provider、修正 base URL、补齐默认 headers、补齐本地标记。
- 对 D1 同步默认脱敏或直接排除敏感字段。

验收点：
- 老记录不需要手工删库重建。
- 数据库里不会出现明文 key。
- 同步链路不会把敏感配置字段默认外发。

### Phase 5: 前端可见性

目标：
- 设置页展示 provider、健康状态、是否本地、能力标签、最近一次测试结果。
- 助手页显示当前选中模型的 provider 和状态。
- 模型选择器使用后端返回的元数据，而不是硬编码枚举。

验收点：
- 新 provider 无需改前端常量即可展示。
- 用户能一眼看出当前助手到底在用哪个 provider。
- 测试失败时能看到标准化错误信息。

### Phase 6: 验证与回归

目标：
- 提供一个可执行验证脚本，覆盖 base URL、SSRF、防护 headers、seed 规则和数据库 URL 归一化。
- 为后续变更保留可重复执行的安全检查入口。

验收点：
- `python scripts/validate_llm_provider_registry.py` 能输出清晰的通过/失败结果。
- 脚本失败时能明确告诉开发者是哪条规则不符合。
- 新 provider 接入后，只要补 registry，就能沿用同一组验证。

## 关键原则

1. `provider_key` 是唯一事实来源，不再依赖 `display_name` 或 `model_name` 猜测供应商。
2. `base_url` 属于受控配置，不允许任意公网/内网地址自由穿透。
3. 本地 provider 与远程 provider 分开处理。
4. 测试链路必须和运行链路一致。
5. 旧配置以迁移为主，不以重建为主。

## 交付物

- 统一的 Provider Registry。
- 统一的 LLM 运行时适配器。
- 统一的安全校验规则。
- 统一的验证脚本。
- 前端可视化的 provider 状态与能力标签。
