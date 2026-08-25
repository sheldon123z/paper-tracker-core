from __future__ import annotations

import logging

from sqlalchemy import MetaData, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ..models import Feed, LLMConfig, Paper
from .encryption import current_key_version, rotate_value
from .llm_registry import infer_provider_key, json_dumps_or_none, normalize_base_url
from .migration_backup import backup_sqlite_engine

logger = logging.getLogger("paper-tracker.db_migrations")

_PAPER_COLUMNS: dict[str, str] = {
    "abstract_zh": "TEXT",
    "source_feed_id": "INTEGER REFERENCES feeds(id) ON DELETE SET NULL",
    "visibility": "VARCHAR(16) DEFAULT 'public' NOT NULL",
    "department_id": "INTEGER",
    "created_by_user_id": "INTEGER",
}

_SCOPED_COLUMNS: dict[str, str] = {
    "visibility": "VARCHAR(16) DEFAULT 'public' NOT NULL",
    "department_id": "INTEGER",
    "created_by_user_id": "INTEGER",
}

_USAGE_COLUMNS: dict[str, str] = {
    "user_id": "INTEGER",
    "department_id": "INTEGER",
    "request_type": "VARCHAR(32)",
    # Keep this nullable: legacy rows use the compatibility fallback until a
    # trustworthy call-time classification has been persisted.
    "is_local": "BOOLEAN",
}

_LLM_CONFIG_COLUMNS: dict[str, str] = {
    "key_version": "INTEGER DEFAULT 1",
    "api_format": "VARCHAR(64)",
    "extra_headers": "TEXT",
    "extra_body": "TEXT",
    "is_local": "BOOLEAN DEFAULT 0",
    "is_enabled": "BOOLEAN DEFAULT 1",
    "health_status": "VARCHAR(32) DEFAULT 'unknown'",
    "last_tested_at": "DATETIME",
    "last_error": "TEXT",
    "is_pinned": "BOOLEAN DEFAULT 0",
    "last_ttft_ms": "INTEGER",
    "last_tokens_per_second": "REAL",
    "user_tags": "TEXT",
}


def _tag_has_global_name_unique(engine: Engine) -> bool:
    tag_inspector = inspect(engine)
    if "name" not in {column["name"] for column in tag_inspector.get_columns("tags")}:
        return False
    return _has_global_column_unique(engine, "tags", "name")


def _has_global_column_unique(engine: Engine, table_name: str, column_name: str) -> bool:
    quoted_table = table_name.replace('"', '""')
    with engine.connect() as conn:
        indexes = conn.exec_driver_sql(f'PRAGMA index_list("{quoted_table}")').all()
        for index in indexes:
            # index_list columns: seq, name, unique, origin, partial
            if not index[2] or index[4]:
                continue
            quoted_index = str(index[1]).replace('"', '""')
            columns = [
                row[2] for row in conn.exec_driver_sql(
                    f'PRAGMA index_info("{quoted_index}")'
                ).all()
            ]
            if columns == [column_name]:
                return True
    return False


def _rebuild_scoped_unique_table(engine: Engine, model, column_name: str) -> None:
    """Rebuild a SQLite table so a legacy global unique column becomes scoped."""
    table_name = model.__tablename__
    if not _has_global_column_unique(engine, table_name, column_name):
        return

    old_columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
    model_columns = [column.name for column in model.__table__.columns]
    copied_columns = [name for name in model_columns if name in old_columns]
    temp_name = f"{table_name}_scope_rebuild"
    metadata = MetaData()
    for foreign_key in model.__table__.foreign_keys:
        foreign_key.column.table.to_metadata(metadata)
    temp_table = model.__table__.to_metadata(metadata, name=temp_name)
    for index in list(temp_table.indexes):
        temp_table.indexes.discard(index)

    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        conn.commit()
        try:
            with conn.begin():
                conn.execute(text(f"DROP TABLE IF EXISTS {temp_name}"))
                temp_table.create(conn)
                joined_columns = ", ".join(copied_columns)
                conn.execute(text(
                    f"INSERT INTO {temp_name} ({joined_columns}) "
                    f"SELECT {joined_columns} FROM {table_name}"
                ))
                conn.execute(text(f"DROP TABLE {table_name}"))
                conn.execute(text(f"ALTER TABLE {temp_name} RENAME TO {table_name}"))
            logger.info("Rebuilt %s to replace global %s uniqueness", table_name, column_name)
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            conn.commit()

    with engine.begin() as conn:
        for index in model.__table__.indexes:
            index.create(conn, checkfirst=True)
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{table_name}_scope "
            f"ON {table_name}(visibility, department_id)"
        ))


