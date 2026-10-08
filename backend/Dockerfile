# Backend (Django + gunicorn). Build context: backend/
#
# Base image pinned to an exact Python patch release and Debian release (trixie, the
# current Debian stable): rebuilds are reproducible, and upgrades are a deliberate,
# reviewed change of this line. "slim" keeps the image small; psycopg[binary] ships its
# own libpq, so no compiler or system packages are needed.
ARG PYTHON_IMAGE=python:3.13.13-slim-trixie
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.23

FROM ${UV_IMAGE} AS uv

# --- build: install the locked dependencies and collect static files ---------------
FROM ${PYTHON_IMAGE} AS build

COPY --from=uv /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Dependencies first, so code changes reuse this layer. --frozen: fail if uv.lock is out
# of date; --no-dev: no pytest/ruff in the image.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

# collectstatic runs at build time: the files are the same for every container, and the
# boot stays fast. The production settings validate the environment, so placeholder
# values are given to this single command only (nothing connects to them and they are
# not kept in the image environment).
RUN SECRET_KEY="build-only-$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
    DATABASE_URL="postgres://build@127.0.0.1:5432/build" \
    ALLOWED_HOSTS="localhost" \
    CSRF_TRUSTED_ORIGINS="https://localhost" \
    REALOCAI_BASE_URL="https://realocai.invalid" \
    REALOCAI_API_KEY="build-only" \
    NUM_PROXIES="1" \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    /app/.venv/bin/python manage.py collectstatic --noinput

# --- runtime ------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    PORT=8000

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
# Root-owned and read-only for the app user: the process cannot change its own code.
COPY --from=build /app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "/app/docker/healthcheck.py"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application"]
