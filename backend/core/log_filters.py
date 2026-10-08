"""Logging filters that keep health data out of the logs."""

import logging
import traceback


class RedactExceptionMessages(logging.Filter):
    """Keep tracebacks but drop the exception messages.

    An exception message can echo data (e.g. a database error quoting row values, or an
    HTTP client error quoting a response), so only the frames and the exception TYPES are
    logged, including chained exceptions. The log message itself is left untouched: the
    application only logs ids, error kinds, status codes and durations.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info and record.exc_info[1] is not None:
            record.exc_text = _redacted_traceback(record.exc_info[1])
            # exc_text wins over exc_info in Formatter.format; drop the original so no
            # other formatter renders the full message.
            record.exc_info = None
        return True


def _redacted_traceback(exc: BaseException) -> str:
    chain = []
    seen = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        chain.append(current)
        current = current.__cause__ or (
            None if current.__suppress_context__ else current.__context__
        )

    parts = []
    for position, item in enumerate(reversed(chain)):
        if position:
            parts.append("\nThe above exception led to the following one:\n\n")
        parts.append("Traceback (most recent call last):\n")
        parts.extend(traceback.format_tb(item.__traceback__))
        parts.append(f"{type(item).__module__}.{type(item).__qualname__}: <message omitted>\n")
    return "".join(parts).rstrip("\n")
