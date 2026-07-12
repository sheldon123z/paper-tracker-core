import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LLMConfig
from ..schemas import (
    LLMConfigBatchAction,
    LLMConfigBrief,
    LLMConfigCreate,
    LLMConfigOut,
    LLMConfigUpdate,
    LLMProviderOption,
    LLMTestResult,
)
from ..security import require_llm_config_access
from ..services.encryption import current_key_version, decrypt_value, encrypt_value
from ..services.llm_registry import get_provider_profile, infer_provider_key, parse_json_mapping, resolve_api_key
from ..services.llm_service import (
    enrich_llm_config,
    list_provider_options,
    normalize_config_payload,
    resolve_llm_config,
    test_llm_connection,
)

logger = logging.getLogger("paper-tracker.llm_config")

router = APIRouter(
    prefix="/api/llm-configs",
    tags=["llm-configs"],
    dependencies=[Depends(require_llm_config_access)],
)


@router.get("", response_model=list[LLMConfigOut])
def list_llm_configs(db: Session = Depends(get_db)):
    configs = db.query(LLMConfig).order_by(LLMConfig.is_pinned.desc(), LLMConfig.id.desc()).all()
    return [enrich_llm_config(config) for config in configs]


@router.get("/providers", response_model=list[LLMProviderOption])
def list_llm_providers():
    return list_provider_options()


