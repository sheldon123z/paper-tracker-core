#!/bin/bash
# roborev 评审失败时自动创建 GitHub Issue
# 由 claude-auto-review-loop 框架生成
#
# 触发条件: .roborev.toml [[hooks]] event = 'review.completed' + verdict=F
# 用法: .roborev-issue.sh <job_id> <sha>
#
# 职责:
#   ✅ 创建 GitHub Issue (含评审内容、severity 标签)
#   ❌ 不自动修复 — 统一交给 Fixer 智能体处理
#
# 防循环机制:
#   1. Issue 标签含 "roborev" — Discovery 去重时识别
#   2. Fixer 在 worktree 中设 ROBOREV_SKIP=1 — 修复 commit 不触发审查
#   3. excluded_commit_patterns 排除 [roborev] 前缀的 commit

set -e

JOB_ID="$1"
SHA="$2"
REPO="ChenShi-Tech/paper-tracker-pro"

if [ -z "$JOB_ID" ] || [ -z "$SHA" ]; then
    echo "Usage: $0 <job_id> <sha>" >&2
    exit 1
fi

# 获取评审内容
REVIEW=$(roborev show --job "$JOB_ID" 2>/dev/null)
if [ -z "$REVIEW" ]; then
    echo "roborev-issue: 无法获取 job $JOB_ID 的评审内容" >&2
    exit 1
fi

SHORT_SHA="${SHA:0:7}"

# ─── 去重检查: 同一 commit 是否已有 open Issue ──────────────

EXISTING=$(gh issue list --repo "$REPO" --state open --label "roborev" --search "$SHORT_SHA" --json number,title --jq '.[].number' 2>/dev/null)
if [ -n "$EXISTING" ]; then
    echo "roborev-issue: commit $SHORT_SHA 已有 open Issue #$EXISTING，跳过创建"
    exit 0
fi

# ─── 确定 severity 和标签 ──────────────────────────────────

LABELS="roborev,code-quality"

if echo "$REVIEW" | grep -qi "Severity.*:.*Critical\|严重.*Critical"; then
    LABELS="$LABELS,P0-critical"
    SEVERITY="critical"
elif echo "$REVIEW" | grep -qi "Severity.*:.*High\|严重\|高"; then
    LABELS="$LABELS,P1-high"
    SEVERITY="high"
elif echo "$REVIEW" | grep -qi "Severity.*:.*Medium\|中等"; then
    LABELS="$LABELS,P2-medium"
    SEVERITY="medium"
else
    LABELS="$LABELS,P3-low"
    SEVERITY="low"
fi

# 安全相关
if echo "$REVIEW" | grep -qi "inject\|xss\|csrf\|auth\|密钥\|secret\|token\|sql.*inject\|命令注入"; then
    LABELS="$LABELS,security"
fi

# ─── 创建 Issue ────────────────────────────────────────────

BODY=$(cat <<EOF
## RoboRev 自动评审发现问题

- **Commit**: \`$SHORT_SHA\`
- **Job ID**: \`$JOB_ID\`
- **Severity**: $SEVERITY
- **来源**: roborev post-commit hook

## 评审内容

\`\`\`
$REVIEW
\`\`\`

## 修复方式

此 Issue 由三智能体工作流的 **Fixer** 自动处理。也可手动修复:

\`\`\`bash
# 在 Claude Code 中
/roborev-fix $JOB_ID

# 或命令行
roborev fix $JOB_ID
\`\`\`

---
*由 [claude-auto-review-loop](https://github.com/sheldon123z/claude-auto-review-loop) RoboRev hook 自动创建*
EOF
)

ISSUE_URL=$(gh issue create \
    --repo "$REPO" \
    --title "[roborev] $SHORT_SHA: 代码评审发现问题 ($SEVERITY)" \
    --body "$BODY" \
    --label "$LABELS" \
    2>&1)

if echo "$ISSUE_URL" | grep -q "https://"; then
    echo "roborev-issue: Issue 已创建 → $ISSUE_URL"
    echo "roborev-issue: 等待 Fixer 智能体在下一轮自动修复"
else
    echo "roborev-issue: Issue 创建失败: $ISSUE_URL" >&2
    exit 1
fi
