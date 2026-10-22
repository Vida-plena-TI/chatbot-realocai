"""Helpers for tests asserting that health data never reaches the logs."""

import contextlib
import logging

# Loggers raised to WARNING in settings.LOGGING (or quiet by default) are lowered too,
# so the assertions see every record any of them could emit.
NOISY_LOGGERS = ("httpx", "httpcore", "openai", "django", "django.request", "django.server")


@contextlib.contextmanager
def capture_all_logs(caplog):
    """Capture records of every level from every logger."""
    with contextlib.ExitStack() as stack:
        stack.enter_context(caplog.at_level(logging.DEBUG))
        for name in NOISY_LOGGERS:
            stack.enter_context(caplog.at_level(logging.DEBUG, logger=name))
        yield


def all_log_text(caplog):
    """Formatted output plus every attribute of every record (message, args, extras)."""
    return "\n".join([caplog.text, *(repr(vars(record)) for record in caplog.records)])


def strings_in(value):
    """Every string inside a JSON-like value (keys excluded)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)