@router.post("", response_model=LLMConfigOut)
def create_llm_config(payload: LLMConfigCreate, db: Session = Depends(get_db)):
    if payload.is_default:
        db.query(LLMConfig).filter(LLMConfig.is_default.is_(True)).update({"is_default": False})

    try:
        normalized = normalize_config_payload(
            payload.provider,
            payload.base_url,
            payload.api_key,
            model_name=payload.model_name,
            display_name=payload.display_name,
            extra_headers=payload.extra_headers,
            extra_body=payload.extra_body,
            is_local=payload.is_local,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if get_provider_profile(normalized["provider"]).requires_api_key and not normalized["api_key"]:
        raise HTTPException(status_code=400, detail="该 Provider 需要 API Key。")
    config = LLMConfig(
        provider=normalized["provider"],
        display_name=payload.display_name,
        api_key_encrypted=encrypt_value(normalized["api_key"] or ""),
        key_version=current_key_version(),
        model_name=payload.model_name,
        base_url=normalized["base_url"],
        api_format=normalized["api_format"],
        extra_headers=json.dumps(normalized["extra_headers"], ensure_ascii=False) if normalized["extra_headers"] else None,
        extra_body=json.dumps(normalized["extra_body"], ensure_ascii=False) if normalized["extra_body"] else None,
        is_local=normalized["is_local"],
        is_enabled=payload.is_enabled,
        health_status="unknown",
        is_default=payload.is_default,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    logger.info("LLM config created: provider=%s model=%s", config.provider, config.model_name)
    return enrich_llm_config(config)


@router.get("/status")
def llm_config_status(db: Session = Depends(get_db)):
    configs = db.query(LLMConfig).all()
    default_config = next((c for c in configs if c.is_default), None)
    enabled_count = len([c for c in configs if getattr(c, "is_enabled", True)])
    return {
        "configured": len(configs) > 0,
        "has_default": default_config is not None,
        "config_count": len(configs),
        "enabled_count": enabled_count,
        "default_model": (default_config.display_name or default_config.model_name) if default_config else None,
    }


@router.get("/brief", response_model=list[LLMConfigBrief])
def llm_config_brief(db: Session = Depends(get_db)):
    configs = db.query(LLMConfig).filter(LLMConfig.is_enabled.is_(True)).order_by(LLMConfig.is_pinned.desc(), LLMConfig.id.desc()).all()
    enriched = [enrich_llm_config(config) for config in configs]
    return [
        LLMConfigBrief(
            id=item["id"],
            label=item["display_name"] or item["model_name"] or item["provider"],
            provider=item["provider"],
            provider_label=item["provider_label"],
            is_default=item["is_default"],
            health_status=item["health_status"],
            is_local=item["is_local"],
            is_pinned=item.get("is_pinned", False),
            supports_streaming=item["capabilities"]["supports_streaming"],
            supports_tool_calling=item["capabilities"]["supports_tool_calling"],
            supports_reasoning=item["capabilities"]["supports_reasoning"],
        )
        for item in enriched
    ]


@router.patch("/{config_id}", response_model=LLMConfigOut)
def update_llm_config(config_id: int, payload: LLMConfigUpdate, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")

    updates = payload.model_dump(exclude_none=True)
    if updates.get("is_default"):
        db.query(LLMConfig).filter(LLMConfig.id != config_id, LLMConfig.is_default.is_(True)).update(
            {"is_default": False}
        )

    try:
        current_headers = parse_json_mapping(config.extra_headers, field_name="extra_headers")
    except ValueError:
        current_headers = {}
    try:
        current_body = parse_json_mapping(config.extra_body, field_name="extra_body")
    except ValueError:
        current_body = {}
    provided_api_key = False

    if "api_key" in updates:
        raw_api_key = updates.pop("api_key")
        if raw_api_key and raw_api_key.strip():
            provided_api_key = True
            # Validate and encrypt the API key using provider inference
            try:
                provider_key = infer_provider_key(
                    updates.get("provider", config.provider),
                    updates.get("base_url", config.base_url),
                    model_name=updates.get("model_name", config.model_name),
                    display_name=updates.get("display_name", config.display_name),
                )
                validated_key = resolve_api_key(provider_key, raw_api_key)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            config.api_key_encrypted = encrypt_value(validated_key or "")
            config.key_version = current_key_version()

    # Single normalization call for all other fields
    try:
        normalized = normalize_config_payload(
            updates.get("provider", config.provider),
            updates.get("base_url", config.base_url),
            None,
            model_name=updates.get("model_name", config.model_name),
            display_name=updates.get("display_name", config.display_name),
            extra_headers=updates.get("extra_headers", current_headers),
            extra_body=updates.get("extra_body", current_body),
            is_local=updates.get("is_local", bool(getattr(config, "is_local", False))),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    updates["provider"] = normalized["provider"]
    updates["base_url"] = normalized["base_url"]
    updates["api_format"] = normalized["api_format"]
    updates["extra_headers"] = json.dumps(normalized["extra_headers"], ensure_ascii=False) if normalized["extra_headers"] else None
    updates["extra_body"] = json.dumps(normalized["extra_body"], ensure_ascii=False) if normalized["extra_body"] else None
    updates["is_local"] = normalized["is_local"]

    target_profile = get_provider_profile(normalized["provider"])
    current_provider_key = infer_provider_key(
        config.provider,
        config.base_url,
        model_name=config.model_name,
        display_name=config.display_name,
    )
    existing_api_key = decrypt_value(config.api_key_encrypted) if config.api_key_encrypted else ""
    has_real_existing_key = bool(existing_api_key and existing_api_key not in {"ollama", "vllm", "lmstudio", "local"})
    if target_profile.requires_api_key and not provided_api_key and (current_provider_key in {"ollama", "vllm", "lmstudio"} or not has_real_existing_key):
        raise HTTPException(status_code=400, detail="切换到需要 API Key 的 Provider 时必须提供新的 API Key。")

    # Serialize user_tags list to JSON string for DB storage
    if "user_tags" in updates:
        tags_value = updates.pop("user_tags")
        config.user_tags = json.dumps(tags_value, ensure_ascii=False) if tags_value else None

    for field, value in updates.items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    return enrich_llm_config(config)


@router.delete("/{config_id}")
def delete_llm_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")

    db.delete(config)
    db.commit()
    return {"message": "LLM config deleted", "config_id": config_id}


@router.post("/{config_id}/test", response_model=LLMTestResult)
async def test_llm_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")

    try:
        resolved = resolve_llm_config(db, config_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = await test_llm_connection(resolved)
    config.health_status = "ok" if result["success"] else (result.get("error_code") or "error").lower()
    config.last_error = None if result["success"] else result.get("message")
    config.last_tested_at = datetime.now(UTC)
    if result.get("ttft_ms") is not None:
        config.last_ttft_ms = result["ttft_ms"]
    if result.get("tokens_per_second") is not None:
        config.last_tokens_per_second = result["tokens_per_second"]
    db.commit()

    if result["success"]:
        return result
    return JSONResponse(status_code=400, content=result)


@router.post("/batch-test")
async def batch_test_llm_configs(db: Session = Depends(get_db)):
    """Test all enabled LLM configs concurrently."""
    configs = db.query(LLMConfig).filter(LLMConfig.is_enabled.is_(True)).all()
    if not configs:
        return {"total": 0, "success": 0, "failed": 0, "results": []}

    config_ids = [c.id for c in configs]
    sem = asyncio.Semaphore(5)

    # Create session factory bound to engine, not current connection
    # db.get_bind() could return Connection (connection-scoped), which causes concurrency issues
    from sqlalchemy.orm import sessionmaker
    bind = db.get_bind()
    # If bind is a Connection, extract its underlying Engine
    if hasattr(bind, 'engine'):
        bind = bind.engine
    TestSessionLocal = sessionmaker(bind=bind, autocommit=False, autoflush=False)

    async def _test_one(config_id: int):
        """Test a single LLM config in its own independent DB session."""
        async with sem:
            local_db = TestSessionLocal()
            try:
                cfg = local_db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
                if not cfg:
                    return {"id": config_id, "status": "not_found", "message": "Config not found"}

                resolved = resolve_llm_config(local_db, cfg.id)
                result = await test_llm_connection(resolved)
                cfg.health_status = "ok" if result["success"] else (result.get("error_code") or "error").lower()
                cfg.last_error = None if result["success"] else result.get("message")
                cfg.last_tested_at = datetime.now(UTC)
                if result.get("ttft_ms") is not None:
                    cfg.last_ttft_ms = result["ttft_ms"]
                if result.get("tokens_per_second") is not None:
                    cfg.last_tokens_per_second = result["tokens_per_second"]
                local_db.commit()
                return {"id": config_id, "status": "ok" if result["success"] else "error", "message": result.get("message", "")}
            except Exception as exc:
                local_db.rollback()
                # Update error status in a clean state after rollback
                try:
                    cfg_to_update = local_db.query(LLMConfig).filter(LLMConfig.id == config_id).first()
                    if cfg_to_update:
                        cfg_to_update.health_status = "error"
                        cfg_to_update.last_error = str(exc)[:200]
                        cfg_to_update.last_tested_at = datetime.now(UTC)
                        local_db.commit()
                except Exception:
                    pass
                return {"id": config_id, "status": "error", "message": str(exc)[:200]}
            finally:
                local_db.close()

    results = await asyncio.gather(*[_test_one(cid) for cid in config_ids], return_exceptions=False)
    success_count = sum(1 for r in results if r["status"] == "ok")
    return {"total": len(results), "success": success_count, "failed": len(results) - success_count, "results": results}


@router.post("/batch-action")
def batch_action_llm_configs(payload: LLMConfigBatchAction, db: Session = Depends(get_db)):
    """Batch enable/disable/delete/pin/unpin configs."""
    if not payload.config_ids:
        raise HTTPException(status_code=400, detail="config_ids 不能为空")
    configs = db.query(LLMConfig).filter(LLMConfig.id.in_(payload.config_ids)).all()
    if not configs:
        raise HTTPException(status_code=404, detail="未找到匹配的配置")

    action = payload.action
    if action == "enable":
        for c in configs:
            c.is_enabled = True
    elif action == "disable":
        for c in configs:
            c.is_enabled = False
    elif action == "pin":
        for c in configs:
            c.is_pinned = True
    elif action == "unpin":
        for c in configs:
            c.is_pinned = False
    elif action == "delete":
        for c in configs:
            db.delete(c)
    else:
        raise HTTPException(status_code=400, detail=f"不支持的操作: {action}")

    db.commit()
    return {"affected": len(configs), "action": action}


@router.get("/tags")
def list_llm_tags(db: Session = Depends(get_db)):
    """Return all unique user tags across configs."""
    configs = db.query(LLMConfig.user_tags).filter(LLMConfig.user_tags.isnot(None)).all()
    tags = set()
    for (raw,) in configs:
        try:
            for t in json.loads(raw):
                if t:
                    tags.add(t)
        except (json.JSONDecodeError, TypeError):
            pass
    return sorted(tags)


@router.get("/export")
def export_llm_configs(db: Session = Depends(get_db)):
    """Export all configs as JSON (without API keys)."""
    configs = db.query(LLMConfig).order_by(LLMConfig.id).all()
    items = []
    for c in configs:
        items.append({
            "provider": c.provider,
            "display_name": c.display_name,
            "model_name": c.model_name,
            "base_url": c.base_url,
            "api_format": getattr(c, "api_format", None),
            "extra_headers": json.loads(c.extra_headers) if c.extra_headers else {},
            "extra_body": json.loads(c.extra_body) if c.extra_body else {},
            "is_local": bool(getattr(c, "is_local", False)),
            "is_enabled": bool(getattr(c, "is_enabled", True)),
            "is_default": bool(c.is_default),
            "is_pinned": bool(getattr(c, "is_pinned", False)),
            "user_tags": json.loads(c.user_tags) if getattr(c, "user_tags", None) else [],
        })
    return {"version": 1, "configs": items}


@router.post("/import")
def import_llm_configs(payload: dict, db: Session = Depends(get_db)):
    """Import configs from JSON. mode=merge skips existing, mode=replace clears all first."""
    mode = payload.get("mode", "merge")
    items = payload.get("configs", [])
    if not items:
        raise HTTPException(status_code=400, detail="No configs to import")

    if mode == "replace":
        db.query(LLMConfig).delete()

    imported = 0
    for item in items:
        if mode == "merge":
            exists = db.query(LLMConfig).filter(
                LLMConfig.provider == item.get("provider", ""),
                LLMConfig.model_name == item.get("model_name", ""),
            ).first()
            if exists:
                continue
        from ..services.encryption import current_key_version, encrypt_value
        config = LLMConfig(
            provider=item.get("provider", "openai"),
            display_name=item.get("display_name"),
            api_key_encrypted=encrypt_value(""),  # User must set key manually
            key_version=current_key_version(),
            model_name=item.get("model_name", ""),
            base_url=item.get("base_url"),
            api_format=item.get("api_format"),
            extra_headers=json.dumps(item.get("extra_headers", {}), ensure_ascii=False) if item.get("extra_headers") else None,
            extra_body=json.dumps(item.get("extra_body", {}), ensure_ascii=False) if item.get("extra_body") else None,
            is_local=item.get("is_local", False),
            is_enabled=item.get("is_enabled", True),
            is_default=False,  # Don't import default status
            is_pinned=item.get("is_pinned", False),
            user_tags=json.dumps(item.get("user_tags", []), ensure_ascii=False) if item.get("user_tags") else None,
            health_status="unknown",
        )
        db.add(config)
        imported += 1

    db.commit()
    return {"imported": imported, "mode": mode}
