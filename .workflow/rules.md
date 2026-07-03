# 三智能体闭环工作流 — 共享规则

> 本文件是 Discovery / Fixer / Reviewer 三个智能体的共享规则手册。
> 项目: paper-tracker-pro | 技术栈: 

---

## 1. Issue 分组策略

### 1.1 散弹修复 (Shotgun Fix)
**判定**: 同一类问题在 **5 个以上文件** 中重复出现。
**处理**: 合并为 1 个 Issue，标签 `batch-fix`，注明自动化修复命令。

### 1.2 精准修复 (Surgical Fix)
**判定**: 问题定位到 **单个文件/函数**，独立可修复。
**处理**: 每个独立 Issue。

### 1.3 架构重构 (Structural Change)
**判定**: 修复需要 **跨模块协调**，涉及 3+ 模块或 500+ 行。
**处理**: 1 个设计 Issue (标签 `architecture`) + 若干实施子 Issue。

---

## 2. 优先级框架

| 等级 | 含义 | SLA | 典型场景 |
|------|------|-----|---------|
| **P0** | 必须立即修复 | 当轮 | 可利用安全漏洞、运行时崩溃、数据损坏 |
| **P1** | 下个版本前 | 1-3 天 | High 安全、性能瓶颈、关键路径无测试 |
| **P2** | 下个迭代 | 1-2 周 | Medium 安全、代码质量、规范不一致 |
| **P3** | Backlog | 按需 | Low 风险、代码风格、长期技术债 |

自动升级: 安全 Critical→P0, 安全 High→P1, 运行时崩溃→P0。

Fixer 排序: 搁置反馈 > P0 > P1 > P2 > P3，同优先级散弹修复优先。

---

## 3. PR 审查四维度

### 3.1 风格规范
{{CI_JOBS_TABLE}}

### 3.2 功能验证
- PR 是否覆盖 Issue 全部修复项
- 散弹修复是否遗漏文件

### 3.3 回归检测
- CI 全绿
- 无循环依赖引入
- 已知陷阱相关文件检查

### 3.4 架构一致性
{{ARCHITECTURE_CONVENTIONS}}

---

## 4. 搁置与终结机制

### 4.1 搁置反馈格式
```markdown
### PR #N — <标题> (搁置轮次: M/3)
- **搁置原因**: <一句话>
- **修复指南**:
  1. `path/to/file:LINE` — 问题 → 修改建议
- **CI 状态**: 通过/失败
```

### 4.2 终结条件
- 搁置 3 次 → needs-human，移出自动队列
- CI 长期 pending (>30min) → 跳过，下轮再检查
- 合并冲突 → 搁置，Fixer 下轮 rebase

### 4.3 needs-human 规则
- 改动 >200 行且涉及关键文件: 
- 删除功能 / 架构重构
- 搁置 3 次的 PR

---

## 5. Worktree 规范

```
目录: .claude/worktrees/fix-<issue-id>-<desc>
分支: fix/<issue-id>-<desc>
```

生命周期: Fixer 创建 → 修复+PR → Reviewer 合并后清理。

---

## 6. 状态文件读写协议

| 文件 | Discovery | Fixer | Reviewer |
|------|:---------:|:-----:|:--------:|
| state.md 轮次 | ✅ | ✅ | ✅ |
| state.md 搁置队列 | — | — | ✅ |
| state.md 修复完成 | — | ✅ | 读后清除 |
| state.md worktree | — | ✅添加 | ✅清除 |
| state.md 人工队列 | — | — | ✅ |
| issue-plan.md | ✅ | ✅状态 | — |
| pr-shelved.md | — | — | ✅ |
| pr-merged-log.md | — | — | ✅ |
| metrics.md | ✅发现数 | — | ✅通过率 |

---

## 7. RoboRev 协同规则

### 7.1 两套审查的分工

| 审查机制 | 粒度 | 触发 | 产出 |
|---------|------|------|------|
| RoboRev post-commit | 单次 commit 的 diff | 每次 git commit 自动触发 | Issue (标签 `roborev`) |
| Discovery 智能体 | 项目整体 / 增量变更 | 定时 (增量6 + 全量7d) | Issue (按分组策略) |

**原则**: RoboRev 做实时 commit 级审查，Discovery 做全局性扫描。两者创建的 Issue 统一由 Fixer 消费。

### 7.2 防循环三层防护

```
Fixer commit → post-commit hook 触发?
  检查 1: ROBOREV_SKIP=1? → 是 → 跳过 ✅
  检查 2: 分支是 main? → 否 (fix/*) → 跳过 ✅
  检查 3: commit message 匹配排除? → [roborev]/style: ruff/chore: → 跳过 ✅
→ 不会触发新审查，循环断开
```

- **Fixer**: 在 worktree 中始终 `export ROBOREV_SKIP=1`
- **Fixer**: RoboRev Issue 的 commit message 以 `[roborev]` 开头
- **Fixer**: 修复分支名为 `fix/*`，不在 main 上直接 commit
- **.roborev.toml**: `excluded_commit_patterns` 包含 `[roborev]`、`style: ruff`、`chore:`

### 7.3 Issue 去重协议

Discovery 每轮执行时:
1. `gh issue list --state open --label roborev` 获取 RoboRev 的 Issue
2. 对比自身发现，相同文件/行号的问题不重复创建
3. 将未纳入 `issue-plan.md` 的 RoboRev Issue 追加到修复计划

### 7.4 RoboRev Issue 的修复方式

Fixer 遇到 `roborev` 标签的 Issue 时:
1. 从 Issue body 提取 `Job ID`
2. 优先调用 `/roborev-fix <job_id>`（自动化修复）
3. 失败则手动修复
4. commit message 以 `[roborev]` 开头 + `Closes #<issue-id>`

---

## 8. 编码规范速查

{{CODING_STANDARDS}}
