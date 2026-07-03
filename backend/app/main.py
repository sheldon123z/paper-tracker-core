import logging
import os
import sys
from datetime import UTC, datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from .control_plane.database import ControlBase, control_engine
from .database import Base, engine, get_db
from .models import ChatMessage, GlobalChatSession, Paper
from .routes import limiter
from .routes.agui import router as agui_router
from .routes.agui_workflow import router as agui_workflow_router
from .routes.auth import router as auth_router
from .routes.budget import router as budget_router
from .routes.feedback import router as feedback_router
from .routes.feeds import router as feeds_router
from .routes.files import router as files_router
from .routes.llm_config import router as llm_config_router
from .routes.papers import router as papers_router
from .routes.prompt_templates import router as prompt_templates_router
from .routes.scheduler_routes import router as scheduler_router
from .routes.skills import router as skills_router
from .routes.system_prompts import router as system_prompts_router
from .routes.tags import router as tags_router
from .routes.usage import router as usage_router
from .schemas import StatsOut
from .services.checkpointer import close_checkpointer, open_checkpointer
from .services.d1_sync import register_sync_job
from .services.db_backup import perform_backup, schedule_backups
from .services.db_migrations import migrate_database_schema, migrate_llm_config_rows
from .services.scheduler import get_scheduler, init_scheduler, shutdown_scheduler
from .services.seed import (
    ensure_new_skills,
    migrate_llm_configs,
    seed_agent_skills,
    seed_llm_configs,
    seed_prompt_templates,
    seed_system_prompts,
)
from .settings import load_environment, validate_runtime_secrets, validate_secrets

load_environment()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("paper-tracker")

tags_metadata = [
    {"name": "papers", "description": "论文 CRUD、搜索、批量操作、BibTeX 导出"},
    {"name": "feeds", "description": "RSS 订阅源管理"},
    {"name": "ag-ui", "description": "AG-UI 流式 AI 对话端点"},
    {"name": "ag-ui-workflow", "description": "多阶段科研工作流"},
    {"name": "llm-configs", "description": "LLM 模型配置管理 (加密存储)"},
    {"name": "usage", "description": "LLM 使用统计与审计"},
    {"name": "budget", "description": "LLM 预算管理"},
    {"name": "auth", "description": "用户认证 (JWT)"},
    {"name": "tags", "description": "标签管理"},
    {"name": "skills", "description": "Agent 技能配置"},
    {"name": "prompt-templates", "description": "Prompt 模板管理"},
    {"name": "system-prompts", "description": "系统提示词管理"},
    {"name": "files", "description": "论文附件管理"},
    {"name": "feedback", "description": "用户反馈"},
    {"name": "scheduler", "description": "定时任务调度"},
]

app = FastAPI(
    title="Paper Tracker Core API",
    version="2.0.0",
    description="学术论文追踪系统 API — 支持 RSS 聚合、AI 分析、多阶段科研工作流",
    openapi_tags=tags_metadata,
)

