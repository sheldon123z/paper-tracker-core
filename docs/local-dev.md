# 本地预测试指南

本项目采用"**本地重、远程轻**"的 CI/CD 策略：在 `git push` 之前用 git hooks 拦截绝大多数问题，GitHub Actions CI 仅作安全网兜底，从而减少远程 CI 分钟数消耗。

## 一次性安装

```bash
make install-hooks
```

这会把 `scripts/git-hooks/pre-commit` 和 `pre-push` 安装到 `.git/hooks/`。仅需执行一次（克隆仓库后或 worktree 创建后）。

## 日常开发流程

### 提交时（pre-commit，约 3-5 秒）

`git commit` 自动触发，只处理**已暂存的 Python 文件**：

1. `ruff format` 格式化
2. `ruff check --fix` 自动修复
3. 自动 `git add` 重新暂存格式化后的内容

变更不含 Python 文件时直接放行。

### 推送时（pre-push，约 10-20 秒）

`git push` 自动触发，运行 `make lint-all` 快速门禁：

- 后端：`ruff check .`
- 前端：`npm run build`

**不跑完整测试**，避免每次推送等待。完整测试请手动跑 `make precheck` 或交由 CI 兜底。

> 注：当前门禁未启用 `ruff format --check`，因为仓库历史代码尚未做过统一格式化（55 个文件待格式化）。建议后续单独提 PR 执行 `ruff format .` 全量格式化后再启用。

## 手动检查命令

| 命令 | 作用 | 耗时 |
|---|---|---|
| `make lint-all` | 全量 lint + 格式检查 + 前端构建（pre-push 跑的就是这个） | 10-20s |
| `make test-quick` | 后端小测试子集 + 前端测试 | ~15s |
| `make test` | 后端 + 前端全套测试 | 1-3min |
| `make precheck` | `lint-all` + `test` 完整门禁（建议发版前/合并前跑） | 2-4min |
| `make lint` | 仅后端 `app/` 目录 ruff check（保留的快捷方式） | 2-3s |
| `make lint-fix` | 后端 `app/` ruff check --fix | 2-3s |

## 紧急绕过

```bash
SKIP_PRECHECK=1 git push
```

仅在紧急情况下使用（如修复 CI 本身）。绕过门禁意味着问题会流入远程 CI，浪费免费额度。

## 卸载 hooks

```bash
rm .git/hooks/pre-commit .git/hooks/pre-push
```

## 依赖前提

本地需已安装并可在 PATH 中调用：

- `ruff`（`pip install ruff`）
- `pytest`（`pip install pytest`）
- `node` / `npm`（前端构建与测试）

推荐激活当前 worktree 根目录下的 `.venv` 后再开发。

## CI 配套要求

GitHub Actions CI 已改为引用 Secrets。仓库管理员需在 **Settings → Secrets and variables → Actions** 中配置：

| Secret 名 | 生成命令 |
|---|---|
| `CI_ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CI_JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |

这两个值仅供 CI 测试使用，与生产环境的 `ENCRYPTION_KEY`/`JWT_SECRET_KEY` 不同。

## 设计理念

- **本地预测试为主**：ruff format/check + 完整测试在本地跑，远程只兜底。
- **CI 合并精简**：5 个 job 合并为 2 个（backend + frontend），加 pip/npm 缓存，分钟数降低约 45%。
- **智能分级**：pre-push 只跑快速门禁，完整测试由开发者主动触发或 CI 兜底。
- **零新依赖**：用原生 git hooks + Makefile，不引入 husky/lint-staged。
