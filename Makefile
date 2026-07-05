.PHONY: dev backend frontend lint lint-fix api-docs fetch build clean help \
        lint-all test test-quick precheck install-hooks

# 本地预测试用 fallback 环境变量（仅测试，安全可公开；可被外部 env 覆盖）
ENCRYPTION_KEY ?= test-encryption-key-do-not-use-in-prod-ZTk4NjQ=
JWT_SECRET_KEY ?= test-jwt-secret-not-for-production

dev:                    ## 启动所有开发服务
	bash start.sh

backend:                ## 仅启动后端
	cd backend && .venv.bak/bin/python main.py

frontend:               ## 仅启动前端
	cd frontend && npm run dev

lint:                   ## 运行 Ruff 检查后端代码
	cd backend && ruff check app/

lint-fix:               ## 自动修复 lint 问题
	cd backend && ruff check app/ --fix

api-docs:               ## 导出 OpenAPI schema 到 docs/openapi.json
	python scripts/export_openapi.py

fetch:                  ## 手动触发 RSS 抓取
	python scripts/scheduled_fetch.py --base-url http://localhost:5002

build:                  ## 构建桌面发布包
	bash scripts/build_release.sh

clean:                  ## 清理构建产物
	rm -rf dist/ build/ frontend/dist/

help:                   ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ==================== 本地预测试 ====================

lint-all:                ## 全量 lint + 前端构建验证（pre-push 快速门禁）
	cd backend && ruff check .
	cd frontend && npm run build

test:                    ## 运行全套测试（后端 + 前端）
	python -m pytest backend/tests/ -v --tb=short
	cd frontend && npm run test

test-quick:              ## 运行快速测试子集（约 10 秒，仅后端小文件 + 前端测试）
	python -m pytest \
	  backend/tests/test_security.py \
	  backend/tests/test_rss_parser.py \
	  backend/tests/test_graph_factory.py \
	  backend/tests/test_workflow_template_registry.py \
	  -v --tb=short
	cd frontend && npm run test

precheck: lint-all test  ## 完整本地门禁（发版前/推送前手动跑）

install-hooks:           ## 安装 git hooks（pre-commit + pre-push），仅需执行一次
	@bash scripts/install-hooks.sh
