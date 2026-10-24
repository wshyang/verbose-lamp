# PSD Active Day App — single-container image: API + built SPA + cloudflared tunnel,
# all supervised by supervisord (ADR-043).
#
# The API has no compiled output on purpose (its build step is a typecheck); production runs
# `tsx` over the TypeScript source, which is why tsx lives in apps/api dependencies and the
# runtime stage carries source, not dist. The web app is the opposite: Vite emits a static
# bundle that the API serves same-origin via WEB_DIST, so one tunnel fronts the whole app.
#
# THIS IMAGE SEEDS THE DEMO DAY (ADR-175). For an event that must start empty, build
# Dockerfile-prd instead — same bits, no demo data:
#
#   docker build -t psd-active-day .                        # demo data on first boot
#   docker build -t psd-active-day -f Dockerfile-prd .      # empty, for a real event
#   docker run -e SUPERADMIN_INITIAL_PASSCODE=... -e TUNNEL_TOKEN=... -v psd-data:/data psd-active-day
#
# Runtime environment:
#   SUPERADMIN_INITIAL_PASSCODE  required on first boot (seeds the superadmin account)
#   TUNNEL_TOKEN                 Cloudflare named-tunnel token; omit for a throwaway
#                                trycloudflare.com URL (printed in the logs)
#   TUNNEL_DISABLE=1             run without any tunnel (use -p 8787:8787 instead)
#   DATABASE_DRIVER/DATABASE_URL point at external Postgres instead of the /data volume
#   PSD_SEED=default             override at RUN time to skip the demo day in this image

FROM node:22-alpine AS builder
WORKDIR /app

# Manifests first so `npm ci` caches across source-only changes.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/tournament/package.json packages/tournament/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Every workspace tsconfig extends this one. Vite resolves `extends` while building, so without
# it `npm run build --workspace @psd/web` fails with "failed to resolve extends" — a break that
# only ever shows up inside the image, because a developer's checkout always has the file.
COPY tsconfig.base.json ./

COPY packages/contracts packages/contracts
COPY packages/tournament packages/tournament
COPY apps/api apps/api
COPY apps/web apps/web
COPY scripts scripts
RUN npm run build --workspace @psd/web

# Prune to production dependencies for the runtime stage. tsx survives this because it is a
# real runtime dependency of the API (its start script), not a build tool.
RUN npm ci --omit=dev


FROM node:22-alpine
# bash: db-provision.sh / db-reset.sh are bash scripts and the app calls them for
# DB_INIT=demo and DB_INIT_RESET=stale (ADR-249, ADR-264).
RUN apk add --no-cache supervisor bash

# cloudflared ships no apk package; fetch the static binary for this architecture.
# Pin a release with --build-arg CLOUDFLARED_VERSION=2025.9.0 for reproducible builds.
ARG CLOUDFLARED_VERSION=latest
RUN set -eu; \
    case "$(apk --print-arch)" in \
      x86_64)  cf_arch=amd64 ;; \
      aarch64) cf_arch=arm64 ;; \
      armv7)   cf_arch=arm ;; \
      *) echo "unsupported architecture: $(apk --print-arch)"; exit 1 ;; \
    esac; \
    if [ "$CLOUDFLARED_VERSION" = "latest" ]; then \
      url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}"; \
    else \
      url="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${cf_arch}"; \
    fi; \
    wget -qO /usr/local/bin/cloudflared "$url"; \
    chmod +x /usr/local/bin/cloudflared; \
    cloudflared --version

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    PGLITE_DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/contracts packages/contracts
COPY --from=builder /app/packages/tournament packages/tournament
COPY --from=builder /app/apps/api apps/api
COPY --from=builder /app/apps/web/package.json apps/web/package.json
COPY --from=builder /app/apps/web/dist apps/web/dist
COPY --from=builder /app/scripts scripts
COPY --from=builder /app/tsconfig.base.json ./
COPY docker docker
COPY db-provision.sh db-reset.sh _dev-common.sh ./

# ADR-175 — WHICH DATA TIER A FRESH DATABASE GETS. This is the only line that differs between
# this file and Dockerfile-prd, and `npm run standards` fails the build if anything else does.
#
# `demo` applies seed-demo.sql — the recorded demo day — on first boot, and only into a database
# with no participants in it (ADR-102). It is the right default for the image people reach for
# first: a container that boots to an empty leaderboard cannot be evaluated, demonstrated or
# smoke-tested without somebody inventing a day's worth of data by hand.
ENV PSD_SEED=demo

# PGlite data lives here unless DATABASE_DRIVER=postgres points elsewhere.
VOLUME /data

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["supervisord", "-c", "/app/docker/supervisord.conf"]
