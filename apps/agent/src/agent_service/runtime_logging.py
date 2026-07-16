"""Production log boundary for dynamic Agno provider failures."""

import logging
from typing import Final


_AGNO_LOGGER_NAMES: Final = ("agno", "agno-team", "agno-workflow")
_FILTER_MARKER: Final = "agent_service_agno_redaction"
_SAFE_WARNING: Final = "agno_runtime_warning"
_SAFE_ERROR: Final = "agno_runtime_error"


class _AgnoRedactionFilter(logging.Filter):
    agent_service_agno_redaction = True

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno < logging.WARNING:
            return True

        record.msg = _SAFE_ERROR if record.levelno >= logging.ERROR else _SAFE_WARNING
        record.args = ()
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


def install_agno_log_redaction() -> None:
    """Idempotently redact every current production Agno log handler."""
    for logger_name in _AGNO_LOGGER_NAMES:
        logger = logging.getLogger(logger_name)
        for handler in logger.handlers:
            if any(
                getattr(log_filter, _FILTER_MARKER, False)
                for log_filter in handler.filters
            ):
                continue
            handler.addFilter(_AgnoRedactionFilter())
