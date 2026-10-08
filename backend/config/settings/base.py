"""Settings shared by every environment.

All sensitive values are read from environment variables (or from the `.env`
file at the repository root). Never hardcode secrets here.
"""

from pathlib import Path

import environ

from config.env_check import load_dotenv

# backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
# repository root (monorepo)
REPO_DIR = BASE_DIR.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
)

# The .env file is optional: in production variables come from the environment.
load_dotenv()

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# Application definition
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "accounts",
    "core",
    "chat",
    "reports",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# Path of the Django admin (with trailing slash, without leading slash).
ADMIN_URL = env("ADMIN_URL", default="admin/")

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database (Supabase Postgres). Use the *session* pooler URL: it is IPv4-compatible and,
# unlike the transaction pooler (port 6543), supports persistent connections and
# server-side cursors, which Django relies on.
DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
# Health data travels over the network: TLS is required unless explicitly overridden.
DATABASES["default"].setdefault("OPTIONS", {}).setdefault(
    "sslmode", env("DB_SSLMODE", default="require")
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Authentication
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Sessions and CSRF. The SPA authenticates with the session cookie and must send the
# csrftoken cookie value back in the X-CSRFToken header on unsafe requests.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# JavaScript has to read the token, so the CSRF cookie cannot be HttpOnly.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
# Parent domain for csrftoken when the SPA runs on a sibling subdomain of the API (it must
# read the cookie from document.cookie). Empty = host-only cookie (same origin, dev).
CSRF_COOKIE_DOMAIN = env("CSRF_COOKIE_DOMAIN", default="") or None
# Keep empty: the session cookie stays host-only, sent to the API host alone.
SESSION_COOKIE_DOMAIN = env("SESSION_COOKIE_DOMAIN", default="") or None
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")
# JSON {"detail"} instead of the HTML page, for views protected by Django itself (login).
CSRF_FAILURE_VIEW = "core.exceptions.csrf_failure"

# CORS (only needed when the frontend is served from another origin, e.g. Vite in dev)
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.authentication.SessionAuthentication"],
    # Secure by default: every endpoint requires authentication unless it opts out.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Every error becomes {"detail": "<first message, in Portuguese>"}.
    "EXCEPTION_HANDLER": "core.exceptions.exception_handler",
    # Rates only apply to views that opt in with `throttle_scope`.
    # login: 5 attempts per minute per client IP, to slow down password guessing.
    # chat_messages: sending a chat message, per user. Each message triggers two paid
    # AI calls (RealocAI and memory extraction), so this caps the cost per account.
    "DEFAULT_THROTTLE_RATES": {"login": "5/min", "chat_messages": "30/min"},
    # Number of trusted reverse proxies in front of the app. Throttling keys on the
    # client IP; behind a proxy, set this so it is taken from X-Forwarded-For instead
    # of REMOTE_ADDR (otherwise every client shares the proxy's IP).
    "NUM_PROXIES": env.int("NUM_PROXIES", default=None),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "RealocAI API",
    "DESCRIPTION": "API do chatbot da clínica multidisciplinar Vida Plena.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # /api/schema/ and /api/docs/ are public only with DEBUG=True; otherwise staff only.
    "SERVE_PERMISSIONS": ["core.permissions.IsStaffOrDebug"],
}

# RealocAI: external AI agent service (FastAPI), called server-to-server only.
# The API key must never reach the browser nor be logged.
REALOCAI_BASE_URL = env("REALOCAI_BASE_URL", default="")
REALOCAI_API_KEY = env("REALOCAI_API_KEY", default="")
# Read timeout (s): the agent makes several model calls per message, so allow a generous
# one. Connecting has its own short timeout (realocai_client.CONNECT_TIMEOUT_SECONDS).
REALOCAI_TIMEOUT_SECONDS = env.float("REALOCAI_TIMEOUT_SECONDS", default=90)
# Local development/demos only: answer with canned replies and sample report blocks
# instead of calling RealocAI (chat.services.realocai_fake).
REALOCAI_USE_FAKE = env.bool("REALOCAI_USE_FAKE", default=False)
# EXPERIMENTAL: prefix the first message of a new RealocAI conversation with the
# conversation summary and the user's top memories. Keep False until validated manually.
REALOCAI_INJECT_MEMORIES = env.bool("REALOCAI_INJECT_MEMORIES", default=False)

# Upper bound (characters) for a single user message sent to the agent.
MESSAGE_MAX_LENGTH = env.int("MESSAGE_MAX_LENGTH", default=2000)

# Largest request body (bytes) accepted by POST /api/reports/export/.
REPORTS_EXPORT_MAX_BYTES = env.int("REPORTS_EXPORT_MAX_BYTES", default=2 * 1024 * 1024)
# Django's own body cap stays above the export limit, so the view answers 413 first.
DATA_UPLOAD_MAX_MEMORY_SIZE = REPORTS_EXPORT_MAX_BYTES + 512 * 1024

# Message contents are health data: the admin shows only metadata (seq, role, date,
# size) unless this is explicitly enabled.
ADMIN_SHOW_MESSAGE_CONTENT = env.bool("ADMIN_SHOW_MESSAGE_CONTENT", default=False)

# OpenAI: called directly only to extract long-term memories after each chat turn
# (the chat itself goes through RealocAI). Empty key = extraction disabled.
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
OPENAI_EXTRACTION_MODEL = env("OPENAI_EXTRACTION_MODEL", default="gpt-4o-mini")

# Logging: stdout only; never log request bodies (they may contain patient data). The
# filter drops exception messages from tracebacks (a database error can echo row values).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"redact_exceptions": {"()": "core.log_filters.RedactExceptionMessages"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "filters": ["redact_exceptions"],
        }
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        # Keep HTTP client internals (URLs, connection details) out of the logs.
        "httpx": {"level": "WARNING"},
        "httpcore": {"level": "WARNING"},
    },
}
