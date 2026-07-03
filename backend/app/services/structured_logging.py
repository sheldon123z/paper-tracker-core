"""Structured logging with JSON format for observability.

Provides unified logging with consistent fields:
- timestamp, level, service, message, context, duration_ms, user_id, etc.

Usage:
    from .structured_logging import get_logger, log_llm_call, log_request

    logger = get_logger("agui")
    logger.info("request_start", extra={"endpoint": "/api/agui/paper", "user_id": 1})

    # Or use convenience helpers
    log_llm_call(logger, provider="openai", model="gpt-4", input_tokens=100,
                 output_tokens=200, duration_ms=1500, cost_usd=0.01)

    log_request(logger, method="POST", path="/api/agui/paper",
                status_code=200, duration_ms=250)
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import UTC, datetime
from typing import Any


class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging.

    Output format:
    {
        "timestamp": "2026-04-01T12:00:00.000Z",
        "level": "INFO",
        "service": "paper-tracker",
        "message": "llm_call",
        "provider": "openai",
        "model": "gpt-4",
        "input_tokens": 100,
        "output_tokens": 200,
        "duration_ms": 1500,
        "cost_usd": 0.01
    }
    """

    def format(self, record: logging.LogRecord) -> str:
        # Build base fields
        log_data: dict[str, Any] = {
            "timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level": record.levelname,
            "service": getattr(record, "service", "paper-tracker"),
            "message": record.getMessage(),
        }

        # Add any extra fields from extra={} dict
        extra_fields = getattr(record, "context", None)
        if extra_fields:
            if isinstance(extra_fields, dict):
                log_data.update(extra_fields)
            else:
                log_data["context"] = str(extra_fields)

        # Add duration_ms if present
        duration_ms = getattr(record, "duration_ms", None)
        if duration_ms is not None:
            log_data["duration_ms"] = duration_ms

        # Add user_id if present
        user_id = getattr(record, "user_id", None)
        if user_id is not None:
            log_data["user_id"] = user_id

        # Add error info if this is an exception record
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, ensure_ascii=False)


def _get_log_level() -> int:
    """Get log level from environment, default INFO."""
    level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    return getattr(logging, level_str, logging.INFO)


def get_logger(name: str, level: int | None = None) -> logging.Logger:
    """Get or create a structured logger.

    Args:
        name: Logger name (e.g., "agui", "llm", "workflow")
        level: Log level, defaults to LOG_LEVEL env var or INFO

    Returns:
        Configured logger with JSON formatter
    """
    logger_name = f"paper-tracker.{name}"
    logger = logging.getLogger(logger_name)

    if not logger.handlers:
        # Add console handler with JSON formatter
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

        # Set level
        log_level = level if level is not None else _get_log_level()
        logger.setLevel(log_level)

    return logger


# ---------------------------------------------------------------------------
# Convenience helpers for common logging patterns
# ---------------------------------------------------------------------------

def log_llm_call(
    logger: logging.Logger,
    *,
    provider: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    duration_ms: int | None = None,
    cost_usd: float | None = None,
    ttft_ms: int | None = None,
    tokens_per_second: float | None = None,
    status: str = "success",
    error_code: str | None = None,
    user_id: int | None = None,
    session_id: str | None = None,
    agent_type: str | None = None,
    config_id: int | None = None,
) -> None:
    """Log an LLM call with structured metrics.

    Args:
        logger: The logger instance
        provider: LLM provider (e.g., "openai", "anthropic")
        model: Model name (e.g., "gpt-4", "claude-3-opus")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        duration_ms: Total call duration in milliseconds
        cost_usd: Estimated cost in USD
        ttft_ms: Time to first token in milliseconds
        tokens_per_second: Output token generation speed
        status: Call status ("success" or "error")
        error_code: Error code if status is "error"
        user_id: User ID making the call
        session_id: Session ID for the conversation
        agent_type: Agent type (e.g., "paper", "global", "assistant")
        config_id: LLM config ID used
    """
    extra = {
        "type": "llm_call",
        "provider": provider,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }

    if duration_ms is not None:
        extra["duration_ms"] = duration_ms
    if cost_usd is not None:
        extra["cost_usd"] = round(cost_usd, 6)
    if ttft_ms is not None:
        extra["ttft_ms"] = ttft_ms
    if tokens_per_second is not None:
        extra["tokens_per_second"] = round(tokens_per_second, 2)
    if status:
        extra["status"] = status
    if error_code:
        extra["error_code"] = error_code
    if session_id:
        extra["session_id"] = session_id
    if agent_type:
        extra["agent_type"] = agent_type
    if config_id is not None:
        extra["config_id"] = config_id

    # Use user_id as LogRecord attribute for JSONFormatter
    log_level = logging.ERROR if status == "error" else logging.INFO
    # Create a new LogRecord with extra fields
    logger.log(
        log_level,
        f"llm_call:{status}",
        extra={"context": extra, "user_id": user_id},
    )


