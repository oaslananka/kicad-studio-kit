"""Structured logging setup using structlog."""

from __future__ import annotations

import logging
import re
import sys
from typing import Any, Literal, cast

import structlog

_SENSITIVE_KEY_PATTERN = re.compile(r"(token|secret|key|pass|cred)", re.IGNORECASE)


def redact_sensitive_keys(
    _logger: structlog.typing.WrappedLogger,
    _method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    """Redact values of sensitive log fields before rendering."""
    redacted: dict[str, Any] = {}
    for key, value in event_dict.items():
        if _SENSITIVE_KEY_PATTERN.search(key):
            redacted[key] = "***REDACTED***"
        else:
            redacted[key] = value
    return redacted


def setup_logging(
    level: str = "INFO",
    format: Literal["json", "console"] = "console",
) -> None:
    """Configure structured logging for the MCP server."""
    processors: list[object] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        redact_sensitive_keys,
        structlog.processors.StackInfoRenderer(),
    ]

    if format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty()))

    structlog.configure(
        processors=cast(Any, processors),
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        stream=sys.stderr,
        format="%(message)s",
    )
