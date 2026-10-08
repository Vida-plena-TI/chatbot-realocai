#!/bin/sh
# Container entrypoint: validate the environment, migrate, then run the command
# (gunicorn by default). Never print variable values here.
set -eu

case "${DJANGO_SETTINGS_MODULE:-}" in
  config.settings.prod) ;;
  *)
    echo "entrypoint: DJANGO_SETTINGS_MODULE must be config.settings.prod" >&2
    exit 1
    ;;
esac

# Lists every missing/invalid variable at once and exits 1.
python -m config.env_check

if [ "${1:-}" = "gunicorn" ]; then
  # Single replica: migrating at startup is safe. Migrations must stay compatible with the
  # previous release, which may still be serving while the new container starts.
  python manage.py migrate --noinput
  # Cache table for the throttle counters (no-op when it already exists).
  python manage.py createcachetable
fi

exec "$@"