def _migrate_legacy_tag_uniqueness(engine: Engine) -> None:
    """Replace the legacy global ``tags.name`` uniqueness with scoped indexes."""
    tag_inspector = inspect(engine)
    if "name" not in {column["name"] for column in tag_inspector.get_columns("tags")}:
        return
    has_global_name_unique = _tag_has_global_name_unique(engine)

    if has_global_name_unique:
        columns = {column["name"] for column in tag_inspector.get_columns("tags")}
        color_expr = "color" if "color" in columns else "'#3B82F6'"
        updated_at_expr = "updated_at" if "updated_at" in columns else "CURRENT_TIMESTAMP"
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            conn.commit()
            try:
                with conn.begin():
                    conn.execute(text("DROP TABLE IF EXISTS tags_scope_rebuild"))
                    conn.execute(text("""
                        CREATE TABLE tags_scope_rebuild (
                            id INTEGER NOT NULL PRIMARY KEY,
                            name VARCHAR(64) NOT NULL,
                            color VARCHAR(16),
                            visibility VARCHAR(16) DEFAULT 'public' NOT NULL,
                            department_id INTEGER,
                            created_by_user_id INTEGER,
                            updated_at DATETIME,
                            CONSTRAINT ck_tag_visibility_department CHECK (
                                (visibility = 'public' AND department_id IS NULL) OR
                                (visibility = 'department' AND department_id IS NOT NULL)
                            )
                        )
                    """))
                    conn.execute(text(f"""
                        INSERT INTO tags_scope_rebuild (
                            id, name, color, visibility, department_id,
                            created_by_user_id, updated_at
                        )
                        SELECT id, name, {color_expr}, visibility, department_id,
                               created_by_user_id, {updated_at_expr}
                        FROM tags
                    """))
                    conn.execute(text("DROP TABLE tags"))
                    conn.execute(text("ALTER TABLE tags_scope_rebuild RENAME TO tags"))
                logger.info("Rebuilt tags table to remove legacy global name uniqueness")
            finally:
                conn.exec_driver_sql("PRAGMA foreign_keys=ON")
                conn.commit()

    with engine.begin() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tags_name ON tags(name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tags_scope ON tags(visibility, department_id)"))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_public_name
            ON tags(name) WHERE visibility = 'public'
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_department_name
            ON tags(name, department_id) WHERE visibility = 'department'
        """))


def migrate_database_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    needs_access_migration = any(
        table in table_names and "visibility" not in {c["name"] for c in inspector.get_columns(table)}
        for table in ("papers", "feeds", "tags")
    )
    needs_access_migration = needs_access_migration or (
        "tags" in table_names and _tag_has_global_name_unique(engine)
    )
    needs_access_migration = needs_access_migration or (
        "papers" in table_names and _has_global_column_unique(engine, "papers", "link")
    ) or (
        "feeds" in table_names and _has_global_column_unique(engine, "feeds", "url")
    )
    if needs_access_migration:
        backup = backup_sqlite_engine(engine, "papers")
        logger.info("Created pre-migration paper backup: %s", backup)

    # --- papers column + index migrations ---
    if "papers" in table_names:
        existing_paper_columns = {col["name"] for col in inspector.get_columns("papers")}
        paper_col_statements = [
            f"ALTER TABLE papers ADD COLUMN {name} {ddl}"
            for name, ddl in _PAPER_COLUMNS.items()
            if name not in existing_paper_columns
        ]
        if paper_col_statements:
            with engine.begin() as conn:
                for stmt in paper_col_statements:
                    conn.execute(text(stmt))
                    logger.info("Applied schema migration: %s", stmt)

        _PAPER_INDEXES = [
            ("ix_papers_source", "CREATE INDEX IF NOT EXISTS ix_papers_source ON papers(source)"),
            ("ix_papers_category", "CREATE INDEX IF NOT EXISTS ix_papers_category ON papers(category)"),
            ("ix_papers_created_at", "CREATE INDEX IF NOT EXISTS ix_papers_created_at ON papers(created_at)"),
            ("ix_papers_published_date", "CREATE INDEX IF NOT EXISTS ix_papers_published_date ON papers(published_date)"),
            ("ix_papers_relevance", "CREATE INDEX IF NOT EXISTS ix_papers_relevance ON papers(relevance)"),
            ("ix_papers_source_feed_id", "CREATE INDEX IF NOT EXISTS ix_papers_source_feed_id ON papers(source_feed_id)"),
            ("ix_papers_scope", "CREATE INDEX IF NOT EXISTS ix_papers_scope ON papers(visibility, department_id)"),
        ]
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("papers")}
        with engine.begin() as conn:
            for idx_name, ddl in _PAPER_INDEXES:
                if idx_name not in existing_indexes:
                    conn.execute(text(ddl))
                    logger.info("Created index: %s", idx_name)

    for table in ("feeds", "tags"):
        if table in table_names:
            existing = {col["name"] for col in inspector.get_columns(table)}
            with engine.begin() as conn:
                for name, ddl in _SCOPED_COLUMNS.items():
                    if name not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_scope ON {table}(visibility, department_id)"))

    if "tags" in table_names:
        _migrate_legacy_tag_uniqueness(engine)
    if "feeds" in table_names:
        _rebuild_scoped_unique_table(engine, Feed, "url")
    if "papers" in table_names:
        _rebuild_scoped_unique_table(engine, Paper, "link")

    # --- llm_configs column migrations ---
    if "llm_configs" in table_names:
        existing_columns = {column["name"] for column in inspector.get_columns("llm_configs")}
        statements = [
            f"ALTER TABLE llm_configs ADD COLUMN {name} {ddl}"
            for name, ddl in _LLM_CONFIG_COLUMNS.items()
            if name not in existing_columns
        ]
        if statements:
            with engine.begin() as conn:
                for statement in statements:
                    conn.execute(text(statement))
                    logger.info("Applied schema migration: %s", statement)

    # --- llm_usage_logs table ---
    if "llm_usage_logs" not in table_names:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE llm_usage_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_id INTEGER REFERENCES llm_configs(id),
                    provider VARCHAR(64) NOT NULL,
                    model_name VARCHAR(128) NOT NULL,
                    is_local BOOLEAN,
                    agent_type VARCHAR(32),
                    session_id VARCHAR(64),
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    duration_ms INTEGER DEFAULT 0,
                    ttft_ms INTEGER,
                    tokens_per_second REAL,
                    tool_calls_count INTEGER DEFAULT 0,
                    status VARCHAR(16) DEFAULT 'success',
                    error_code VARCHAR(32),
                    user_id INTEGER,
                    department_id INTEGER,
                    request_type VARCHAR(32),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_config_id ON llm_usage_logs(config_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_agent_type ON llm_usage_logs(agent_type)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_session_id ON llm_usage_logs(session_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_created_at ON llm_usage_logs(created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_user_created ON llm_usage_logs(user_id, created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_department_created ON llm_usage_logs(department_id, created_at)"))
            logger.info("Created table: llm_usage_logs")
    else:
        existing = {col["name"] for col in inspector.get_columns("llm_usage_logs")}
        with engine.begin() as conn:
            for name, ddl in _USAGE_COLUMNS.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE llm_usage_logs ADD COLUMN {name} {ddl}"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_user_created ON llm_usage_logs(user_id, created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_department_created ON llm_usage_logs(department_id, created_at)"))

    for table in ("chat_messages", "global_chat_sessions"):
        if table in table_names:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if "user_id" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_user_id ON {table}(user_id)"))

    if "global_chat_sessions" in table_names:
        existing = {col["name"] for col in inspector.get_columns("global_chat_sessions")}
        with engine.begin() as conn:
            if "paper_id" not in existing:
                conn.execute(text(
                    "ALTER TABLE global_chat_sessions ADD COLUMN paper_id "
                    "INTEGER REFERENCES papers(id) ON DELETE SET NULL"
                ))
            if "updated_at" not in existing:
                conn.execute(text(
                    "ALTER TABLE global_chat_sessions ADD COLUMN updated_at DATETIME"
                ))
            conn.execute(text(
                "UPDATE global_chat_sessions "
                "SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_global_chat_sessions_paper_id "
                "ON global_chat_sessions(paper_id)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_global_chat_sessions_updated_at "
                "ON global_chat_sessions(updated_at)"
            ))

    if "chat_messages" in table_names and "workflow_sessions" in table_names:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE chat_messages
                SET user_id = (
                    SELECT workflow_sessions.user_id FROM workflow_sessions
                    WHERE workflow_sessions.session_id = chat_messages.session_id
                )
                WHERE session_type = 'workflow' AND user_id IS NULL
            """))

    # --- llm_budget_configs table ---
    if "llm_budget_configs" not in table_names:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE llm_budget_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_id INTEGER REFERENCES llm_configs(id),
                    budget_type VARCHAR(16) NOT NULL,
                    monthly_limit REAL NOT NULL,
                    alert_threshold REAL DEFAULT 0.8,
                    is_enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Created table: llm_budget_configs")


    # --- paper_files table ---
    if "paper_files" not in table_names:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE paper_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    paper_id INTEGER NOT NULL REFERENCES papers(id),
                    filename VARCHAR(512) NOT NULL,
                    storage_path VARCHAR(1024) NOT NULL,
                    file_type VARCHAR(32) NOT NULL,
                    content_type VARCHAR(128) NOT NULL,
                    file_size INTEGER DEFAULT 0,
                    content_hash VARCHAR(64),
                    is_primary BOOLEAN DEFAULT 0,
                    annotations_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_files_paper_id ON paper_files(paper_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_files_content_hash ON paper_files(content_hash)"))
            logger.info("Created table: paper_files")

    # --- paper_files column migrations ---
    _PAPER_FILE_COLUMNS: dict[str, str] = {
        "content_hash": "VARCHAR(64)",
        "parse_status": "VARCHAR(32)",
        "parse_error": "TEXT",
        "parsed_file_id": "INTEGER",
        "mineru_task_id": "VARCHAR(128)",
    }
    if "paper_files" in table_names:
        existing_columns = {col["name"] for col in inspector.get_columns("paper_files")}
        pf_statements = [
            f"ALTER TABLE paper_files ADD COLUMN {name} {ddl}"
            for name, ddl in _PAPER_FILE_COLUMNS.items()
            if name not in existing_columns
        ]
        if pf_statements:
            with engine.begin() as conn:
                for stmt in pf_statements:
                    conn.execute(text(stmt))
                    logger.info("Applied schema migration: %s", stmt)
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_paper_files_content_hash "
                "ON paper_files(content_hash)"
            ))

    # --- workflow_sessions column migrations ---
    _WORKFLOW_SESSION_COLUMNS: dict[str, str] = {
        "user_id": "INTEGER REFERENCES users(id)",
    }
    if "workflow_sessions" in table_names:
        existing_columns = {col["name"] for col in inspector.get_columns("workflow_sessions")}
        ws_statements = [
            f"ALTER TABLE workflow_sessions ADD COLUMN {name} {ddl}"
            for name, ddl in _WORKFLOW_SESSION_COLUMNS.items()
            if name not in existing_columns
        ]
        if ws_statements:
            with engine.begin() as conn:
                for stmt in ws_statements:
                    conn.execute(text(stmt))
                    logger.info("Applied schema migration: %s", stmt)


