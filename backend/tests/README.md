# Backend Tests

这个目录用于放置后端自动化回归测试，当前覆盖：

- `LLM Provider Registry` 的 URL 规范化与安全边界
- `LLM 配置鉴权` 的 loopback / admin token 访问控制
- `LLM 配置规范化` 与默认 header 不落库
- `LangGraph 图工厂` 的 tool-calling 能力分流
- `LLM 配置路由` 的基础 CRUD/简表输出

运行方式：

```bash
python3 -m unittest discover backend/tests -v
```

如果需要真实 provider 联调，仍建议在此基础上再手动走一遍设置页和 AI 助手链路。
