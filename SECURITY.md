# Security Policy

Code Connect is a learning/portfolio project (Alura), not a production service with paying users. This file still exists because the project follows a "Secure by Design" plan (`plan/SecureByDesign.md`) and is worth documenting honestly: what's implemented, what's a deliberate trade-off, and how to report a problem.

## Reporting a vulnerability

Open a private report via [GitHub's Security Advisories](../../security/advisories/new) for this repository, or email the maintainer directly (see the repository owner's GitHub profile). Please don't open a public issue for a security problem until it's been triaged.

There's no bug bounty and no formal SLA — this is a side project — but a real report will get a real response, generally within a few days.

## Supported versions

Only the `main` branch is supported. There are no released versions or LTS branches; always run the latest commit on `main`.

## What's implemented

The short version, in case you don't want to read `CLAUDE.md`'s full "Security" sections:

- **Session**: an httpOnly, `SameSite=Strict` cookie (`access_token`), not `localStorage`/`sessionStorage` — a JWT, short-lived by default, longer-lived only when "Lembrar-me" is checked.
- **CSRF**: a signed, session-bound double-submit token (`csrf_token` cookie + `X-CSRF-Token` header) on every unsafe method.
- **Passwords**: scrypt at `N=2^17` (OWASP's current minimum), versioned so the cost can be raised again later, with legacy hashes re-hashed on their next successful login.
- **Authorization**: fail-closed by default — every route needs `@Public()` to opt out of the global auth guard, not the other way around.
- **Headers**: helmet (CSP, HSTS, nosniff, frame-ancestors, `X-Powered-By` removed) on the API; the same CSP/HSTS/etc. on the web app's preview/production server.
- **Rate limiting**: a global default (100/min/IP) plus tighter limits on login (5/min) and sign-up (3/min).
- **Input validation**: every body/param/query goes through DTOs and a global `ValidationPipe` with `whitelist`/`forbidNonWhitelisted` (mass-assignment protection).
- **CI**: a quality gate (lint, typecheck, both test suites) plus secret scanning (TruffleHog), SAST (Semgrep OSS) and dependency auditing (`pnpm audit`) on every push/PR.

## Accepted risks

Deliberate trade-offs, not oversights — each one was a choice, not a gap nobody noticed:

- **A captured JWT remains valid after logout, until it expires.** Logout clears the session cookie but doesn't revoke the token server-side (the API is stateless — no session store, no database round trip on every authenticated request). The exposure window is bounded by the token's own TTL (1 hour by default, up to 7 days with "Lembrar-me"). Revoking individual tokens would need a `tokenVersion` column or a denylist; neither is implemented. See `test/security.e2e-spec.ts` for the test that documents this behavior rather than pretending it doesn't exist.
- **`exactOptionalPropertyTypes` is off** in both apps' `tsconfig.json`. Measured: turning it on produces six errors, none of them bugs — friction between optional React props and axios's types, not a real gap.
- **Two Prisma-CLI transitive dependencies (`mysql2`, `deepmerge-ts`) are version-overridden**, not naturally resolved, in `pnpm-workspace.yaml`, to clear `pnpm audit` findings in packages the API never actually uses at runtime (it talks to Postgres through `@prisma/adapter-pg`, not Prisma's own query engine). Remove the overrides once a stable Prisma release bumps them itself.
- **Social login (Github/Gmail) buttons exist in the UI and are disabled**, not implemented. See `plan/LoginSocial.md` for the OIDC design when that becomes real.
- **No RBAC/roles.** There's no `role` column and no endpoint that needs one yet — the first feature that does gets `RolesGuard`/`@Roles()`, not before.

## Dependencies

Dependabot watches `pnpm` and `github-actions` weekly (`.github/dependabot.yml`). `pnpm audit --audit-level=high` runs in CI on every push/PR (`.github/workflows/security.yml`) and must stay clean — a new high-severity finding either gets fixed upstream or gets a reasoned, narrow override in `pnpm-workspace.yaml` (see "Accepted risks" above for the existing ones), never a relaxed `--audit-level`.
