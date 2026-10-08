import io
import logging

from core.log_filters import RedactExceptionMessages

# Fictitious data. Kept out of the raise statements: tracebacks show source lines.
NAME = "Fulano de Tal"
EMAIL = "fulano@example.com"


def _log_exception(exc_factory):
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.addFilter(RedactExceptionMessages())
    logger = logging.getLogger("test.redaction")
    logger.addHandler(handler)
    logger.propagate = False
    try:
        try:
            exc_factory()
        except Exception:
            logger.exception("Internal Server Error: %s", "/api/conversations/")
    finally:
        logger.removeHandler(handler)
    return stream.getvalue()


def test_traceback_keeps_frames_and_type_but_not_the_message():
    def fail():
        raise ValueError(f"Paciente {NAME}")

    output = _log_exception(fail)

    assert "Internal Server Error: /api/conversations/" in output
    assert "Traceback (most recent call last)" in output
    assert "builtins.ValueError: <message omitted>" in output
    assert NAME not in output


def test_chained_exceptions_are_redacted_too():
    def fail():
        try:
            raise KeyError(f"Key (email)=({EMAIL}) already exists")
        except KeyError as exc:
            raise RuntimeError(f"wrapper with {EMAIL}") from exc

    output = _log_exception(fail)

    assert "builtins.KeyError: <message omitted>" in output
    assert "builtins.RuntimeError: <message omitted>" in output
    assert EMAIL not in output


def test_logging_config_uses_stdout_and_the_filter(settings):
    console = settings.LOGGING["handlers"]["console"]
    assert console["stream"] == "ext://sys.stdout"
    assert console["filters"] == ["redact_exceptions"]
