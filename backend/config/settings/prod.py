"""Production settings. DEBUG is always off and transport security is enforced.

The environment is validated first (config.env_check): a deploy with missing or invalid
variables fails at startup listing every problem at once, never their values.
"""

from config.env_check import check_production_env, load_dotenv

load_dotenv()
check_production_env()

from .base import *  # noqa: E402, F403
from .base import MIDDLEWARE, env  # noqa: E402

DEBUG = False

# Static files (admin, API docs) served by the app itself, with hashed names.
MIDDLEWARE = [
    MIDDLEWARE[0],  # SecurityMiddleware
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],
]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Shared by every gunicorn worker, so throttle limits (login, chat) are not multiplied by
# the number of processes. Table created by `manage.py createcachetable` (entrypoint).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# HTTPS. The proxy (Traefik) terminates TLS and already redirects HTTP -> HTTPS; the
# container healthcheck sends X-Forwarded-Proto so it is not redirected.
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# HSTS: start low and raise it once HTTPS is confirmed stable (see docs/deploy-easypanel.md).
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=3600)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)

# Cookies (HttpOnly/SameSite flags and domains live in base.py)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Headers
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
