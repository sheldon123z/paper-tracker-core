from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_serializer


class FeedBase(BaseModel):
    name: str
    url: str
    source: str = "rss"
    is_active: bool = True
    fetch_interval: int = Field(default=18000, description="Automatic fetch interval in seconds")


class FeedCreate(FeedBase):
    fetch_interval: int = Field(default=18000, ge=60, description="Automatic fetch interval in seconds")


class FeedUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    source: str | None = None
    is_active: bool | None = None
    fetch_interval: int | None = Field(default=None, ge=60, description="Automatic fetch interval in seconds")


class FeedOut(FeedBase):
    id: int
    last_fetched: datetime | None = None
    last_error: str | None = None

    @field_serializer("last_fetched", when_used="json")
    def serialize_last_fetched(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        # SQLite drops timezone metadata from DateTime columns. Values written by
        # the ingester are UTC, so restore that metadata before sending JSON.
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")

    class Config:
        from_attributes = True


class PaperBase(BaseModel):
    title: str
    authors: str = ""
    abstract: str = ""
    link: str | None = None
    source: str = "rss"
    published_date: datetime | None = None
    relevance: float = 0.0
    category: str = "Uncategorized"
    is_read: bool = False
    is_favorited: bool = False
    notes: str = ""
    tags: str = ""


class PaperOut(PaperBase):
    id: int
    created_at: datetime
    arxiv_id: str | None = None
    doi: str | None = None
    pdf_url: str | None = None
    ai_summary: str | None = None
    abstract_zh: str | None = None
    source_feed_id: int | None = None

    class Config:
        from_attributes = True


class PaperPatch(BaseModel):
    relevance: float | None = None
    category: str | None = None
    is_read: bool | None = None
    is_favorited: bool | None = None
    notes: str | None = None


class TagOut(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


class TagWithCount(BaseModel):
    id: int
    name: str
    color: str
    paper_count: int = 0

    class Config:
        from_attributes = True


class TagCreate(BaseModel):
    name: str
    color: str = "#3b82f6"


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagAssignRequest(BaseModel):
    tags: list[str] = Field(default_factory=list)
    default_color: str = "#3B82F6"


class BatchActionRequest(BaseModel):
    paper_ids: list[int] = Field(default_factory=list)
    action: str  # e.g. "mark_read", "mark_unread", "favorite", "unfavorite", "delete"


class DuplicateMergeRequest(BaseModel):
    keep_id: int
    merge_ids: list[int] = Field(default_factory=list)


class StatsOut(BaseModel):
    total_papers: int
    unread_papers: int
    favorited_papers: int
    avg_relevance: float
    source_distribution: dict[str, int]
    category_distribution: dict[str, int]
    papers_over_time: dict[str, int]


class PaginationMeta(BaseModel):
    total: int
    page: int
    size: int


class PaperListResponse(BaseModel):
    items: list[PaperOut]
    meta: PaginationMeta


# LLM Config schemas
class LLMConfigCreate(BaseModel):
    provider: str
    display_name: str | None = None
    api_key: str | None = None
    model_name: str
    base_url: str | None = None
    api_format: str | None = None
    extra_headers: dict[str, str] = Field(default_factory=dict)
    extra_body: dict[str, Any] = Field(default_factory=dict)
    is_local: bool = False
    is_enabled: bool = True
    is_default: bool = False


class ProviderCapabilitiesOut(BaseModel):
    supports_streaming: bool
    supports_tool_calling: bool
    supports_reasoning: bool
    supports_vision: bool


class LLMConfigOut(BaseModel):
    id: int
    provider: str
    provider_label: str | None = None
    display_name: str | None = None
    model_name: str
    base_url: str | None = None
    effective_base_url: str | None = None
    api_format: str | None = None
    extra_headers: dict[str, str] = Field(default_factory=dict)
    extra_body: dict[str, Any] = Field(default_factory=dict)
    is_default: bool
    requires_api_key: bool = True
    is_local: bool = False
    is_enabled: bool = True
    health_status: str = "unknown"
    last_tested_at: datetime | None = None
    last_error: str | None = None
    is_pinned: bool = False
    last_ttft_ms: int | None = None
    last_tokens_per_second: float | None = None
    user_tags: list[str] = Field(default_factory=list)
    capabilities: ProviderCapabilitiesOut
    created_at: datetime


class LLMConfigUpdate(BaseModel):
    provider: str | None = None
    display_name: str | None = None
    api_key: str | None = None
    model_name: str | None = None
    base_url: str | None = None
    api_format: str | None = None
    extra_headers: dict[str, str] | None = None
    extra_body: dict[str, Any] | None = None
    is_local: bool | None = None
    is_enabled: bool | None = None
    is_default: bool | None = None
    is_pinned: bool | None = None
    user_tags: list[str] | None = None


# Prompt Template schemas
class PromptTemplateCreate(BaseModel):
    name: str
    prompt_text: str
    icon: str = "chat"
    sort_order: int = 0
    is_builtin: bool = False


class PromptTemplateOut(BaseModel):
    id: int
    name: str
    prompt_text: str
    icon: str
    sort_order: int
    is_builtin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    prompt_text: str | None = None
    icon: str | None = None
    sort_order: int | None = None


# Chat schemas
class ChatMessageOut(BaseModel):
    id: int
    paper_id: int | None = None
    session_id: str | None = None
    session_type: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True



class LLMConfigBrief(BaseModel):
    id: int
    label: str
    provider: str
    provider_label: str
    is_default: bool
    health_status: str
    is_local: bool
    is_pinned: bool = False
    supports_streaming: bool = True
    supports_tool_calling: bool
    supports_reasoning: bool


class LLMProviderOption(BaseModel):
    key: str
    label: str
    description: str = ""
    default_base_url: str | None = None
    requires_api_key: bool = True
    is_local: bool = False
    allows_custom_headers: bool = False
    supports_reasoning: bool = False
    supports_streaming: bool = True
    supports_tools: bool = True
    default_model_hint: str = ""
    api_format: str = "native"


class LLMTestResult(BaseModel):
    success: bool
    status: str
    message: str
    provider: str | None = None
    model: str | None = None
    invoke_ok: bool = False
    streaming_ok: bool = False
    error_code: str | None = None
    ttft_ms: int | None = None
    tokens_per_second: float | None = None
    invoke_latency_ms: int | None = None


class GlobalChatSessionOut(BaseModel):
    id: int
    session_id: str
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


# System Prompt Config schemas
class SystemPromptConfigOut(BaseModel):
    id: int
    prompt_type: str
    name: str
    prompt_text: str
    is_active: bool

    class Config:
        from_attributes = True


class SystemPromptConfigUpdate(BaseModel):
    name: str | None = None
    prompt_text: str | None = None
    is_active: bool | None = None


# Agent Skill schemas
class AgentSkillOut(BaseModel):
    id: int
    tool_name: str
    agent_type: str
    is_enabled: bool

    class Config:
        from_attributes = True


class AgentSkillUpdate(BaseModel):
    is_enabled: bool


class AgentSkillCreate(BaseModel):
    tool_name: str
    agent_type: str
    is_enabled: bool = True


# LLM Usage schemas
class LLMUsageLogOut(BaseModel):
    id: int
    config_id: int | None = None
    provider: str
    model_name: str
    agent_type: str | None = None
    session_id: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    duration_ms: int = 0
    ttft_ms: int | None = None
    tokens_per_second: float | None = None
    tool_calls_count: int = 0
    status: str = "success"
    error_code: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UsageSummaryOut(BaseModel):
    total_calls: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    avg_duration_ms: float = 0.0
    avg_ttft_ms: float | None = None
    avg_tokens_per_second: float | None = None
    error_count: int = 0
    period_days: int = 30


class UsageByModelItem(BaseModel):
    config_id: int | None = None
    provider: str
    model_name: str
    call_count: int = 0
    total_tokens: int = 0
    avg_duration_ms: float = 0.0


class UsageTimelinePoint(BaseModel):
    date: str
    calls: int = 0
    tokens: int = 0


class LLMConfigBatchAction(BaseModel):
    config_ids: list[int] = Field(default_factory=list)
    action: str  # enable, disable, delete, pin, unpin


# Paper File schemas
class PaperFileOut(BaseModel):
    id: int
    paper_id: int
    filename: str
    storage_path: str
    file_type: str
    content_type: str
    file_size: int = 0
    is_primary: bool = False
    annotations_json: str | None = None
    parse_status: str | None = None
    parse_error: str | None = None
    parsed_file_id: int | None = None
    mineru_task_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class PaperFileUpdate(BaseModel):
    is_primary: bool | None = None
    annotations_json: Any | None = None