def log_request(
    logger: logging.Logger,
    *,
    method: str,
    path: str,
    status_code: int | None = None,
    duration_ms: int | None = None,
    user_id: int | None = None,
    session_id: str | None = None,
    endpoint: str | None = None,
    error: str | None = None,
) -> None:
    """Log an HTTP request with structured data.

    Args:
        logger: The logger instance
        method: HTTP method (GET, POST, etc.)
        path: Request path
        status_code: HTTP response status code
        duration_ms: Request processing duration in milliseconds
        user_id: User ID making the request
        session_id: Session ID
        endpoint: Specific endpoint name (e.g., "/api/agui/paper")
        error: Error message if request failed
    """
    extra = {
        "type": "request",
        "method": method,
        "path": path,
    }

    if status_code is not None:
        extra["status_code"] = status_code
    if duration_ms is not None:
        extra["duration_ms"] = duration_ms
    if session_id:
        extra["session_id"] = session_id
    if endpoint:
        extra["endpoint"] = endpoint
    if error:
        extra["error"] = error

    # Determine log level based on status
    if status_code and status_code >= 500:
        log_level = logging.ERROR
    elif status_code and status_code >= 400:
        log_level = logging.WARNING
    elif error:
        log_level = logging.ERROR
    else:
        log_level = logging.INFO

    logger.log(
        log_level,
        f"request:{status_code or 'pending'}",
        extra={"context": extra, "user_id": user_id},
    )


class RequestTimer:
    """Context manager for timing requests.

    Usage:
        with RequestTimer(logger, method="POST", path="/api/agui/paper") as timer:
            # do work
            timer.status_code = 200
        # Automatically logs when exiting
    """

    def __init__(
        self,
        logger: logging.Logger,
        *,
        method: str,
        path: str,
        user_id: int | None = None,
        session_id: str | None = None,
        endpoint: str | None = None,
    ):
        self.logger = logger
        self.method = method
        self.path = path
        self.user_id = user_id
        self.session_id = session_id
        self.endpoint = endpoint
        self.status_code: int | None = None
        self.error: str | None = None
        self._start_time = time.time()

    def __enter__(self) -> RequestTimer:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        duration_ms = int((time.time() - self._start_time) * 1000)
        if exc_val:
            self.error = str(exc_val)
            self.status_code = 500

        log_request(
            self.logger,
            method=self.method,
            path=self.path,
            status_code=self.status_code,
            duration_ms=duration_ms,
            user_id=self.user_id,
            session_id=self.session_id,
            endpoint=self.endpoint,
            error=self.error,
        )


class LLMTimer:
    """Context manager for timing LLM calls with structured logging.

    Usage:
        with LLMTimer(logger, provider="openai", model="gpt-4") as timer:
            # do LLM call
            timer.input_tokens = 100
            timer.output_tokens = 200
            timer.cost_usd = 0.01
        # Automatically logs when exiting
    """

    def __init__(
        self,
        logger: logging.Logger,
        *,
        provider: str,
        model: str,
        user_id: int | None = None,
        session_id: str | None = None,
        agent_type: str | None = None,
        config_id: int | None = None,
    ):
        self.logger = logger
        self.provider = provider
        self.model = model
        self.user_id = user_id
        self.session_id = session_id
        self.agent_type = agent_type
        self.config_id = config_id
        # Metrics that can be set during the call
        self.input_tokens: int = 0
        self.output_tokens: int = 0
        self.cost_usd: float | None = None
        self.ttft_ms: int | None = None
        self.tokens_per_second: float | None = None
        self.status: str = "success"
        self.error_code: str | None = None
        self._start_time = time.time()

    def __enter__(self) -> LLMTimer:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        duration_ms = int((time.time() - self._start_time) * 1000)

        if exc_val:
            self.status = "error"
            self.error_code = "RUNTIME_ERROR"

        log_llm_call(
            self.logger,
            provider=self.provider,
            model=self.model,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            duration_ms=duration_ms,
            cost_usd=self.cost_usd,
            ttft_ms=self.ttft_ms,
            tokens_per_second=self.tokens_per_second,
            status=self.status,
            error_code=self.error_code,
            user_id=self.user_id,
            session_id=self.session_id,
            agent_type=self.agent_type,
            config_id=self.config_id,
        )
