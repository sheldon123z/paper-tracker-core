.PHONY: dev backend frontend lint lint-fix api-docs fetch build clean help

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
