import logging
import os

from sqlalchemy.orm import Session

from ..models import AgentSkill, LLMConfig, PromptTemplate, SystemPromptConfig
from ..settings import get_secret_value
from .encryption import current_key_version, encrypt_value
from .llm_registry import (
    get_provider_profile,
    infer_provider_key,
    json_dumps_or_none,
    normalize_base_url,
    resolve_api_key,
    validate_base_url,
)

logger = logging.getLogger(__name__)

_BUILTIN_TEMPLATES = [
    {
        "name": "论文摘要",
        "prompt_text": (
            "请用中文为以下论文提供简洁的摘要，涵盖其主要贡献、方法论和关键结果（3-5 句话）。\n\n"
            "标题: {title}\n摘要: {abstract}"
        ),
        "icon": "article",
        "sort_order": 0,
        "is_builtin": True,
    },
    {
        "name": "核心发现",
        "prompt_text": (
            "请提取并列出这篇论文的核心发现。"
            "重点关注最有影响力的结果及其启示。\n\n标题: {title}\n摘要: {abstract}"
        ),
        "icon": "lightbulb",
        "sort_order": 1,
        "is_builtin": True,
    },
    {
        "name": "方法论分析",
        "prompt_text": (
            "请分析这篇论文使用的方法论。"
            "描述研究方法、数据集、评估指标以及提到的局限性。\n\n"
            "标题: {title}\n摘要: {abstract}"
        ),
        "icon": "science",
        "sort_order": 2,
        "is_builtin": True,
    },
    {
        "name": "相关工作",
        "prompt_text": (
            "基于这篇论文的标题和摘要，识别其可能的相关工作和研究基础。"
            "哪些研究领域和关键参考文献是相关的？\n\n标题: {title}\n摘要: {abstract}"
        ),
        "icon": "link",
        "sort_order": 3,
        "is_builtin": True,
    },
    {
        "name": "快速评估",
        "prompt_text": (
            "请对这篇论文的新颖性、重要性和潜在影响进行快速评估。"
            "用 1-5 分评分并用 2-3 句话解释你的理由。\n\n"
            "标题: {title}\n摘要: {abstract}"
        ),
        "icon": "star",
        "sort_order": 4,
        "is_builtin": True,
    },
]


# LLM providers to auto-seed from environment variables.
# Deployment-specific IDs must come from env, never from hardcoded repository defaults.
_LLM_PROVIDER_SEEDS: list[dict] = [
    {
        "provider": "deepseek",
        "env_key": "DEEPSEEK_API_KEY",
        "env_base_url": "DEEPSEEK_API_BASE",
        "env_models": "DEEPSEEK_MODELS",
        "default_model": "deepseek-chat",
        "is_default": True,
    },
    {
        "provider": "volcengine_ark",
        "env_key": "ARK_API_KEY",
        "env_base_url": "ARK_API_BASE",
        "env_models": "ARK_MODEL_IDS",
        "env_model": "ARK_MODEL_ID",
        "requires_explicit_model": True,
    },
    {
        "provider": "dashscope",
        "env_key": "DASHSCOPE_API_KEY",
        "env_base_url": "DASHSCOPE_API_BASE",
        "env_models": "DASHSCOPE_MODELS",
        "default_model": "qwen-plus",
    },
    {
        "provider": "openai",
        "env_key": "OPENAI_API_KEY",
        "env_models": "OPENAI_MODELS",
        "default_model": "gpt-4o-mini",
    },
    {
        "provider": "claude",
        "env_key": "ANTHROPIC_API_KEY",
        "env_models": "ANTHROPIC_MODELS",
        "default_model": "claude-sonnet-4-20250514",
    },
    {
        "provider": "openrouter",
        "env_key": "OPENROUTER_API_KEY",
        "env_base_url": "OPENROUTER_API_BASE",
        "env_models": "OPENROUTER_MODELS",
        "default_model": "google/gemini-2.5-flash",
    },
    {
        "provider": "moonshot",
        "env_key": "MOONSHOT_API_KEY",
        "env_base_url": "MOONSHOT_API_BASE",
        "env_models": "MOONSHOT_MODELS",
        "default_model": "moonshot-v1-auto",
    },
    {
        "provider": "zhipu",
        "env_key": "ZHIPU_API_KEY",
        "env_base_url": "ZHIPU_API_BASE",
        "env_models": "ZHIPU_MODELS",
        "default_model": "glm-4-flash",
    },
    {
        "provider": "xai",
        "env_key": "XAI_API_KEY",
        "env_models": "XAI_MODELS",
        "default_model": "grok-3-mini-fast",
    },
    {
        "provider": "ollama",
        "env_key": "OLLAMA_API_KEY",
        "env_base_url": "OLLAMA_API_BASE",
        "env_models": "OLLAMA_MODELS",
        "env_model": "OLLAMA_MODEL",
        "default_model": "qwen3:8b",
    },
    {
        "provider": "vllm",
        "env_key": "VLLM_API_KEY",
        "env_base_url": "VLLM_API_BASE",
        "env_models": "VLLM_MODELS",
        "env_model": "VLLM_MODEL",
        "default_model": "Qwen/Qwen3-8B",
    },
    {
        "provider": "llamacpp",
        "env_key": "LLAMACPP_API_KEY",
        "env_base_url": "LLAMACPP_API_BASE",
        "env_models": "LLAMACPP_MODELS",
        "env_model": "LLAMACPP_MODEL",
        "default_model": "Qwen3-Coder-Next-Q4_K_M.gguf",
    },
]


