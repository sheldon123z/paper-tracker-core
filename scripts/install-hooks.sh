#!/bin/bash
# 安装本地 git hooks（pre-commit + pre-push）
# 用法: make install-hooks  或  bash scripts/install-hooks.sh
set -euo pipefail

# 锚定仓库根目录（不依赖 cwd）
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  echo "错误: 不在 git 仓库中" >&2
  exit 1
fi

SOURCE_DIR="$REPO_ROOT/scripts/git-hooks"

# 兼容 worktree: worktree 下 .git 是文件而非目录，
# 必须用 `git rev-parse --git-path hooks` 获取真实 hooks 路径。
TARGET_DIR="$(git rev-parse --git-path hooks)"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "错误: 源目录不存在: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

HOOKS=("pre-commit" "pre-push")
for hook in "${HOOKS[@]}"; do
  src="$SOURCE_DIR/$hook"
  dst="$TARGET_DIR/$hook"
  if [ ! -f "$src" ]; then
    echo "警告: 跳过 $hook（源文件不存在）"
    continue
  fi
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "[installed] $dst"
done

cat <<'EOF'

✓ git hooks 已安装
  - pre-commit:  提交时自动 ruff format + check 已暂存的 Python 文件
  - pre-push:    推送时运行 make lint-all 快速门禁（约 10-20 秒）

紧急绕过: SKIP_PRECHECK=1 git push
彻底卸载: rm .git/hooks/pre-commit .git/hooks/pre-push

详见 docs/local-dev.md
EOF
