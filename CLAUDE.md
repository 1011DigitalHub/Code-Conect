# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm monorepo (`pnpm-workspace.yaml` → `apps/*`) with two apps:

- `apps/api` — NestJS 12 backend (Express platform), tested with Vitest, linted with oxlint (type-aware). Listens on `process.env.PORT ?? 3000`.
- `apps/web` — React 19 + Vite 8 frontend, linted with oxlint.

The apps don't share code yet; there's no `packages/` folder for shared libraries. The web app talks to the API only over HTTP.

This file (the "hub") stays short on purpose: commands plus an index. Architecture, security and workflow rules live in the modular "spoke" files under `.github/ai-guidelines/` linked below — read the relevant one(s) for the area you're working in.

## Commands

Run these from the repo root. The root `package.json` wraps per-app scripts with `pnpm --filter`:

```bash
pnpm install
pnpm dev               # runs web (vite) and api (nest start --watch) together
pnpm dev:web | pnpm dev:api
pnpm build             # builds all apps (web: tsc -b && vite build; api: nest build)
pnpm lint              # oxlint in every app
pnpm typecheck         # tsc -b / tsc --noEmit in every app (separate from build; also checks test files on the API)
pnpm audit --audit-level=high   # dependency vulnerabilities; CI fails on this (.github/workflows/security.yml)
pnpm test:web          # web component tests (*.test.tsx), including axe checks
pnpm test:web:a11y     # web browser suites (Playwright, e2e/*.e2e.ts): accessibility, SEO and security headers
pnpm test:api          # api unit tests (*.spec.ts), no database needed
pnpm test:api:e2e      # api e2e tests (test/*.e2e-spec.ts, separate vitest config); needs pnpm db:up
pnpm start:api         # node dist/main (needs a build first)
pnpm db:up             # start PostgreSQL in Docker (docker-compose.yml) and wait until healthy — also needs OIDC_LINKING_TOKEN_SECRET (and POSTGRES_PASSWORD/JWT_SECRET) in the root .env: compose interpolates every service's env vars upfront, even when only postgres is targeted
pnpm db:down           # stop it; data stays in the code-connect-pgdata volume
pnpm db:migrate        # prisma migrate dev: apply migrations / create one after editing schema.prisma
pnpm db:studio         # Prisma Studio, to browse the data
pnpm knip              # dead code / unused exports (Knip)
pnpm knip:fix          # auto-remove unused exports
pnpm cpd               # copy-paste detection (jscpd, threshold 5%)
```

The hardened production images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) aren't part of the day-to-day loop above — `pnpm dev` against `pnpm db:up`'s postgres is faster. Build and smoke-test them locally with `docker compose up --build api web` (needs `JWT_SECRET`/`CORS_ORIGINS`/`VITE_API_URL`/`OIDC_LINKING_TOKEN_SECRET` in the root `.env`, see `.env.example`); `pnpm dev`/`pnpm db:up` stays the normal workflow.

To run any other app script: `pnpm api <script>` / `pnpm web <script>`. Examples:

```bash
pnpm api test src/app.controller.spec.ts   # single test file
pnpm api test -t "should return"           # filter by test name
pnpm api test:watch
pnpm api test:cov
pnpm api format                            # prettier (api only)
pnpm web build && pnpm web exec vite preview --host 127.0.0.1 --port 5174   # production build to audit with Lighthouse
```

## Development Guidelines & Architecture Docs

Detailed, framework-specific rules live in `.github/ai-guidelines/` instead of this file, so each concern can be read (and reused across tools/LLMs) on its own:

- [`.github/ai-guidelines/frontend-architecture.md`](.github/ai-guidelines/frontend-architecture.md) — Atomic Design component structure, the Axios API layer (`src/api/`), and Tailwind CSS styling/token rules for `apps/web`.
- [`.github/ai-guidelines/frontend-ux-seo.md`](.github/ai-guidelines/frontend-ux-seo.md) — Component testing conventions, WCAG 2.2 AA accessibility (automated + manual), and Lighthouse performance/SEO targets (including image and font handling) for `apps/web`.
- [`.github/ai-guidelines/backend-architecture.md`](.github/ai-guidelines/backend-architecture.md) — NestJS module layout, REST conventions (resources, status codes, validation), test colocation and Swagger/OpenAPI documentation for `apps/api`.
- [`.github/ai-guidelines/security-standards.md`](.github/ai-guidelines/security-standards.md) — Unified frontend + backend security: session cookies, CSRF, the fail-closed Auth Guard, BOLA/IDOR, password hashing, rate limiting and reverse-proxy (`TRUST_PROXY`) rules.
- [`.github/ai-guidelines/database-persistence.md`](.github/ai-guidelines/database-persistence.md) — PostgreSQL 18 + Prisma 7: schema/migrations, query minimization (`omit`), raw SQL rules and test database setup.
- [`.github/ai-guidelines/development-workflow.md`](.github/ai-guidelines/development-workflow.md) — Execution plans (`plan/`), PR validation workflows, Conventional Commits, and cross-cutting conventions/gotchas (ESM imports, lint-staged, Docker images).