_DEFAULT_SYSTEM_PROMPTS = {
    "paper": {
        "name": "论文分析助手",
        "prompt_text": (
            "你是一位学术论文研究助手，正在分析一篇特定的学术论文。\n\n"
            "分析要求：\n"
            "- 默认使用中文回复，除非用户要求使用其他语言\n"
            "- 回答要精准、学术化\n"
            "- 引用论文中的具体数据和方法\n"
            "- 对方法论、实验设计和结论进行批判性分析\n\n"
            "工具使用：\n"
            "- 使用 get_paper_detail 获取当前论文的完整信息（摘要、笔记等）\n"
            "- 使用 search_papers 搜索数据库中的相关论文\n"
            "- 使用 compare_papers 对比当前论文与其他论文\n"
            "当需要详细信息时，主动调用工具查询，不要凭记忆回答。\n\n"
            "引用格式：引用论文时使用 <paper-ref id=\"论文ID\">论文标题</paper-ref>，前端会渲染为可点击卡片。"
        ),
    },
    "global": {
        "name": "全局研究助手",
        "prompt_text": (
            "你是一位学术论文研究助手，可以通过工具访问用户的论文数据库。\n\n"
            "能力：\n"
            "- 搜索和浏览论文数据库\n"
            "- 比较不同论文的方法和结论\n"
            "- 查看研究统计和趋势\n"
            "- 识别研究趋势和知识空白\n\n"
            "回复规则：\n"
            "- 默认使用中文\n"
            "- 引用论文时标注 [ID:xxx]\n"
            "- 用结构化格式展示论文列表\n"
            "- 涉及论文数据时必须使用工具检索，不要凭记忆回答\n\n"
            "引用格式：引用论文时使用 <paper-ref id=\"论文ID\">论文标题</paper-ref>，前端会渲染为可点击卡片。"
        ),
    },
    "assistant": {
        "name": "Paper Tracker 助手",
        "prompt_text": (
            "你是论文研究助手。你的核心能力：\n\n"
            "1. **论文数据库访问**：搜索、筛选、分析用户论文数据库\n"
            "2. **深度分析**：摘要、方法论分析、关键发现提取、比较研究\n"
            "3. **研究统计**：论文库统计、趋势分析、分类分布\n\n"
            "回复规则：\n"
            "- 默认中文回复\n"
            "- 论文列表用结构化格式（标题、作者、年份、分类、相关度）\n"
            "- 引用论文标注 [ID:xxx]，方便用户定位\n"
            "- 涉及论文数据时优先从数据库检索而非凭记忆回答\n"
            "- 分析要精准学术化，避免泛泛而谈\n\n"
            "你可以使用工具来访问论文数据库、获取统计数据。"
            "当用户询问论文相关问题时，主动使用工具查询数据库获取准确信息。\n\n"
            "引用格式：引用论文时使用 <paper-ref id=\"论文ID\">论文标题</paper-ref>，前端会渲染为可点击卡片。"
        ),
    },
}


def seed_system_prompts(db: Session) -> None:
    """Create default system prompt configs if the table is empty."""
    existing_count = db.query(SystemPromptConfig).count()
    if existing_count > 0:
        logger.debug("System prompt configs already seeded (%d found).", existing_count)
        return

    for prompt_type, data in _DEFAULT_SYSTEM_PROMPTS.items():
        config = SystemPromptConfig(
            prompt_type=prompt_type,
            name=data["name"],
            prompt_text=data["prompt_text"],
            is_active=True,
        )
        db.add(config)

    db.commit()
    logger.info("Seeded %d default system prompt configs.", len(_DEFAULT_SYSTEM_PROMPTS))


