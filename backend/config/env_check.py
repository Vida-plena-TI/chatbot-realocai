"""Validation of the production environment, run before the settings are built.

Every problem is collected and reported at once, so a deploy with several missing or
invalid variables fails a single time with the full list. Messages only ever contain
variable NAMES and the reason: values (secrets included) are never printed.

Usage:
    python -m config.env_check   # exit status 1 and the list on stderr if invalid

`config.settings.prod` calls `check_production_env()` before importing `base`.
"""

import os
import re
import sys
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import urlsplit

import environ
from django.core.exceptions import ImproperlyConfigured

REPO_DIR = Path(__file__).resolve().parent.parent.parent

# Closed list: the container only ever runs the production settings.
PRODUCTION_SETTINGS_MODULE = "config.settings.prod"

REQUIRED = (
    "SECRET_KEY",
    "DATABASE_URL",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    "REALOCAI_BASE_URL",
    "REALOCAI_API_KEY",
    "NUM_PROXIES",
)

# django-environ treats any unknown text as False ("ture" would silently disable a
# flag), so booleans are checked against an explicit list.
BOOL_TRUE = {"true", "1", "yes", "on"}
BOOL_FALSE = {"false", "0", "no", "off"}
BOOLEANS = (
    "DEBUG",
    "REALOCAI_USE_FAKE",
    "REALOCAI_INJECT_MEMORIES",
    "ADMIN_SHOW_MESSAGE_CONTENT",
    "SECURE_SSL_REDIRECT",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "SECURE_HSTS_PRELOAD",
)
# Must be false (or unset) in production.
MUST_BE_FALSE = ("DEBUG", "REALOCAI_USE_FAKE")

# name -> minimum accepted value
INTEGERS = {
    "NUM_PROXIES": 0,
    "CONN_MAX_AGE": 0,
    "MESSAGE_MAX_LENGTH": 1,
    "REPORTS_EXPORT_MAX_BYTES": 1,
    "SECURE_HSTS_SECONDS": 0,
    "GUNICORN_WORKERS": 1,
    "GUNICORN_THREADS": 1,
    "GUNICORN_TIMEOUT": 1,
    "GUNICORN_GRACEFUL_TIMEOUT": 0,
    "GUNICORN_KEEPALIVE": 0,
    "PORT": 1,
}

