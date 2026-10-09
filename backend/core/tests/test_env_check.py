"""Production environment validation (config.env_check) and settings built from env."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from config.env_check import check_production_env, production_env_errors

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Fake values only. The secret key is long and random-looking but not a real one.
SECRET = "test-only-" + "q8Zr2vW5nL1xK7pT3mB9cY4hJ6dF0sG" * 2


def valid_env(**overrides):
    env = {
        "DJANGO_SETTINGS_MODULE": "config.settings.prod",
        "SECRET_KEY": SECRET,
        "DEBUG": "false",
        "DATABASE_URL": "postgres://app:fake-password@db.internal:5432/app",
        "ALLOWED_HOSTS": "api-chat.vidaplenamulti.com.br",
        "CSRF_TRUSTED_ORIGINS": "https://chat.vidaplenamulti.com.br",
        "CORS_ALLOWED_ORIGINS": "https://chat.vidaplenamulti.com.br",
        "CSRF_COOKIE_DOMAIN": ".vidaplenamulti.com.br",
        "SESSION_COOKIE_DOMAIN": "",
        "NUM_PROXIES": "1",
        "REALOCAI_BASE_URL": "https://realocai.vidaplenamulti.com.br",
        "REALOCAI_API_KEY": "fake-realocai-key-for-tests",
        "REALOCAI_USE_FAKE": "false",
        "REALOCAI_TIMEOUT_SECONDS": "90",
        "GUNICORN_TIMEOUT": "240",
    }
    env.update(overrides)
    return {key: value for key, value in env.items() if value is not None}


def test_valid_environment_has_no_errors():
    assert production_env_errors(valid_env()) == []
    check_production_env(valid_env())  # does not raise


def test_lists_every_missing_variable_at_once():
    env = valid_env(SECRET_KEY=None, DATABASE_URL=None, ALLOWED_HOSTS="", REALOCAI_API_KEY=None)

    errors = production_env_errors(env)

    assert "SECRET_KEY: required" in errors
    assert "DATABASE_URL: required" in errors
    assert "ALLOWED_HOSTS: required" in errors
    assert "REALOCAI_API_KEY: required" in errors


def test_errors_never_include_values():
    env = valid_env(
        SECRET_KEY="short-secret-value",
        DATABASE_URL="mysql://user:sup3r-s3cret@host/db",
        CSRF_TRUSTED_ORIGINS="http://plain.example.org",
        DEBUG="ture",
    )

    message = "\n".join(production_env_errors(env))

    for value in ("short-secret-value", "sup3r-s3cret", "plain.example.org", "ture"):
        assert value not in message


@pytest.mark.parametrize("value", ["true", "True", "1", "yes"])
def test_rejects_fake_realocai(value):
    assert "REALOCAI_USE_FAKE: must be false in production" in production_env_errors(
        valid_env(REALOCAI_USE_FAKE=value)
    )


@pytest.mark.parametrize("value", ["true", "on"])
def test_rejects_debug(value):
    assert "DEBUG: must be false in production" in production_env_errors(valid_env(DEBUG=value))


@pytest.mark.parametrize(
    ("name", "value", "expected"),
    [
        ("DEBUG", "flase", "DEBUG: must be true or false"),
        ("ADMIN_SHOW_MESSAGE_CONTENT", "ture", "ADMIN_SHOW_MESSAGE_CONTENT: must be true or false"),
        ("DJANGO_SETTINGS_MODULE", "config.settings.prodution", "DJANGO_SETTINGS_MODULE"),
        ("DJANGO_SETTINGS_MODULE", "config.settings.dev", "DJANGO_SETTINGS_MODULE"),
        ("LOG_LEVEL", "VERBOSE", "LOG_LEVEL: must be one of"),
        ("DB_SSLMODE", "required", "DB_SSLMODE: must be one of"),
        ("NUM_PROXIES", "one", "NUM_PROXIES: must be an integer"),
        ("SECRET_KEY", "change-me", "SECRET_KEY: must be a random value"),
        ("SECRET_KEY", "django-insecure-" + "x1y2z3" * 10, "SECRET_KEY: must be a random value"),
        ("SECRET_KEY", "a" * 60, "SECRET_KEY: must be a random value"),
        ("DATABASE_URL", "sqlite:///db.sqlite3", "DATABASE_URL: must be a postgres:// URL"),
        (
            "DATABASE_URL",
            "postgres://postgres.your-project-ref:change-me@host:5432/postgres",
            "DATABASE_URL: still has example placeholders",
        ),
        ("ALLOWED_HOSTS", "*", "ALLOWED_HOSTS: item 1 must be a hostname"),
        ("ALLOWED_HOSTS", "https://api.example.org", "ALLOWED_HOSTS: item 1 must be a hostname"),
        ("CSRF_TRUSTED_ORIGINS", "chat.vidaplenamulti.com.br", "CSRF_TRUSTED_ORIGINS: item 1"),
        ("CSRF_TRUSTED_ORIGINS", "http://chat.vidaplenamulti.com.br", "must use https://"),
        ("CORS_ALLOWED_ORIGINS", "https://chat.vidaplenamulti.com.br/app", "origin only"),
        ("CSRF_COOKIE_DOMAIN", "https://vidaplenamulti.com.br", "CSRF_COOKIE_DOMAIN: must be"),
        ("REALOCAI_BASE_URL", "http://realocai.vidaplenamulti.com.br", "REALOCAI_BASE_URL"),
        ("REALOCAI_API_KEY", "change-me", "REALOCAI_API_KEY: still has an example value"),
        ("ADMIN_URL", "/admin/", "ADMIN_URL"),
        ("ADMIN_URL", "api/admin/", "ADMIN_URL"),
        ("GUNICORN_TIMEOUT", "120", "GUNICORN_TIMEOUT: must be greater than"),
    ],
)
def test_rejects_invalid_value(name, value, expected):
    errors = production_env_errors(valid_env(**{name: value}))
    assert any(expected in error for error in errors), errors


def test_gunicorn_timeout_follows_realocai_timeout():
    # 2 x (60 + 5) = 130
    assert production_env_errors(valid_env(REALOCAI_TIMEOUT_SECONDS="60", GUNICORN_TIMEOUT="130"))
    assert not production_env_errors(
        valid_env(REALOCAI_TIMEOUT_SECONDS="60", GUNICORN_TIMEOUT="131")
    )


def test_cross_subdomain_frontend_needs_csrf_cookie_domain():
    errors = production_env_errors(valid_env(CSRF_COOKIE_DOMAIN=""))
    assert any(error.startswith("CSRF_COOKIE_DOMAIN: required") for error in errors)


def test_frontend_origin_must_be_under_csrf_cookie_domain():
    errors = production_env_errors(valid_env(CSRF_COOKIE_DOMAIN=".outro-dominio.com.br"))
    assert "CORS_ALLOWED_ORIGINS: item 1 is not under CSRF_COOKIE_DOMAIN" in errors


def test_same_origin_deploy_needs_no_cors_nor_cookie_domain():
    assert not production_env_errors(valid_env(CORS_ALLOWED_ORIGINS="", CSRF_COOKIE_DOMAIN=""))


# --- settings built by config.settings.prod in a fresh interpreter --------------------

# The developer's .env must not leak into these subprocesses: loading it is disabled.
NO_DOTENV = "import config.env_check as env_check\nenv_check.load_dotenv = lambda: None\n"

PRINT_SETTINGS = """
import json
from django.conf import settings
print(json.dumps({name: getattr(settings, name) for name in [
    "DEBUG", "ALLOWED_HOSTS", "CSRF_TRUSTED_ORIGINS", "CORS_ALLOWED_ORIGINS",
    "CORS_ALLOW_CREDENTIALS", "CSRF_COOKIE_DOMAIN", "SESSION_COOKIE_DOMAIN",
    "CSRF_COOKIE_HTTPONLY", "SESSION_COOKIE_HTTPONLY", "CSRF_COOKIE_SECURE",
    "SESSION_COOKIE_SECURE", "CSRF_COOKIE_SAMESITE", "SESSION_COOKIE_SAMESITE",
    "SECURE_PROXY_SSL_HEADER", "SECURE_HSTS_SECONDS", "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "DATA_UPLOAD_MAX_MEMORY_SIZE", "REPORTS_EXPORT_MAX_BYTES", "ADMIN_URL",
]} | {"CACHE_BACKEND": settings.CACHES["default"]["BACKEND"],
      "WHITENOISE": "whitenoise.middleware.WhiteNoiseMiddleware" in settings.MIDDLEWARE,
      "NUM_PROXIES": settings.REST_FRAMEWORK["NUM_PROXIES"]}))