def seed_system_prompt_by_type(db: Session, prompt_type: str) -> SystemPromptConfig | None:
    """Reset a single system prompt to its default. Returns the config or None if type is unknown."""
    default = _DEFAULT_SYSTEM_PROMPTS.get(prompt_type)
    if not default:
        return None

    config = db.query(SystemPromptConfig).filter(SystemPromptConfig.prompt_type == prompt_type).first()
    if config:
        config.name = default["name"]
        config.prompt_text = default["prompt_text"]
        config.is_active = True
    else:
        config = SystemPromptConfig(
            prompt_type=prompt_type,
            name=default["name"],
            prompt_text=default["prompt_text"],
            is_active=True,
        )
        db.add(config)

    db.commit()
    db.refresh(config)
    return config


_TEMPLATE_NAME_MIGRATION = {
    "Paper Summary": "论文摘要",
    "Key Findings": "核心发现",
    "Methodology Analysis": "方法论分析",
    "Related Work": "相关工作",
    "Quick Assessment": "快速评估",
}


def seed_prompt_templates(db: Session) -> None:
    """Create builtin prompt templates if none exist yet."""
    existing_count = db.query(PromptTemplate).filter(PromptTemplate.is_builtin.is_(True)).count()
    if existing_count > 0:
        # Migrate old English names to Chinese
        changed = False
        for old_name, new_name in _TEMPLATE_NAME_MIGRATION.items():
            tpl = db.query(PromptTemplate).filter(
                PromptTemplate.name == old_name, PromptTemplate.is_builtin.is_(True)
            ).first()
            if tpl:
                # Find the matching new template data
                new_data = next((t for t in _BUILTIN_TEMPLATES if t["name"] == new_name), None)
                if new_data:
                    tpl.name = new_data["name"]
                    tpl.prompt_text = new_data["prompt_text"]
                    changed = True
        if changed:
            db.commit()
            logger.info("Migrated builtin prompt template names to Chinese.")
        return

    for template_data in _BUILTIN_TEMPLATES:
        template = PromptTemplate(**template_data)
        db.add(template)

    db.commit()
    logger.info("Seeded %d builtin prompt templates.", len(_BUILTIN_TEMPLATES))


def _parse_seed_models(seed: dict) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    env_models = seed.get("env_models")
    raw_models = os.getenv(env_models, "").strip() if env_models else ""
    if raw_models:
        for part in raw_models.split(","):
            item = part.strip()
            if not item:
                continue
            label, sep, model = item.partition("=")
            if sep and model.strip():
                entries.append((label.strip() or model.strip(), model.strip()))
            else:
                entries.append((item, item))
        return entries

    env_model = seed.get("env_model")
    if env_model:
        item = os.getenv(env_model, "").strip()
        if item:
            entries.append((item, item))
            return entries

    default_model = seed.get("default_model")
    if default_model and not seed.get("requires_explicit_model"):
        entries.append((default_model, default_model))
    return entries


def migrate_llm_configs(db: Session) -> None:
    """Normalize legacy provider values and canonicalize base URLs."""
    configs = db.query(LLMConfig).all()
    changed = 0
    for config in configs:
        provider = infer_provider_key(
            config.provider,
            config.base_url,
            model_name=config.model_name,
            display_name=config.display_name,
        )
        profile = get_provider_profile(provider)
        base_url = normalize_base_url(provider, config.base_url)
        if config.provider != provider:
            config.provider = provider
            changed += 1
        if config.base_url != base_url:
            config.base_url = base_url
            changed += 1
        if getattr(config, "api_format", None) != profile.api_format:
            config.api_format = profile.api_format
            changed += 1
        if provider in {"ollama", "vllm", "lmstudio", "llamacpp"} and not getattr(config, "is_local", False):
            config.is_local = True
            changed += 1
        if provider != "openai_compatible" and getattr(config, "extra_headers", None):
            config.extra_headers = None
            changed += 1

    if changed:
        db.commit()
        logger.info("Migrated %d LLM config fields to provider registry format.", changed)


