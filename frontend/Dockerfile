# Frontend (React + Vite SPA served by nginx). Build context: frontend/
#
# VITE_* values are embedded in the JavaScript at build time and are PUBLIC: never pass
# secrets as build args. Versions are pinned; upgrade them deliberately.
ARG NODE_IMAGE=node:24.21.0-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.5-alpine

# --- build -------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build

# Origin of the Django API, e.g. https://api-chatbot.vidaplenamulti.com.br
ARG VITE_API_BASE_URL=""
ARG VITE_USE_MOCK="false"

# A production image must talk to the real API over https: fail the build otherwise.
RUN case "$VITE_USE_MOCK" in \
      false) ;; \
      *) echo "build: VITE_USE_MOCK must be false in a production image" >&2; exit 1 ;; \
    esac \
    && case "$VITE_API_BASE_URL" in \
      https://?*) ;; \
      *) echo "build: VITE_API_BASE_URL must be set to an https:// origin" >&2; exit 1 ;; \
    esac \
    && case "$VITE_API_BASE_URL" in \
      */) echo "build: VITE_API_BASE_URL must not end with /" >&2; exit 1 ;; \
    esac

WORKDIR /app

# Variables already in the environment take precedence over .env.production in Vite.
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_USE_MOCK=${VITE_USE_MOCK} \
    NODE_ENV=production

COPY package.json package-lock.json ./
# --include=dev: Vite is a devDependency. Install scripts stay enabled: esbuild needs its
# postinstall to pick the platform binary.
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run check:blocks && npm run build
RUN grep -rqF "$VITE_API_BASE_URL" dist/assets \
    || { echo "build: API origin not found in the bundle" >&2; exit 1; }

# --- runtime -----------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runtime

ARG VITE_API_BASE_URL=""

# Read by the nginx image entrypoint: templates in /etc/nginx/templates are rendered
# with envsubst into /etc/nginx/conf.d at startup (only these variables are replaced).
ENV PORT=8080 \
    API_ORIGIN=${VITE_API_BASE_URL} \
    NGINX_ENVSUBST_FILTER="^(PORT|API_ORIGIN)$"

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
COPY --from=build /app/dist /usr/share/nginx/html
USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