"""


def run_prod_settings(env):
    return subprocess.run(  # noqa: S603 - fixed interpreter and code, test-only env
        [sys.executable, "-c", NO_DOTENV + "import django\ndjango.setup()\n" + PRINT_SETTINGS],
        cwd=BACKEND_DIR,
        env={"PATH": os.environ.get("PATH", "")} | env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_prod_settings_from_env():
    result = run_prod_settings(valid_env())

    assert result.returncode == 0, result.stderr
    settings = json.loads(result.stdout)
    assert settings["DEBUG"] is False
    assert settings["ALLOWED_HOSTS"] == ["api-chat.vidaplenamulti.com.br"]
    assert settings["CSRF_TRUSTED_ORIGINS"] == ["https://chat.vidaplenamulti.com.br"]
    assert settings["CORS_ALLOWED_ORIGINS"] == ["https://chat.vidaplenamulti.com.br"]
    assert settings["CORS_ALLOW_CREDENTIALS"] is True
    # csrftoken readable by the SPA on the sibling subdomain; sessionid host-only.
    assert settings["CSRF_COOKIE_DOMAIN"] == ".vidaplenamulti.com.br"
    assert settings["SESSION_COOKIE_DOMAIN"] is None
    assert settings["CSRF_COOKIE_HTTPONLY"] is False
    assert settings["SESSION_COOKIE_HTTPONLY"] is True
    assert settings["CSRF_COOKIE_SECURE"] is True
    assert settings["SESSION_COOKIE_SECURE"] is True
    assert settings["CSRF_COOKIE_SAMESITE"] == settings["SESSION_COOKIE_SAMESITE"] == "Lax"
    assert settings["SECURE_PROXY_SSL_HEADER"] == ["HTTP_X_FORWARDED_PROTO", "https"]
    assert settings["SECURE_HSTS_SECONDS"] == 3600
    assert settings["SECURE_HSTS_INCLUDE_SUBDOMAINS"] is False
    assert settings["DATA_UPLOAD_MAX_MEMORY_SIZE"] > settings["REPORTS_EXPORT_MAX_BYTES"]
    assert settings["ADMIN_URL"] == "admin/"
    assert settings["CACHE_BACKEND"] == "django.core.cache.backends.db.DatabaseCache"
    assert settings["WHITENOISE"] is True
    assert settings["NUM_PROXIES"] == 1


def test_prod_settings_admin_url_from_env():
    result = run_prod_settings(valid_env(ADMIN_URL="gestao-interna/"))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["ADMIN_URL"] == "gestao-interna/"


def test_prod_settings_abort_listing_all_problems_without_values():
    env = valid_env(SECRET_KEY=None, DATABASE_URL=None, REALOCAI_USE_FAKE="true", DEBUG="true")
    env["REALOCAI_API_KEY"] = "fake-realocai-key-for-tests"

    result = run_prod_settings(env)

    assert result.returncode != 0
    assert "Invalid production environment (4 problem(s))" in result.stderr
    for expected in (
        "SECRET_KEY: required",
        "DATABASE_URL: required",
        "REALOCAI_USE_FAKE: must be false in production",
        "DEBUG: must be false in production",
    ):
        assert expected in result.stderr
    assert "fake-realocai-key-for-tests" not in result.stderr


def test_env_check_command_exit_status():
    command = [sys.executable, "-c", NO_DOTENV + "raise SystemExit(env_check.main())"]
    kwargs = {"cwd": BACKEND_DIR, "capture_output": True, "text": True, "timeout": 60}

    ok = subprocess.run(command, env=valid_env(), **kwargs)  # noqa: S603
    bad = subprocess.run(command, env=valid_env(NUM_PROXIES=None), **kwargs)  # noqa: S603

    assert ok.returncode == 0, ok.stderr
    assert bad.returncode == 1
    assert "NUM_PROXIES: required" in bad.stderr
