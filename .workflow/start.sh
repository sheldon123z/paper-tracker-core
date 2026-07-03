#!/usr/bin/env bash
# claude-auto-review-loop — 通用 tmux 分屏启动器
# 此文件在 setup 时复制到目标项目 .workflow/start.sh
#
# 用法:
#   bash .workflow/start.sh           # 交互选择后端，自动发送 prompt
#   bash .workflow/start.sh --manual  # 不自动发送 prompt
#   bash .workflow/start.sh --all <cmd>  # 三个都用同一后端
#
# 布局:
#   ┌──────────────────────────────────────┐
#   │          Discovery (发现者)           │
#   ├──────────────────┬───────────────────┤
#   │   Fixer (修复者)  │  Reviewer (审查者) │
#   └──────────────────┴───────────────────┘

set -e

SESSION="workflow"
PROJECT_DIR="/Users/xiaodongzheng/exps/paper-tracker-pro"
PROMPT_DIR="$PROJECT_DIR/.workflow/prompts"
CONFIG_FILE="$PROJECT_DIR/.workflow/config.yaml"
AUTO_PROMPT=true
ALL_CMD=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --manual)  AUTO_PROMPT=false; shift ;;
        --all)     ALL_CMD="$2"; shift 2 ;;
        *)         shift ;;
    esac
done

if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Session '$SESSION' 已存在，直接连接..."
    echo "提示: tmux kill-session -t workflow 可销毁重建"
    tmux attach -t "$SESSION"
    exit 0
fi

# ─── 读取配置中的后端列表 ───────────────────────────────────

# 从 config.yaml 提取 claude_variants
BACKENDS=()
BACKEND_DESCS=()
if [[ -f "$CONFIG_FILE" ]]; then
    while IFS= read -r line; do
        if [[ "$line" =~ cmd:\ *\"(.+)\" ]]; then
            BACKENDS+=("${BASH_REMATCH[1]}")
        elif [[ "$line" =~ desc:\ *\"(.+)\" ]]; then
            BACKEND_DESCS+=("${BASH_REMATCH[1]}")
        fi
    done < <(sed -n '/claude_variants:/,/^  [a-z]/p' "$CONFIG_FILE" | head -20)
fi

# 兜底
if [[ ${#BACKENDS[@]} -eq 0 ]]; then
    BACKENDS=("claude")
    BACKEND_DESCS=("默认")
fi

# ─── 后端选择 ──────────────────────────────────────────────

select_backend() {
    local role="$1" var_name="$2"
    echo ""
    echo "  选择 $role 的后端:"
    for i in "${!BACKENDS[@]}"; do
        printf "    %d) %-16s — %s\n" $((i+1)) "${BACKENDS[$i]}" "${BACKEND_DESCS[$i]:-}"
    done
    echo "    $((${#BACKENDS[@]}+1))) 自定义命令"
    echo ""
    read -rp "  请选择 [1-$((${#BACKENDS[@]}+1))] (默认 1): " choice
    if [[ -z "$choice" || "$choice" == "1" ]]; then
        eval "$var_name='${BACKENDS[0]}'"
    elif [[ "$choice" -le "${#BACKENDS[@]}" ]]; then
        eval "$var_name='${BACKENDS[$((choice-1))]}'"
    elif [[ "$choice" == "$((${#BACKENDS[@]}+1))" ]]; then
        read -rp "  输入启动命令: " custom_cmd
        eval "$var_name='$custom_cmd'"
    else
        echo "  无效选择"; exit 1
    fi
}

# 读取项目名
PROJ_NAME="$(grep 'name:' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*: *"\?\([^"]*\)"\?/\1/' | xargs)"
PROJ_NAME="${PROJ_NAME:-workflow}"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   $PROJ_NAME — 三智能体工作流启动器"
echo "╠════════════════════════════════════════════╣"
echo "║  Discovery  — 代码审查发现者               ║"
echo "║  Fixer      — Issue 修复者                 ║"
echo "║  Reviewer   — PR 审查者                    ║"
echo "╚════════════════════════════════════════════╝"

if [[ -n "$ALL_CMD" ]]; then
    CMD_DISCOVERY="$ALL_CMD"
    CMD_FIXER="$ALL_CMD"
    CMD_REVIEWER="$ALL_CMD"
    echo ""
    echo "统一后端: $ALL_CMD"
else
    echo ""
    echo "  1) 相同后端 (只选一次)"
    echo "  2) 分别配置 (每个单独选)"
    echo ""
    read -rp "请选择 [1-2] (默认 1): " mode_choice
    if [[ "${mode_choice:-1}" == "1" ]]; then
        select_backend "全部智能体" "SHARED_CMD"
        CMD_DISCOVERY="$SHARED_CMD"
        CMD_FIXER="$SHARED_CMD"
        CMD_REVIEWER="$SHARED_CMD"
    else
        select_backend "📡 Discovery" "CMD_DISCOVERY"
        select_backend "🔧 Fixer" "CMD_FIXER"
        select_backend "🔍 Reviewer" "CMD_REVIEWER"
    fi
fi

echo ""
echo "── 配置确认 ──────────────────────────────────"
echo "  Discovery : $CMD_DISCOVERY"
echo "  Fixer     : $CMD_FIXER"
echo "  Reviewer  : $CMD_REVIEWER"
echo "─────────────────────────────────────────────"

# ─── 创建 tmux ─────────────────────────────────────────────

echo ""
echo "创建 tmux session: $SESSION (分屏模式)"

tmux new-session -d -s "$SESSION" -c "$PROJECT_DIR"
tmux split-window -v -t "$SESSION" -c "$PROJECT_DIR"
tmux split-window -h -t "$SESSION" -c "$PROJECT_DIR"

tmux send-keys -t "$SESSION.0" "$CMD_DISCOVERY" Enter
tmux send-keys -t "$SESSION.1" "$CMD_FIXER" Enter
tmux send-keys -t "$SESSION.2" "$CMD_REVIEWER" Enter

if $AUTO_PROMPT; then
    echo "等待 Claude Code 启动 (10秒)..."
    sleep 10
    for pair in "0:discovery" "1:fixer" "2:reviewer"; do
        pane="${pair%%:*}"
        name="${pair##*:}"
        file="$PROMPT_DIR/${name}.txt"
        if [[ -f "$file" ]]; then
            tmux send-keys -t "$SESSION.$pane" "$(cat "$file")" Enter
            echo "  ✓ ${name} prompt 已发送"
        fi
    done
fi

tmux select-pane -t "$SESSION.1"

echo ""
echo "┌──────────────────────────────────────┐"
echo "│   Discovery ($CMD_DISCOVERY)         │"
echo "├──────────────────┬───────────────────┤"
echo "│ Fixer ($CMD_FIXER)│Reviewer ($CMD_REVIEWER)│"
echo "└──────────────────┴───────────────────┘"
echo ""
echo "分屏切换: Ctrl-b + 方向键"
echo "放大单屏: Ctrl-b + z"
echo "销毁会话: tmux kill-session -t $SESSION"
echo ""

tmux attach -t "$SESSION"
