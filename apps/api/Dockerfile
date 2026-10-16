# syntax=docker/dockerfile:1

# ---- build: installs dev+prod deps, compiles TS, generates the Prisma client ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Copies only what's needed to resolve the workspace and install deps first,
# so dependency layers stay cached across source-only changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# apps/api's postinstall (`prisma generate`) needs the schema to already be
# present the moment `pnpm install` runs it, not just the package.json.
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
RUN pnpm --filter api build

# ---- prod-deps: a second, production-only install ----
# --ignore-scripts skips apps/api's own postinstall (prisma generate): the
# build stage already compiled the generated client into dist/, and the
# `prisma` CLI it would need to run again is a devDependency this install
# deliberately excludes.
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter api...

# ---- runtime: only the compiled output and production node_modules ----
FROM node:22-alpine
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production

# The `node` user/group ship with the official image; --chown so nothing
# here is root-owned, which is what makes USER node below actually able to
# read its own files instead of merely dropping privileges on top of them.
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=build /app/apps/api/package.json ./apps/api/package.json

USER node
WORKDIR /app/apps/api
EXPOSE 3000

# dumb-init as PID 1 forwards SIGTERM to node properly, so
# app.enableShutdownHooks() (main.ts) gets the chance to drain the Prisma
# connection on a graceful stop instead of the process being killed outright.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

# The runtime stage installs nothing but dumb-init, so this uses Node 22's
# global fetch instead of curl. GET /health/live is the liveness probe
# (src/health) — a failed fetch exits 1. Liveness only tests that the
# process answers HTTP; it does NOT check the database, so a transient DB
# hiccup never restarts the container unnecessarily. Use GET /health/ready
# (which runs the DB probe) for readiness checks in an orchestrator.
# Reads process.env.PORT rather than hardcoding 3000: EXPOSE above is
# documentation only and doesn't change what the process actually binds to,
# so a container started with a different PORT would otherwise probe the
# wrong port and report unhealthy forever. The fallback only ever triggers
# on an unset or empty PORT (the same two cases src/env.ts's own
# readPositiveInt treats as "use the default"), so || is fine here — `??`
# would actually be wrong, since an explicit PORT="" would then survive into
# the URL as a literal empty string instead of falling back.
#
# start-period is generous because PrismaService.onModuleInit connects on
# boot: before that finishes the API legitimately isn't up yet, and without
# this window the container would be marked unhealthy during its own start.
# start-interval keeps checks frequent during exactly that window — without
# it, Docker's first check only happens at T+interval (30s), so `web`
# (gated on `api: condition: service_healthy`) would wait a full 30s on
# every cold start even when the api was ready in 2. Requires Docker Engine
# 25+ (API 1.44+) — confirm the deploy target's engine version; this repo's
# dev machine runs 29.8, well past it, but an older engine wasn't tested.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
