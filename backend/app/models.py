from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base

paper_tag_association = Table(
    "paper_tag_association",
    Base.metadata,
    Column("paper_id", Integer, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False)
    authors = Column(String(512), default="")
    abstract = Column(Text, default="")
    link = Column(String(1024), unique=True, index=True)
    source = Column(String(128), default="rss", index=True)
    published_date = Column(DateTime, nullable=True, index=True)
    relevance = Column(Float, default=0.0, index=True)
    category = Column(String(128), default="Uncategorized", index=True)
    is_read = Column(Boolean, default=False)
    is_favorited = Column(Boolean, default=False)
    notes = Column(Text, default="")
    tags = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    # New fields for Phase 1
    arxiv_id = Column(String(64), nullable=True, index=True)
    doi = Column(String(256), nullable=True, index=True)
    pdf_url = Column(String(1024), nullable=True)
    ai_summary = Column(Text, nullable=True)
    content_hash = Column(String(64), nullable=True, index=True)
    abstract_zh = Column(Text, nullable=True)
    source_feed_id = Column(Integer, ForeignKey("feeds.id", ondelete="SET NULL"), nullable=True, index=True)

    source_feed = relationship("Feed", back_populates="papers")
    files = relationship("PaperFile", back_populates="paper", cascade="all, delete-orphan", passive_deletes=True)
    chat_messages = relationship(
        "ChatMessage", back_populates="paper", cascade="all, delete-orphan", passive_deletes=True
    )
    paper_tags_rel = relationship(
        "PaperTag", back_populates="paper", cascade="all, delete-orphan", passive_deletes=True
    )


class Feed(Base):
    __tablename__ = "feeds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    url = Column(String(1024), nullable=False, unique=True)
    source = Column(String(128), default="rss")
    last_fetched = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    # New fields for Phase 1
    fetch_interval = Column(Integer, default=120)
    last_error = Column(Text, nullable=True)

    papers = relationship("Paper", back_populates="source_feed", passive_deletes=True)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), unique=True, nullable=False, index=True)
    color = Column(String(16), default="#3B82F6")
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    paper_tags = relationship("PaperTag", back_populates="tag")


class PaperTag(Base):
    __tablename__ = "paper_tags"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    paper = relationship("Paper", back_populates="paper_tags_rel")
    tag = relationship("Tag", back_populates="paper_tags")


class LLMConfig(Base):
    __tablename__ = "llm_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(64), nullable=False)
    display_name = Column(String(128), nullable=True)
    api_key_encrypted = Column(Text, nullable=False)
    key_version = Column(Integer, default=1)
    model_name = Column(String(128), nullable=False)
    base_url = Column(String(512), nullable=True)
    api_format = Column(String(64), nullable=True)
    extra_headers = Column(Text, nullable=True)
    extra_body = Column(Text, nullable=True)
    is_local = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    health_status = Column(String(32), default="unknown")
    last_tested_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    last_ttft_ms = Column(Integer, nullable=True)
    last_tokens_per_second = Column(Float, nullable=True)
    user_tags = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class LLMUsageLog(Base):
    __tablename__ = "llm_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("llm_configs.id"), nullable=True, index=True)
    provider = Column(String(64), nullable=False)
    model_name = Column(String(128), nullable=False)
    agent_type = Column(String(32), nullable=True, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    duration_ms = Column(Integer, default=0)
    ttft_ms = Column(Integer, nullable=True)
    tokens_per_second = Column(Float, nullable=True)
    tool_calls_count = Column(Integer, default=0)
    status = Column(String(16), default="success")
    error_code = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), index=True)


class LLMBudgetConfig(Base):
    __tablename__ = "llm_budget_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("llm_configs.id"), nullable=True)
    budget_type = Column(String(16), nullable=False)  # "tokens" | "cost"
    monthly_limit = Column(Float, nullable=False)
    alert_threshold = Column(Float, default=0.8)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    prompt_text = Column(Text, nullable=False)
    icon = Column(String(32), default="chat")
    sort_order = Column(Integer, default=0)
    is_builtin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    session_type = Column(String(16), nullable=False)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    paper = relationship("Paper", back_populates="chat_messages")


class GlobalChatSession(Base):
    __tablename__ = "global_chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    title = Column(String(256), default="New Session")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class WorkflowSession(Base):
    __tablename__ = "workflow_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    # Logical FK to control_plane.users.id (cross-Base, not enforced at DB level)
    user_id = Column(Integer, nullable=True, index=True)
    title = Column(String(256), default="新工作流")
    template_id = Column(String(64), nullable=False)
    research_topic = Column(String(512), default="")
    template_params_json = Column(Text, default="{}")
    state_snapshot_json = Column(Text, default="{}")
    workflow_status = Column(String(32), default="idle")
    current_stage = Column(String(64), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class SystemPromptConfig(Base):
    __tablename__ = "system_prompt_configs"

    id = Column(Integer, primary_key=True, index=True)
    prompt_type = Column(String(32), nullable=False, unique=True, index=True)  # "paper" | "global" | "assistant"
    name = Column(String(128), nullable=False)
    prompt_text = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AgentSkill(Base):
    __tablename__ = "agent_skills"

    id = Column(Integer, primary_key=True, index=True)
    tool_name = Column(String(64), nullable=False)
    agent_type = Column(String(32), nullable=False)  # "paper" | "global" | "assistant"
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("tool_name", "agent_type", name="uq_skill_agent"),)


class PaperFile(Base):
    __tablename__ = "paper_files"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(512), nullable=False)
    storage_path = Column(String(1024), nullable=False)
    file_type = Column(String(32), nullable=False)  # pdf|markdown|text
    content_type = Column(String(128), nullable=False)
    file_size = Column(Integer, default=0)
    is_primary = Column(Boolean, default=False)
    annotations_json = Column(Text, nullable=True)
    parse_status = Column(String(32), nullable=True)  # None|pending|processing|completed|failed
    parse_error = Column(Text, nullable=True)
    parsed_file_id = Column(Integer, nullable=True)  # ID of generated markdown PaperFile
    mineru_task_id = Column(String(128), nullable=True)  # MinerU batch_id for tracking
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    paper = relationship("Paper", back_populates="files")


class MessageFeedback(Base):
    __tablename__ = "message_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String(128), index=True)
    session_id = Column(String(64), index=True)
    session_type = Column(String(16))
    feedback_type = Column(String(16))
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("message_id", "session_id", name="uq_feedback_msg_session"),)