# Rate limiting setup (shared limiter instance from routes/__init__.py)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3457").split(",") if origin.strip()]
if "*" in origins:
    logger.warning("⚠️  CORS_ORIGINS contains wildcard '*'. This is insecure for production.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Body size limit middleware — streaming byte count (not just Content-Length)
# ---------------------------------------------------------------------------
MAX_BODY_SIZE = int(os.getenv("MAX_BODY_SIZE", str(10 * 1024 * 1024)))  # 10 MB default

# Paths that are exempt from body size limits (e.g. file uploads with their own checks)
# 收紧豁免规则，仅精确匹配上传路由
def is_upload_endpoint(path: str, method: str) -> bool:
    """Check if the request is an upload endpoint that should be exempt from body size limits."""
    # 仅豁免 POST 请求到 /api/papers/{paper_id}/files（文件上传）
    if method == "POST":
        # 匹配 /api/papers/1/files 或 /api/papers/123/files/ 格式
        import re
        if re.match(r"^/api/papers/[1-9]\d*/files/?$", path):
            return True
    return False


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    """Reject requests whose body exceeds MAX_BODY_SIZE.

    Works for both Content-Length and chunked/streaming transfers:
    1. Fast-reject when Content-Length header exceeds the limit.
    2. Stream the body and abort if cumulative bytes exceed the limit.
    """
    path = request.url.path

    # Skip for exempt paths (file uploads handled separately) and safe methods
    if request.method in ("GET", "HEAD", "OPTIONS", "DELETE"):
        return await call_next(request)
    if is_upload_endpoint(path, request.method):
        return await call_next(request)

    # 1) Fast-reject via Content-Length header (if present)
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_BODY_SIZE:
                return PlainTextResponse("Request body too large", status_code=413)
        except ValueError:
            pass

    # 2) Stream-based check: wrap the receive channel to count bytes
    received = 0

    original_receive = request._receive

    async def _counting_receive():
        nonlocal received
        message = await original_receive()
        if message.get("type") == "http.request":
            body = message.get("body", b"")
            received += len(body)
            if received > MAX_BODY_SIZE:
                raise HTTPException(status_code=413, detail="Request body too large")
        return message

    request._receive = _counting_receive

    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' http://localhost:* ws://localhost:* https://*.sheldon123z.win https://paper.sheldon123z.win; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return response


# ---------------------------------------------------------------------------
# Request body size limit for AG-UI streaming endpoints (Issue #27)
# ---------------------------------------------------------------------------
MAX_BODY_SIZE = 1024 * 1024  # 1 MB
_AG_UI_PREFIXES = ("/api/agui/", "/api/copilotkit")


@app.middleware("http")
async def limit_agui_body_size(request: Request, call_next):
    """Reject oversized request bodies on AG-UI endpoints early."""
    if request.method == "POST" and any(
        request.url.path.startswith(p) for p in _AG_UI_PREFIXES
    ):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_BODY_SIZE:
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large (max 1 MB)"},
                    )
            except (ValueError, TypeError):
                pass
    return await call_next(request)


# SlowAPIMiddleware must be added after other middleware so rate limiting
# is checked early in the request lifecycle (middleware executes in reverse order)
app.add_middleware(SlowAPIMiddleware)


app.include_router(feeds_router)
app.include_router(papers_router)
app.include_router(llm_config_router)
app.include_router(prompt_templates_router)
app.include_router(tags_router)
app.include_router(scheduler_router)
app.include_router(system_prompts_router)
app.include_router(agui_router)
app.include_router(agui_workflow_router)
app.include_router(skills_router)
app.include_router(feedback_router)
app.include_router(usage_router)
app.include_router(budget_router)
app.include_router(auth_router)
app.include_router(files_router)


@app.on_event("startup")
def startup_event():
    # Validate critical security secrets first
    validation_errors = validate_secrets()
    if validation_errors:
        error_msg = "Security configuration errors:\n" + "\n".join(f"  - {err}" for err in validation_errors)
        logger.critical(error_msg)
        raise SystemExit(error_msg)

    # Log optional runtime secrets status
    runtime_status = validate_runtime_secrets()
    missing = [name for name, is_set in runtime_status.items() if not is_set]
    if missing:
        logger.info("Optional security hardening not configured: %s", ", ".join(missing))
        logger.info("For production deployment, consider setting: COPILOT_RUNTIME_SECRET, LLM_CONFIG_ADMIN_TOKEN, SYNC_SECRET")

    Base.metadata.create_all(bind=engine)
    migrate_database_schema(engine)
    logger.info("Database initialized.")
    ControlBase.metadata.create_all(bind=control_engine)
    logger.info("Control plane database initialized.")
    db = next(get_db())
    try:
        migrate_llm_config_rows(db)
        seed_prompt_templates(db)
        migrate_llm_configs(db)
        seed_llm_configs(db)
        seed_system_prompts(db)
        seed_agent_skills(db)
        ensure_new_skills(db)
        _fix_double_prefix_sessions(db)
    finally:
        db.close()
    init_scheduler()

    # Register D1 sync job if SYNC_SECRET is configured (and not the default placeholder)
    sync_secret = os.getenv("SYNC_SECRET", "").strip()
    if sync_secret and sync_secret != "your-sync-secret-here":
        register_sync_job(get_scheduler())

    # Register periodic database backup and run one immediately on startup
    schedule_backups(get_scheduler())
    perform_backup()