def seed_llm_configs(db: Session) -> None:
    """Optionally seed LLM configs from environment variables on startup.

    Disabled by default so startup never adds model configurations behind the
    user's back. Set ``AUTO_SEED_LLM_CONFIGS=true`` to opt in. When enabled,
    the operation remains idempotent and inserts only missing configurations.
    """
    auto_seed_enabled = os.getenv("AUTO_SEED_LLM_CONFIGS", "").strip().lower()
    if auto_seed_enabled not in {"1", "true", "yes", "on"}:
        logger.debug("Skipping LLM config auto-seeding; AUTO_SEED_LLM_CONFIGS is disabled.")
        return

    existing = {
        (infer_provider_key(c.provider, c.base_url, model_name=c.model_name, display_name=c.display_name), c.model_name): c
        for c in db.query(LLMConfig).all()
    }

    seeded = 0
    for seed in _LLM_PROVIDER_SEEDS:
        provider = infer_provider_key(seed["provider"], seed.get("base_url_value") or os.getenv(seed.get("env_base_url", ""), None))
        raw_api_key = get_secret_value(seed["env_key"], "") or ""

        try:
            api_key = resolve_api_key(provider, raw_api_key)
        except Exception as exc:
            logger.warning("Skipping seed for provider=%s: API key error: %s", provider, exc)
            continue

        base_url = None
        if seed.get("base_url_value"):
            base_url = seed["base_url_value"]
        elif seed.get("env_base_url"):
            base_url = os.getenv(seed["env_base_url"])
        try:
            base_url = validate_base_url(provider, base_url, is_local=provider in {"ollama", "vllm", "lmstudio", "llamacpp"})
        except Exception as exc:
            logger.warning("Skipping seed for provider=%s: base_url error: %s", provider, exc)
            continue

        profile = get_provider_profile(provider)
        for display_name, model_name in _parse_seed_models(seed):
            signature = (provider, model_name)

            if signature in existing:
                current = existing[signature]
                if current.display_name != display_name:
                    current.display_name = display_name
                if base_url and current.base_url != base_url:
                    current.base_url = base_url
                if getattr(current, "api_format", None) != profile.api_format:
                    current.api_format = profile.api_format
                if provider in {"ollama", "vllm", "lmstudio", "llamacpp"} and not getattr(current, "is_local", False):
                    current.is_local = True
                if provider != "openai_compatible" and getattr(current, "extra_headers", None):
                    current.extra_headers = None
                continue

            config = LLMConfig(
                provider=provider,
                display_name=display_name,
                api_key_encrypted=encrypt_value(api_key),
                key_version=current_key_version(),
                model_name=model_name,
                base_url=base_url,
                api_format=profile.api_format,
                extra_headers=None,
                extra_body=json_dumps_or_none({}),
                is_local=provider in {"ollama", "vllm", "lmstudio", "llamacpp"},
                is_enabled=True,
                health_status="unknown",
                is_default=seed.get("is_default", False) and not any(item.is_default for item in existing.values()),
            )
            db.add(config)
            existing[signature] = config
            seeded += 1
            logger.debug("Seeded LLM config: %s / %s", provider, display_name)

    if seeded or any(db.is_modified(item) for item in existing.values()):
        db.commit()
        logger.info("Seeded or refreshed %d LLM configs from environment variables.", seeded)


# ---------------------------------------------------------------------------
# Agent Skill Defaults
# ---------------------------------------------------------------------------

_DEFAULT_AGENT_SKILLS: dict[str, list[str]] = {
    "paper": [
        "search_papers",
        "get_paper_detail",
        "compare_papers",
        "get_paper_notes",
    ],
    "global": [
        "search_papers",
        "get_paper_detail",
        "get_latest_papers",
        "get_research_stats",
        "get_category_papers",
        "get_feed_status",
        "get_paper_timeline",
        "get_tag_analysis",
        "get_reading_progress",
        "get_recent_activity",
        "get_paper_notes",
        "find_duplicates",
        "get_favorites_overview",
        "analyze_paper_highlights",
        "get_research_trends",
    ],
    "assistant": [
        "search_papers",
        "get_paper_detail",
        "get_latest_papers",
        "get_research_stats",
        "compare_papers",
        "get_category_papers",
        "get_feed_status",
        "get_paper_timeline",
        "get_tag_analysis",
        "get_reading_progress",
        "get_recent_activity",
        "get_paper_notes",
        "find_duplicates",
        "get_favorites_overview",
        "analyze_paper_highlights",
        "get_research_trends",
    ],
}


def seed_agent_skills(db: Session) -> None:
    """Seed default agent skill assignments if the table is empty."""
    existing_count = db.query(AgentSkill).count()
    if existing_count > 0:
        logger.debug("Agent skills already seeded (%d found).", existing_count)
        return

    total = 0
    for agent_type, tools in _DEFAULT_AGENT_SKILLS.items():
        for tool_name in tools:
            db.add(AgentSkill(tool_name=tool_name, agent_type=agent_type, is_enabled=True))
            total += 1

    db.commit()
    logger.info("Seeded %d default agent skills.", total)


def ensure_new_skills(db: Session) -> None:
    """Add any missing skills from _DEFAULT_AGENT_SKILLS without resetting existing config.

    Idempotent: only inserts skills that don't yet exist in the DB.
    Called on every startup to handle new tools added in code updates.
    """
    existing = {
        (s.agent_type, s.tool_name)
        for s in db.query(AgentSkill.agent_type, AgentSkill.tool_name).all()
    }

    added = 0
    for agent_type, tools in _DEFAULT_AGENT_SKILLS.items():
        for tool_name in tools:
            if (agent_type, tool_name) not in existing:
                db.add(AgentSkill(tool_name=tool_name, agent_type=agent_type, is_enabled=True))
                added += 1

    if added:
        db.commit()
        logger.info("Added %d new agent skills to existing installation.", added)
