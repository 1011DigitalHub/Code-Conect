# Development Workflow

## Role: You are acting as a Senior Software Engineer responsible for process and delivery hygiene. Adhere strictly to the following constraints.

This file covers execution plans, PR validation, Conventional Commits and cross-cutting conventions/gotchas for the whole monorepo. See the root `CLAUDE.md` for commands and the full guideline index.

## Execution plans (`plan/`)

Every execution plan for this project lives in `plan/` at the repo root, one Markdown file per feature. Name the file after the feature in PascalCase and in Portuguese, for example `plan/PaginaLogin.md` or `plan/PaginaCadastro.md`.

- Once a plan is approved, save it in `plan/` before implementing it.
- If the scope changes during or after implementation (a swapped asset, a changed component), update the plan file with a dated note explaining what changed and why. Don't create a new file for the change.
- Plans follow the structure of `plan/PaginaLogin.md`: context, implementation steps, tests, commits and verification.
- Web plans include accessibility: the tests step lists the axe case for each new component and the new routes added to `e2e/routes.ts`. The verification step runs `pnpm test:web:a11y` and the manual checks (keyboard only, screen reader, 200% zoom). See `frontend-ux-seo.md` for the full accessibility contract.
- Web plans for a page also include performance and SEO: the page's meta description, its LCP image and how it is optimized, and, in the verification step, a Lighthouse table (scores per category plus LCP, CLS and TBT) measured on the production build. See `frontend-ux-seo.md`.
- When a plan lists measurements from the design, it also names the Tailwind token each one maps to (for example "407px → `w-102`", "`#81FE88` → `primary`"), following the styling rules in `frontend-architecture.md`. New colors go in the plan's theme step as `--color-*` tokens.
- API plans list the security cases a new endpoint needs, the same way web plans list accessibility cases: `401` with no session, `403` with a missing/mismatched CSRF pair on an unsafe method, and — for any route with a `:id` — an ownership case proving user A can't reach user B's resource (see "BOLA/IDOR" in `security-standards.md`).

## PR validation

Four GitHub Actions workflows, with different path scopes — know which ones actually ran before trusting a green PR:

- `.github/workflows/ci.yml` — **no path filter, runs on every push/PR regardless of what changed.** Three jobs: `quality` (`pnpm lint`, `pnpm typecheck`, `pnpm test:api`, `pnpm test:web`, no database), `e2e-api` (a Postgres service container, then `pnpm test:api:e2e`), `e2e-web` (`pnpm test:web:a11y` against the production build). This is the deterministic gate; keep it passing before merging.
- `.github/workflows/security.yml` — **also no path filter.** Secret scanning (TruffleHog, full git history), SAST (Semgrep OSS — oxlint has no security plugin of its own), and `pnpm audit --audit-level=high`.
- `.github/workflows/lighthouse.yml` — scoped to `apps/web/**` (plus the lockfile and its own workflow file). Performance/a11y/SEO scores against the production build; see "Performance and SEO (Lighthouse)" in `frontend-ux-seo.md`.
- `.github/workflows/claude.yml` — scoped to `apps/api/**` and `apps/web/**`. The Claude Code GitHub Action, reviewing the diff on PRs in that path scope and posting findings as a PR comment.

The only genuinely unscoped automation gaps are Lighthouse (never runs for an API-only change — correctly, it has nothing to measure) and Claude's review (never runs for a PR that only touches `plan/*.md`, `CLAUDE.md`, or root tooling config outside `apps/*`). For a PR like that, run the relevant commands by hand instead of assuming a review happened:

```bash
pnpm lint          # oxlint in every app
pnpm typecheck     # tsc -b / tsc --noEmit in every app
pnpm test:web      # web component tests
pnpm test:api      # api unit tests
pnpm test:web:a11y # only if the change could affect accessibility/SEO (needs the browser suite)
pnpm test:api:e2e  # only if the change could affect API behavior backed by the database (needs pnpm db:up)
```

## Git: Conventional Commits

Both apps use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

- **Types:**
  - `feat`, `fix`
  - `docs`, `style` (formatting only)
  - `refactor`, `perf`, `test`
  - `build` (deps, bundler), `ci`, `chore`, `revert`
- **Scopes:** `web` or `api` for changes to one app. Use `root` (or leave the scope out) for monorepo-level files such as the root `package.json`, `pnpm-workspace.yaml` or `CLAUDE.md`. If a change touches both apps, split it into one commit per app when possible.
- Write the description in the imperative mood, lowercase, with no trailing period, and keep it at 72 characters or fewer. Examples: `feat(api): add posts resource`, `test(web): cover Button click behavior`.
- Mark breaking changes with `!` after the type/scope (`feat(api)!: rename /users to /members`) and a `BREAKING CHANGE:` footer.
- One logical change per commit. A component commit includes its test.

## Conventions / gotchas

- **API is native ESM** (`"type": "module"`, `module: nodenext`). Relative imports **must** use the `.js` extension (e.g. `import { AppService } from './app.service.js'`), even from `.ts` files. `main.ts` uses top-level `await bootstrap()`.
- The API uses Vitest, not Jest: `globals: true` (`describe`/`it`/`expect` need no imports), and `vite-tsconfig-paths` resolves tsconfig path aliases. Unit tests are colocated in `src/` as `*.spec.ts`; e2e tests live in `apps/api/test/`.
- API lint treats `typescript/no-floating-promises` as an error, so await or explicitly handle every promise.
- API Prettier: single quotes, trailing commas. The web app has no Prettier config.
- `.gitattributes` enforces LF line endings (the repo is developed on Windows).
- The `apps/*/README.md` files are unmodified framework templates and don't document the project.
- Both apps run with `strict: true` and `noUncheckedIndexedAccess: true`. `exactOptionalPropertyTypes` is deliberately **off** on the web app: turning it on produces six errors, none of them bugs — friction between optional React props (`error?: string`) and state typed as `string | undefined`, plus one axios type. Don't turn it on without re-measuring first.
- `tsc` only ran as part of `build` before (and on the API, `tsconfig.build.json` excludes test files from even that) — `pnpm typecheck` / `pnpm api typecheck` / `pnpm web typecheck` run it standalone, against the full `tsconfig.json` on the API (including `*.spec.ts`/`test/`).
- `simple-git-hooks` + `lint-staged` run `pnpm --filter <app> lint` (the whole app's oxlint, not a file-scoped lint — oxlint's `--type-aware` mode on the API needs full project resolution) on every commit that touches that app. It's intentionally light; the real gate is CI.
- `apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage, non-root (`USER node` / `USER nginx`) production images — see `docker-compose.yml`'s `api`/`web` services and the Commands section of the root `CLAUDE.md`. Both apps' workspace installs run `apps/api`'s own `postinstall` (`prisma generate`) regardless of which app is being built, so both Dockerfiles copy `apps/api/prisma` in before `pnpm install`, even the web one.
