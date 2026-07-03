# paper-tracker-pro — 三智能体闭环工作流

## 概览

```
  Discovery (发现者)          Fixer (修复者)           Reviewer (审查者)
  扫描代码 → 创建 Issue       修复 Issue → 创建 PR      审查 PR → 合并/搁置
       │                         │                         │
       ▼                         ▼                         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    .workflow/ 状态中心                        │
  └──────────────────────────────────────────────────────────────┘
```

由 [claude-auto-review-loop](https://github.com/user/claude-auto-review-loop) 生成。

## 快速启动

```bash
bash .workflow/start.sh
```

或手动在 3 个终端启动 `claude`，粘贴 `.workflow/prompts/` 中的 prompt。

## 文件说明

| 文件 | 用途 | 更新者 |
|------|------|--------|
| `config.yaml` | 项目配置 | 人工 |
| `state.md` | 三方协同状态 | 三方共同 |
| `issue-plan.md` | Issue 分类和优先级 | Discovery + Fixer |
| `pr-shelved.md` | 搁置 PR 及修复指南 | Reviewer |
| `pr-merged-log.md` | 已合并 PR 日志 | Reviewer |
| `metrics.md` | 质量指标 | Reviewer + Discovery |
| `rules.md` | 共享规则 | 人工 |