def migrate_llm_config_rows(db: Session) -> None:
    changed = False
    for config in db.query(LLMConfig).all():
        inferred_provider = infer_provider_key(
            config.provider,
            config.base_url,
            model_name=config.model_name,
            display_name=config.display_name,
        )
        normalized_base_url = normalize_base_url(inferred_provider, config.base_url)
        if config.provider != inferred_provider:
            config.provider = inferred_provider
            changed = True
        if normalized_base_url != config.base_url:
            config.base_url = normalized_base_url
            changed = True
        if getattr(config, "key_version", None) is None:
            config.key_version = 1
            changed = True
        if not getattr(config, "api_format", None):
            config.api_format = "openai_compatible" if inferred_provider in {
                "volcengine_ark",
                "dashscope",
                "moonshot",
                "zhipu",
                "vllm",
                "lmstudio",
                "openai_compatible",
            } else "native"
            changed = True
        if getattr(config, "extra_headers", None) is None:
            config.extra_headers = json_dumps_or_none({})
            changed = True
        if getattr(config, "extra_body", None) is None:
            config.extra_body = json_dumps_or_none({})
            changed = True
        if getattr(config, "is_enabled", None) is None:
            config.is_enabled = True
            changed = True
        if getattr(config, "health_status", None) is None:
            config.health_status = "unknown"
            changed = True
        if inferred_provider in {"ollama", "vllm", "lmstudio"} and not getattr(config, "is_local", False):
            config.is_local = True
            changed = True
        stored_key_version = getattr(config, "key_version", None) or 1
        if config.api_key_encrypted and stored_key_version != current_key_version():
            try:
                config.api_key_encrypted = rotate_value(config.api_key_encrypted)
                config.key_version = current_key_version()
                changed = True
            except Exception as exc:
                logger.warning("Failed to rotate LLM config key for id=%s: %s", config.id, exc)

    if changed:
        db.commit()
        logger.info("Migrated legacy llm_configs rows to provider registry format.")
