"""Gunicorn settings for the container (read automatically from the working directory).

Every value can be overridden by environment variables; config.env_check validates them.
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# A chat message holds its thread while RealocAI answers (up to REALOCAI_TIMEOUT_SECONDS),
# so threads keep slow answers from blocking the other requests.
worker_class = "gthread"
workers = int(os.environ.get("GUNICORN_WORKERS", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))

# Worst turn: two RealocAI calls (restart after 404), each up to 5 s connect + 90 s read
# = 190 s, plus saving and memory extraction (up to 20 s). 240 s leaves a margin.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "240"))
# On SIGTERM, workers stop accepting and finish in-flight requests for up to this long.
# The orchestrator's stop grace period must be at least as long, or it sends SIGKILL.
graceful_timeout = int(os.environ.get("GUNICORN_GRACEFUL_TIMEOUT", "30"))
# Longer than the proxy's idle timeout for upstream connections (Traefik: 90 s), so the
# proxy never reuses a connection gunicorn has just closed.
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "95"))

# Heartbeat files in memory (the container filesystem may be slow or read-only).
worker_tmp_dir = "/dev/shm"  # noqa: S108
# The runtime control socket is not used.
control_socket_disable = True

# Access log on stdout, error log on stderr. No client IP, query string, user agent,
# referer or body: method, path, status, size and duration only.
accesslog = "-"
errorlog = "-"
access_log_format = '"%(m)s %(U)s" %(s)s %(B)s %(M)sms'
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