def _fix_double_prefix_sessions(db: Session):
    """One-time migration: fix session_ids with double 'ast-ast-' prefix."""
    bad_sessions = db.query(GlobalChatSession).filter(
        GlobalChatSession.session_id.like("ast-ast-%")
    ).all()
    if not bad_sessions:
        return
    for s in bad_sessions:
        fixed_id = s.session_id.replace("ast-ast-", "ast-", 1)
        # Check if the target already exists
        existing = db.query(GlobalChatSession).filter(
            GlobalChatSession.session_id == fixed_id
        ).first()
        if existing:
            # Merge messages into the existing session, then delete the bad one
            db.query(ChatMessage).filter(
                ChatMessage.session_id == s.session_id
            ).update({"session_id": fixed_id})
            db.delete(s)
        else:
            # Rename session and its messages
            db.query(ChatMessage).filter(
                ChatMessage.session_id == s.session_id
            ).update({"session_id": fixed_id})
            s.session_id = fixed_id
    db.commit()
    logger.info("Fixed %d double-prefix session(s)", len(bad_sessions))


@app.on_event("startup")
async def startup_checkpointer():
    await open_checkpointer()


@app.on_event("shutdown")
def shutdown_event():
    shutdown_scheduler()


@app.on_event("shutdown")
async def shutdown_checkpointer():
    await close_checkpointer()


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return PlainTextResponse("Internal server error", status_code=500)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "paper-tracker-core"}


@app.get("/api/stats", response_model=StatsOut)
def get_stats(
    period: int = Query(default=30, ge=1, le=365, description="Number of days for papers_over_time"),
    db: Session = Depends(get_db),
):
    total_papers = db.query(func.count(Paper.id)).scalar() or 0
    unread_papers = db.query(func.count(Paper.id)).filter(Paper.is_read.is_(False)).scalar() or 0
    favorited_papers = db.query(func.count(Paper.id)).filter(Paper.is_favorited.is_(True)).scalar() or 0
    avg_relevance = db.query(func.avg(Paper.relevance)).scalar() or 0.0

    source_distribution = {
        source: count
        for source, count in db.query(Paper.source, func.count(Paper.id)).group_by(Paper.source).all()
    }
    category_distribution = {
        category: count
        for category, count in db.query(Paper.category, func.count(Paper.id)).group_by(Paper.category).all()
    }

    cutoff = datetime.now(UTC) - timedelta(days=period)
    papers_over_time = {
        day: count
        for day, count in db.query(
            func.strftime("%Y-%m-%d", Paper.created_at), func.count(Paper.id)
        )
        .filter(Paper.created_at >= cutoff)
        .group_by(func.strftime("%Y-%m-%d", Paper.created_at))
        .all()
    }

    return StatsOut(
        total_papers=total_papers,
        unread_papers=unread_papers,
        favorited_papers=favorited_papers,
        avg_relevance=round(float(avg_relevance), 2),
        source_distribution=source_distribution,
        category_distribution=category_distribution,
        papers_over_time=papers_over_time,
    )


# ---------- Static file serving (packaged mode) ----------
# MUST be registered LAST — the catch-all /{path:path} would shadow any route defined after it.
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist')
if getattr(sys, 'frozen', False):
    _FRONTEND_DIST = os.path.join(sys._MEIPASS, 'frontend', 'dist')

if os.path.isdir(_FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="static-assets")

    _frontend_dist_resolved = os.path.realpath(_FRONTEND_DIST)

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve frontend static files; fall back to index.html for SPA routes."""
        # Prevent path traversal: ensure resolved path stays under the static dir
        file_path = os.path.realpath(os.path.join(_FRONTEND_DIST, path))
        if not file_path.startswith(_frontend_dist_resolved + os.sep) and file_path != _frontend_dist_resolved:
            raise HTTPException(status_code=403)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
