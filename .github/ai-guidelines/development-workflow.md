# Development Workflow

## Role: You are acting as a Senior Software Engineer responsible for process and delivery hygiene. Adhere strictly to the following constraints.

This file covers execution plans, PR validation, Conventional Commits and cross-cutting conventions/gotchas for the whole monorepo. See the root `CLAUDE.md` for commands and the full guideline index.

## Issue management

O repositório usa três templates de issue (em `.github/ISSUE_TEMPLATE/`): **Bug Report** (`bug`, `prio:medium`), **Feature Request** (`feature`, `prio:medium`) e **Débito Técnico** (`refactor`, `prio:low`). Blank issues estão desabilitadas — sempre use um template.

O workflow `.github/workflows/todo-to-issue.yml` (action `alstr/todo-to-issue-action@v5`) varre o código a cada push em `main` e converte comentários `// TODO:` e `// FIXME:` em issues com label `refactor`. Quando o marcador é removido do código, a issue é fechada automaticamente.

Para varrer os marcadores localmente: `pnpm find-todos`.

Ao criar um PR que resolve uma issue, use `Closes #N` na descrição para fechar automaticamente. Veja o fluxo completo em [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

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

Five files drive CI. `ci.yml` is the orchestrator; the others are either independent (`security.yml`) or reusable workflows called by `ci.yml` (`lighthouse.yml`, `claude.yml`).

### Scope detection and the condition matrix

On every PR, `ci.yml`'s first job (`changes`) classifies the changed files and sets the flags that all downstream jobs gate on:

| Changed files | `api` | `web` | `docs` |
|---|---|---|---|
| `apps/api/**`, `prisma/**` | ✓ | — | — |
| `apps/web/**` | — | ✓ | — |
| `**/*.md` only | — | — | ✓ |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/**` (core) | ✓ | ✓ | — |
| Anything outside the scopes above (unclassified, fail-closed) | ✓ | ✓ | — |
| Push to `main` or `workflow_dispatch` | ✓ | ✓ | — |

The step summary of the `changes` job prints the computed scope so you can confirm what triggered.

### Stage layout

```text
changes ─┬─ [Stage 1] static-api    (pnpm lint:api · pnpm typecheck:api)
         ├─ [Stage 1] static-web    (pnpm lint:web · pnpm typecheck:web)
         ├─ [Stage 1] docs-lint     (markdownlint on changed .md files)
         │
         ├─ claude-review           (reusable claude.yml)  needs: stage 1
         │
         ├─ [Stage 2] unit-api      (pnpm test:api)        needs: all of stage 1*
         ├─ [Stage 2] component-web (pnpm test:web)        needs: all of stage 1*
         │
         ├─ [Stage 3] e2e-api       (Postgres + pnpm test:api:e2e)    needs: all of stage 2
         ├─ [Stage 3] e2e-web       (Postgres + Playwright + pnpm test:web:a11y) needs: all of stage 2
         ├─ [Stage 3] lighthouse    (reusable lighthouse.yml)          needs: all of stage 2
         │
         └─ ci-gate (if: always()) — the only required check
```

\* `docs-lint` is intentionally **not** in the `needs` of stages 2 and 3. A markdown style error must not delay test feedback on code changes. Only `ci-gate` waits for it.

\* `unit-api` and `component-web` both depend on `static-api` **and** `static-web` for cross-app fail-fast: a lint or typecheck failure in either scope aborts both unit suites. A skipped job (`result: skipped`) does not trigger `failure()`, so scope isolation is preserved.

### Fail-fast

A failure in any job blocks all subsequent stages. Jobs skipped because they are out of scope are never counted as failures. The pipeline aborts at the stage boundary — jobs in the same stage run in parallel and cannot cancel each other.

### Workflows

- `.github/workflows/ci.yml` — orchestrator. Handles scope detection, all stage gating and calls `lighthouse.yml` and `claude.yml` as reusable workflows.
- `.github/workflows/security.yml` — **no path filter, runs on every PR.** Secret scanning (TruffleHog, full git history), SAST (Semgrep OSS) and `pnpm audit --audit-level=high`. Unchanged by this pipeline.
- `.github/workflows/lighthouse.yml` — reusable workflow (`workflow_call`). Triggered by `ci.yml`'s `lighthouse` job only when `web == true` (D1: API-only changes do not affect LCP metrics, so Lighthouse is skipped). Can also be run manually via `workflow_dispatch`.
- `.github/workflows/claude.yml` — reusable workflow (`workflow_call`). Triggered by `ci.yml`'s `claude-review` job after stage 1 passes on non-draft PRs that touch `apps/api/**` or `apps/web/**`. Never runs for docs-only PRs.

### The required check: `ci-gate`

`ci-gate` is the **only** job configured as a required status check in GitHub's branch protection for `main`. It runs with `if: always()` and fails if any job had `result: failure` or `result: cancelled`. All other jobs can be skipped without blocking merge.

> **Manual step:** replace any existing per-job required checks (e.g., `quality`, `e2e-web`) with the single `ci-gate` check in the repository's branch protection settings. See `plan/OtimizacaoPipelineCI.md`, point 1.

### Docs-only PRs

A PR that only touches `**/*.md` runs `docs-lint` (markdownlint on changed files) and nothing else. The `ci-gate` still turns green once docs-lint passes. If you need to validate code manually for an unusual change, run the relevant commands locally:

```bash
pnpm lint:api      # oxlint for the API
pnpm typecheck:api
pnpm test:api
pnpm test:api:e2e  # needs pnpm db:up
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm test:web:a11y # needs the browser suite; pnpm db:up for the feed
```

## Antes de escrever codigo novo

Antes de criar uma funcao, classe ou arquivo, percorra esta escada de decisao:

1. **Ja existe?** Busque no codebase (`grep -r`, glob) por funcionalidade similar.
2. **Pode estender?** Se algo parecido existe, estenda-o em vez de criar outro.
3. **Precisa ser codigo?** Uma configuracao, flag ou constante resolve?
4. **Qual e a menor mudanca?** Escreva o minimo que resolve o problema.
5. **Vai ser usado?** Todo export novo deve ter pelo menos um import. Nao crie "por via das dudas".

As camadas de Knip (codigo morto) e jscpd (duplicacao) no CI verificam automaticamente os pontos 1 e 5.

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

- **API is native ESM** (`"type": "module"`, `module: nodenext`). Relative imports **must** use the `.js` extension (e.g. `import { HealthService } from './health/health.service.js'`), even from `.ts` files. `main.ts` uses top-level `await bootstrap()`.
- The API uses Vitest, not Jest: `globals: true` (`describe`/`it`/`expect` need no imports), and `vite-tsconfig-paths` resolves tsconfig path aliases. Unit tests are colocated in `src/` as `*.spec.ts`; e2e tests live in `apps/api/test/`.
- API lint treats `typescript/no-floating-promises` as an error, so await or explicitly handle every promise.
- API Prettier: single quotes, trailing commas. The web app has no Prettier config.
- `.gitattributes` enforces LF line endings (the repo is developed on Windows).
- The `apps/*/README.md` files are unmodified framework templates and don't document the project.
- Both apps run with `strict: true` and `noUncheckedIndexedAccess: true`. `exactOptionalPropertyTypes` is deliberately **off** on the web app: turning it on produces six errors, none of them bugs — friction between optional React props (`error?: string`) and state typed as `string | undefined`, plus one axios type. Don't turn it on without re-measuring first.
- `tsc` only ran as part of `build` before (and on the API, `tsconfig.build.json` excludes test files from even that) — `pnpm typecheck` / `pnpm api typecheck` / `pnpm web typecheck` run it standalone, against the full `tsconfig.json` on the API (including `*.spec.ts`/`test/`).
- `simple-git-hooks` + `lint-staged` run `pnpm --filter <app> lint` (the whole app's oxlint, not a file-scoped lint — oxlint's `--type-aware` mode on the API needs full project resolution) on every commit that touches that app. It's intentionally light; the real gate is CI.
- `apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage, non-root (`USER node` / `USER nginx`) production images — see `docker-compose.yml`'s `api`/`web` services and the Commands section of the root `CLAUDE.md`. Both apps' workspace installs run `apps/api`'s own `postinstall` (`prisma generate`) regardless of which app is being built, so both Dockerfiles copy `apps/api/prisma` in before `pnpm install`, even the web one.