CHOICES = {
    "LOG_LEVEL": {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"},
    "DB_SSLMODE": {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"},
}

SECRET_KEY_MIN_LENGTH = 50
# Placeholders used in .env.example, the docs and Django's startproject template.
EXAMPLE_MARKERS = ("change-me", "changeme", "your-project-ref", "<", "exemplo", "example")

# Same defaults as base.py / gunicorn.conf.py, used for the timeout cross-check.
DEFAULT_REALOCAI_TIMEOUT_SECONDS = 90.0
DEFAULT_GUNICORN_TIMEOUT = 240
# realocai_client.CONNECT_TIMEOUT_SECONDS (kept literal: importing the client would load
# Django models before the settings exist).
REALOCAI_CONNECT_TIMEOUT_SECONDS = 5

_LABEL = r"[a-z0-9]([a-z0-9-]*[a-z0-9])?"
HOST_RE = re.compile(rf"^(?=.{{1,253}}$){_LABEL}(\.{_LABEL})*$")
COOKIE_DOMAIN_RE = re.compile(rf"^\.?{_LABEL}(\.{_LABEL})+$")
ADMIN_URL_RE = re.compile(r"^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*/$")


def load_dotenv() -> None:
    """Read the optional `.env` at the repository root (never present in the image)."""
    path = REPO_DIR / ".env"
    if path.is_file():
        environ.Env.read_env(path)


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _looks_like_example(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in EXAMPLE_MARKERS)


def _https_origin_problem(origin: str) -> str | None:
    parts = urlsplit(origin)
    if parts.scheme != "https":
        return "must use https://"
    if not parts.hostname or not HOST_RE.match(parts.hostname):
        return "must be an origin like https://host"
    if parts.path not in ("", "/") or parts.query or parts.fragment or parts.username:
        return "must be an origin only (no path, query or credentials)"
    return None


def _origin_list_errors(name: str, raw: str) -> list[str]:
    errors = []
    for index, origin in enumerate(_split(raw), start=1):
        problem = _https_origin_problem(origin)
        if problem:
            errors.append(f"{name}: item {index} {problem}")
    return errors


def _parse_bool(raw: str) -> bool | None:
    value = raw.strip().lower()
    if value in BOOL_TRUE:
        return True
    if value in BOOL_FALSE:
        return False
    return None


def _parse_int(raw: str) -> int | None:
    try:
        return int(raw.strip())
    except ValueError:
        return None


def _parse_float(raw: str) -> float | None:
    try:
        return float(raw.strip())
    except ValueError:
        return None


def production_env_errors(env: Mapping[str, str]) -> list[str]:
    """Return every problem found in `env` (empty list = valid). Never includes values."""
    errors: list[str] = []

    def get(name: str) -> str:
        return env.get(name, "").strip()

    module = env.get("DJANGO_SETTINGS_MODULE", PRODUCTION_SETTINGS_MODULE)
    if module != PRODUCTION_SETTINGS_MODULE:
        errors.append(f"DJANGO_SETTINGS_MODULE: must be {PRODUCTION_SETTINGS_MODULE}")

    for name in REQUIRED:
        if not get(name):
            errors.append(f"{name}: required")

    for name in BOOLEANS:
        if get(name):
            parsed = _parse_bool(get(name))
            if parsed is None:
                errors.append(f"{name}: must be true or false")
            elif parsed and name in MUST_BE_FALSE:
                errors.append(f"{name}: must be false in production")

    for name, minimum in INTEGERS.items():
        if get(name):
            parsed = _parse_int(get(name))
            if parsed is None or parsed < minimum:
                errors.append(f"{name}: must be an integer >= {minimum}")

    for name, allowed in CHOICES.items():
        if get(name) and get(name) not in allowed:
            errors.append(f"{name}: must be one of {', '.join(sorted(allowed))}")

    secret_key = get("SECRET_KEY")
    if secret_key and (
        len(secret_key) < SECRET_KEY_MIN_LENGTH
        or len(set(secret_key)) < 5
        or secret_key.startswith("django-insecure")
        or _looks_like_example(secret_key)
    ):
        errors.append(
            f"SECRET_KEY: must be a random value with at least {SECRET_KEY_MIN_LENGTH} "
            "characters, not an example"
        )

    database_url = get("DATABASE_URL")
    if database_url:
        parts = urlsplit(database_url)
        if parts.scheme not in ("postgres", "postgresql"):
            errors.append("DATABASE_URL: must be a postgres:// URL")
        elif not parts.hostname:
            errors.append("DATABASE_URL: missing host")
        elif _looks_like_example(database_url):
            errors.append("DATABASE_URL: still has example placeholders")

    allowed_hosts = _split(get("ALLOWED_HOSTS"))
    for index, host in enumerate(allowed_hosts, start=1):
        if host == "*" or not HOST_RE.match(host.lstrip(".")):
            errors.append(f"ALLOWED_HOSTS: item {index} must be a hostname (no '*', no scheme)")

    errors += _origin_list_errors("CSRF_TRUSTED_ORIGINS", get("CSRF_TRUSTED_ORIGINS"))
    cors_origins = _split(get("CORS_ALLOWED_ORIGINS"))
    errors += _origin_list_errors("CORS_ALLOWED_ORIGINS", get("CORS_ALLOWED_ORIGINS"))

    for name in ("CSRF_COOKIE_DOMAIN", "SESSION_COOKIE_DOMAIN"):
        if get(name) and not COOKIE_DOMAIN_RE.match(get(name)):
            errors.append(f"{name}: must be a domain like .example.com (no scheme or port)")

    # A frontend on another host reads csrftoken from document.cookie: the cookie must be
    # scoped to a parent domain shared by the frontend.
    csrf_cookie_domain = get("CSRF_COOKIE_DOMAIN")
    if cors_origins and not csrf_cookie_domain:
        errors.append(
            "CSRF_COOKIE_DOMAIN: required when CORS_ALLOWED_ORIGINS is set "
            "(the frontend must read the csrftoken cookie)"
        )
    elif cors_origins and COOKIE_DOMAIN_RE.match(csrf_cookie_domain):
        parent = csrf_cookie_domain.lstrip(".")
        for index, origin in enumerate(cors_origins, start=1):
            host = urlsplit(origin).hostname or ""
            if host != parent and not host.endswith("." + parent):
                errors.append(f"CORS_ALLOWED_ORIGINS: item {index} is not under CSRF_COOKIE_DOMAIN")

    realocai_url = get("REALOCAI_BASE_URL")
    if realocai_url:
        parts = urlsplit(realocai_url)
        if parts.scheme != "https" or not parts.hostname:
            errors.append("REALOCAI_BASE_URL: must be an https:// URL")
    if get("REALOCAI_API_KEY") and _looks_like_example(get("REALOCAI_API_KEY")):
        errors.append("REALOCAI_API_KEY: still has an example value")
    if get("OPENAI_API_KEY") and _looks_like_example(get("OPENAI_API_KEY")):
        errors.append("OPENAI_API_KEY: still has an example value (leave empty to disable)")

    admin_url = get("ADMIN_URL")
    if admin_url and (not ADMIN_URL_RE.match(admin_url) or admin_url.startswith("api/")):
        errors.append("ADMIN_URL: must look like 'admin/' (no leading slash, not under api/)")

    realocai_timeout = DEFAULT_REALOCAI_TIMEOUT_SECONDS
    if get("REALOCAI_TIMEOUT_SECONDS"):
        parsed_timeout = _parse_float(get("REALOCAI_TIMEOUT_SECONDS"))
        if parsed_timeout is None or parsed_timeout <= 0:
            errors.append("REALOCAI_TIMEOUT_SECONDS: must be a number > 0")
        else:
            realocai_timeout = parsed_timeout
    gunicorn_timeout = _parse_int(get("GUNICORN_TIMEOUT") or str(DEFAULT_GUNICORN_TIMEOUT))
    # One turn may call RealocAI twice (restart after 404): the worker must outlive both.
    worst_turn = 2 * (REALOCAI_CONNECT_TIMEOUT_SECONDS + realocai_timeout)
    if gunicorn_timeout is not None and gunicorn_timeout <= worst_turn:
        errors.append(
            "GUNICORN_TIMEOUT: must be greater than 2 x (REALOCAI_TIMEOUT_SECONDS + "
            f"{REALOCAI_CONNECT_TIMEOUT_SECONDS})"
        )

    return errors


def check_production_env(env: Mapping[str, str] | None = None) -> None:
    """Raise ImproperlyConfigured listing every problem (names only) if `env` is invalid."""
    errors = production_env_errors(os.environ if env is None else env)
    if errors:
        lines = "\n".join(f"  - {error}" for error in errors)
        raise ImproperlyConfigured(
            f"Invalid production environment ({len(errors)} problem(s)):\n{lines}"
        )


def main() -> int:
    load_dotenv()
    errors = production_env_errors(os.environ)
    if errors:
        print(f"Invalid production environment ({len(errors)} problem(s)):", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print("Production environment OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
