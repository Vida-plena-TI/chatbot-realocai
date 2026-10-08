"""Container healthcheck: GET /api/health/ on the local gunicorn.

Sends the public host (first ALLOWED_HOSTS entry) and X-Forwarded-Proto: https, as
Traefik would, so neither ALLOWED_HOSTS nor SECURE_SSL_REDIRECT need an exception.
"""

import http.client
import os
import sys

host = os.environ.get("ALLOWED_HOSTS", "").split(",")[0].strip() or "localhost"
port = int(os.environ.get("PORT", "8000"))

try:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/health/", headers={"Host": host, "X-Forwarded-Proto": "https"})
    status = connection.getresponse().status
except OSError:
    sys.exit(1)
sys.exit(0 if status == 200 else 1)
