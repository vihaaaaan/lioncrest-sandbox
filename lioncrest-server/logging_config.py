# logging_config.py
from __future__ import annotations

import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Any, Dict

# -------------------------
# Formats
# -------------------------
_TEXT_FMT = "%(asctime)s %(levelname)-8s %(name)s %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"

# -------------------------
# Optional color
# -------------------------
try:
    import colorlog  # type: ignore
except Exception:
    colorlog = None

def _isatty(stream) -> bool:
    try:
        return hasattr(stream, "isatty") and stream.isatty()
    except Exception:
        return False

# -------------------------
# Custom DATA level
# -------------------------
DATA_LEVEL = 25
logging.addLevelName(DATA_LEVEL, "DATA")

def _logger_data(self, msg, *args, **kwargs):
    if self.isEnabledFor(DATA_LEVEL):
        self._log(DATA_LEVEL, msg, args, **kwargs)

logging.Logger.data = _logger_data  # usage: logger.data("payload %s", obj)

# -------------------------
# Request context filter (safe defaults)
# -------------------------
class _RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        if not hasattr(record, "method"):
            record.method = "-"
        if not hasattr(record, "path"):
            record.path = "-"
        # If you want the request context visible in text logs, append it to message:
        if getattr(record, "method", "-") != "-" or getattr(record, "path", "-") != "-" or getattr(record, "request_id", "-") != "-":
            record.msg = f"[{record.method} {record.path} id={record.request_id}] {record.getMessage()}"
        return True

# -------------------------
# JSON formatter
# -------------------------
class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data: Dict[str, Any] = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "method": getattr(record, "method", "-"),
            "path": getattr(record, "path", "-"),
        }
        if record.exc_info:
            data["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)

# -------------------------
# Plain / Color formatters
# -------------------------
def _make_text_formatter(use_color: bool) -> logging.Formatter:
    if use_color and colorlog is not None:
        return colorlog.ColoredFormatter(
            fmt="%(log_color)s%(asctime)s%(reset)s %(levelname)-8s %(name)s %(message)s",
            datefmt=_DATE_FMT,
            log_colors={
                "DEBUG":    "thin_blue",
                "DATA":     "bold_cyan",
                "INFO":     "green",
                "WARNING":  "yellow",
                "ERROR":    "red",
                "CRITICAL": "bold_red",
            },
            style="%",
        )
    return logging.Formatter(_TEXT_FMT, datefmt=_DATE_FMT)

# -------------------------
# Public API
# -------------------------
def configure_logging() -> None:
    """
    Environment variables (with sensible defaults):
      LOG_FORMAT=TEXT|JSON           (default: TEXT)
      LOG_COLOR=true|false           (default: true)
      LOG_LEVEL=DEBUG|INFO|...       (root, default: DEBUG)     <-- see everything by default
      APP_LOG_LEVEL=...              (your app package, default: LOG_LEVEL)
      LIB_LOG_LEVEL=...              (third-party libs, default: LOG_LEVEL)

      LOG_TO_FILE=true|false         (default: false)
      LOG_FILE=server.log            (default)
      LOG_MAX_BYTES=10485760         (10MB)
      LOG_BACKUPS=5
      APP_LOGGER_NAME=lioncrest      (top-level package to treat as "your app")
    """
    fmt_name  = os.getenv("LOG_FORMAT", "TEXT").upper()
    want_color = os.getenv("LOG_COLOR", "true").lower() == "true"

    # Defaults to DEBUG so you see everything right now
    root_level_name = os.getenv("LOG_LEVEL", "DEBUG").upper()
    app_level_name  = os.getenv("APP_LOG_LEVEL", root_level_name).upper()
    lib_level_name  = os.getenv("LIB_LOG_LEVEL", root_level_name).upper()

    root_level = getattr(logging, root_level_name, logging.DEBUG)
    app_level  = getattr(logging, app_level_name, logging.DEBUG)
    lib_level  = getattr(logging, lib_level_name, logging.DEBUG)

    # File logging options
    to_file   = os.getenv("LOG_TO_FILE", "false").lower() == "true"
    log_file  = os.getenv("LOG_FILE", "server.log")
    max_bytes = int(os.getenv("LOG_MAX_BYTES", "10485760"))
    backups   = int(os.getenv("LOG_BACKUPS", "5"))

    app_logger_name = os.getenv("APP_LOGGER_NAME", "lioncrest")

    # Choose formatter for console
    if fmt_name == "JSON":
        console_formatter: logging.Formatter = _JsonFormatter(datefmt=_DATE_FMT)
    else:
        # If you want LOG_COLOR=true to force color (even without TTY), use:
        # use_color = want_color or _isatty(sys.stdout)
        use_color = want_color and _isatty(sys.stdout)
        console_formatter = _make_text_formatter(use_color=use_color)

    # Build handlers
    handlers: list[logging.Handler] = []

    stream = logging.StreamHandler()
    stream.setFormatter(console_formatter)
    stream.addFilter(_RequestContextFilter())
    handlers.append(stream)

    if to_file:
        file_formatter = _JsonFormatter(datefmt=_DATE_FMT) if fmt_name == "JSON" \
                        else logging.Formatter(_TEXT_FMT, datefmt=_DATE_FMT)
        fileh = RotatingFileHandler(log_file, maxBytes=max_bytes, backupCount=backups)
        fileh.setFormatter(file_formatter)
        fileh.addFilter(_RequestContextFilter())
        handlers.append(fileh)

    # Configure root
    logging.basicConfig(level=root_level, handlers=handlers, force=True)

    # App logger (your code)
    logging.getLogger(app_logger_name).setLevel(app_level)

    # Third-party libs (uvicorn, asyncio, etc.)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "asyncio"):
        logging.getLogger(name).setLevel(lib_level)
        # ensure they propagate to root (so our handlers/formatters apply)
        logging.getLogger(name).propagate = True
        # remove any pre-attached handlers that may double-print
        for h in list(logging.getLogger(name).handlers):
            logging.getLogger(name).removeHandler(h)

def get_logger(name: str | None = None) -> logging.Logger:
    return logging.getLogger("" if name is None else name)

def with_request_context(*, request_id: str | None = None, method: str | None = None, path: str | None = None) -> dict:
    return {
        "request_id": request_id or "-",
        "method": method or "-",
        "path": path or "-",
    }
