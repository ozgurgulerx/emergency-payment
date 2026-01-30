"""
Structured logging configuration for the Emergency Payment Runbook.
Provides JSON-formatted logs with trace context and PII redaction.
"""

import json
import logging
import re
import sys
from datetime import datetime, timezone
from typing import Any, Optional
from functools import lru_cache

from .config import get_settings


# =============================================================================
# PII Redaction Patterns
# =============================================================================

PII_PATTERNS = [
    # Email addresses
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '[EMAIL_REDACTED]'),
    # Phone numbers (various formats)
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), '[PHONE_REDACTED]'),
    # Social Security Numbers
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '[SSN_REDACTED]'),
    # Credit card numbers (basic pattern)
    (re.compile(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'), '[CARD_REDACTED]'),
    # IBAN
    (re.compile(r'\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b'), '[IBAN_REDACTED]'),
]

# Sensitive field names to redact values for
SENSITIVE_FIELDS = {
    'password', 'secret', 'token', 'api_key', 'apikey', 'authorization',
    'auth', 'credential', 'private_key', 'access_token', 'refresh_token',
}


def redact_pii(text: str) -> str:
    """Redact PII patterns from text."""
    if not get_settings().redact_pii:
        return text

    for pattern, replacement in PII_PATTERNS:
        text = pattern.sub(replacement, text)

    return text


def redact_sensitive_dict(data: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    """Recursively redact sensitive fields from a dictionary."""
    if depth > 10:  # Prevent infinite recursion
        return data

    result = {}
    for key, value in data.items():
        key_lower = key.lower()

        # Check if key is sensitive
        if any(sensitive in key_lower for sensitive in SENSITIVE_FIELDS):
            result[key] = '[REDACTED]'
        elif isinstance(value, dict):
            result[key] = redact_sensitive_dict(value, depth + 1)
        elif isinstance(value, list):
            result[key] = [
                redact_sensitive_dict(item, depth + 1) if isinstance(item, dict)
                else redact_pii(str(item)) if isinstance(item, str) else item
                for item in value
            ]
        elif isinstance(value, str):
            result[key] = redact_pii(value)
        else:
            result[key] = value

    return result


# =============================================================================
# Custom JSON Formatter
# =============================================================================

class StructuredJSONFormatter(logging.Formatter):
    """JSON formatter with structured fields for observability."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON with trace context."""
        # Base log structure
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_pii(record.getMessage()),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add trace context if available
        if hasattr(record, 'run_id'):
            log_data['run_id'] = record.run_id
        if hasattr(record, 'step'):
            log_data['step'] = record.step
        if hasattr(record, 'agent'):
            log_data['agent'] = record.agent
        if hasattr(record, 'elapsed_ms'):
            log_data['elapsed_ms'] = record.elapsed_ms

        # Add extra fields (redacted)
        if hasattr(record, 'extra_data') and record.extra_data:
            log_data['data'] = redact_sensitive_dict(record.extra_data)

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)


class ColoredTextFormatter(logging.Formatter):
    """Colored text formatter for development."""

    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors."""
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now(timezone.utc).strftime('%H:%M:%S.%f')[:-3]

        # Build prefix
        prefix_parts = [f"{color}{record.levelname:8}{self.RESET}"]
        if hasattr(record, 'run_id'):
            prefix_parts.append(f"[{record.run_id[:8]}]")
        if hasattr(record, 'step'):
            prefix_parts.append(f"[{record.step}]")
        if hasattr(record, 'agent'):
            prefix_parts.append(f"[{record.agent}]")

        prefix = " ".join(prefix_parts)
        message = redact_pii(record.getMessage())

        # Add elapsed time if available
        suffix = ""
        if hasattr(record, 'elapsed_ms'):
            suffix = f" ({record.elapsed_ms}ms)"

        return f"{timestamp} {prefix} {message}{suffix}"


# =============================================================================
# Logger Configuration
# =============================================================================

@lru_cache()
def setup_logging() -> None:
    """Configure application logging based on settings."""
    settings = get_settings()

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper()))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, settings.log_level.upper()))

    # Set formatter based on settings
    if settings.log_format == "json":
        handler.setFormatter(StructuredJSONFormatter())
    else:
        handler.setFormatter(ColoredTextFormatter())

    root_logger.addHandler(handler)

    # Reduce noise from other libraries
    logging.getLogger("azure").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the specified name."""
    setup_logging()
    return logging.getLogger(name)


class RunbookLogger:
    """Context-aware logger for runbook operations."""

    def __init__(self, run_id: str, base_logger: Optional[logging.Logger] = None):
        self.run_id = run_id
        self.logger = base_logger or get_logger("runbook")
        self._step: Optional[str] = None
        self._agent: Optional[str] = None
        self._start_time: Optional[datetime] = None

    def set_context(
        self,
        step: Optional[str] = None,
        agent: Optional[str] = None,
    ) -> None:
        """Set logging context for subsequent messages."""
        if step is not None:
            self._step = step
        if agent is not None:
            self._agent = agent

    def start_timer(self) -> None:
        """Start elapsed time tracking."""
        self._start_time = datetime.now(timezone.utc)

    def _get_elapsed_ms(self) -> int:
        """Get elapsed time in milliseconds."""
        if self._start_time is None:
            return 0
        delta = datetime.now(timezone.utc) - self._start_time
        return int(delta.total_seconds() * 1000)

    def _log(
        self,
        level: int,
        message: str,
        extra_data: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Internal logging method with context."""
        extra = {
            'run_id': self.run_id,
            'step': self._step,
            'agent': self._agent,
            'elapsed_ms': self._get_elapsed_ms(),
            'extra_data': extra_data,
        }
        self.logger.log(level, message, extra=extra, **kwargs)

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message."""
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message."""
        self._log(logging.INFO, message, **kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message."""
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, **kwargs: Any) -> None:
        """Log error message."""
        self._log(logging.ERROR, message, **kwargs)

    def step_started(self, step: str, agent: Optional[str] = None) -> None:
        """Log step started event."""
        self.set_context(step=step, agent=agent)
        self.start_timer()
        self.info(f"Step started: {step}" + (f" (agent: {agent})" if agent else ""))

    def step_completed(self, step: str, result_summary: Optional[str] = None) -> None:
        """Log step completed event."""
        msg = f"Step completed: {step}"
        if result_summary:
            msg += f" - {result_summary}"
        self.info(msg)

    def tool_called(self, tool_name: str, input_summary: Optional[str] = None) -> None:
        """Log tool invocation."""
        msg = f"Tool called: {tool_name}"
        if input_summary:
            msg += f" ({input_summary})"
        self.debug(msg)

    def kb_queried(self, query: str, results_count: int) -> None:
        """Log knowledge base query."""
        self.debug(f"KB queried: '{query[:50]}...' -> {results_count} results")

    def branch_taken(self, condition: str, target: str) -> None:
        """Log workflow branch decision."""
        self.info(f"Branch: {condition} -> {target}")
