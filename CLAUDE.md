# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm monorepo (`pnpm-workspace.yaml` → `apps/*`) with two apps:

- `apps/api` — NestJS 12 backend (Express platform), tested with Vitest, linted with oxlint (type-aware). Listens on `process.env.PORT ?? 3000`.
- `apps/web` — React 19 + Vite 8 frontend, linted with oxlint.

The apps don't share code yet; there's no `packages/` folder for shared libraries. The web app talks to the API only over HTTP.

## Commands

Run these from the repo root. The root `package.json` wraps per-app scripts with `pnpm --filter`:

```bash
pnpm install
pnpm dev               # runs web (vite) and api (nest start --watch) together
pnpm dev:web | pnpm dev:api
pnpm build             # builds all apps (web: tsc -b && vite build; api: nest build)
pnpm lint              # oxlint in every app
pnpm test:web          # web component tests (*.test.tsx)
pnpm test:api          # api unit tests (*.spec.ts)
pnpm test:api:e2e      # api e2e tests (test/*.e2e-spec.ts, separate vitest config)
pnpm start:api         # node dist/main (needs a build first)
```

To run any other app script: `pnpm api <script>` / `pnpm web <script>`. Examples:

```bash
pnpm api test src/app.controller.spec.ts   # single test file
pnpm api test -t "should return"           # filter by test name
pnpm api test:watch
pnpm api test:cov
pnpm api format                            # prettier (api only)
```

## Frontend architecture (`apps/web`)

### Atomic Design

Components live in `src/components/`, one level per folder:

| Level | Folder | What goes there |
|---|---|---|
| Atoms | `atoms/` | Smallest UI building blocks (Button, Input, Label, Icon, Avatar). No business logic, no data fetching; they render props. |
| Molecules | `molecules/` | Small groups of atoms that work as one unit (SearchField = Input + Button, FormField = Label + Input + error text). |
| Organisms | `organisms/` | Self-contained sections of the UI (Header, PostCard list, CommentForm). Can hold local state and trigger callbacks. |
| Templates | `templates/` | Page layouts that arrange organisms and expose slots/children. No real data. |
| Pages | `src/pages/` | Templates filled with real data. The only level that fetches from the API or reads route params. |

Rules:
- A component imports only from its own level or lower levels (a molecule never imports an organism).
- Each component has its own folder: `ComponentName/ComponentName.tsx`, `ComponentName/ComponentName.test.tsx` and an `index.ts` that re-exports it.
- Keep API calls out of `components/`. Pages (or hooks they use) fetch data and pass it down as props.

### Styling: Tailwind CSS

- Style with Tailwind utility classes in JSX. Don't add new `.css` files or CSS modules per component; `src/index.css` only holds the Tailwind import and global base styles.
- Put design tokens (colors, fonts, spacing) in the Tailwind theme, not as hard-coded values scattered through components.
- Component variants (size, color, state) are driven by props that map to class sets. Don't make the caller pass raw class strings for that.
- Setup: Tailwind v4 via the `@tailwindcss/vite` plugin in `vite.config.ts`. There is no `tailwind.config.js`; v4 is configured in CSS, so theme tokens go in an `@theme` block in `src/index.css`. The VS Code extension `bradlc.vscode-tailwindcss` is recommended in `.vscode/extensions.json`.

### Component tests

- **Every component needs a test** covering its essential use: it renders with the required props, and its main interaction or behavior works (click calls the callback, input updates, conditional content shows). Don't create a component without its `*.test.tsx`.
- Test through what the user sees (roles, labels, text), not implementation details or Tailwind classes.
- The web app uses Vitest with `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom` (configured in `vite.config.ts`, setup file `src/test/setup.ts`, `globals: true`). Run with `pnpm test:web` or `pnpm web test:watch`.

## Backend architecture (`apps/api`)

### Module layout

One NestJS feature module per resource, in `src/<resource>/` (plural, kebab-case):

```
src/posts/
  posts.module.ts
  posts.controller.ts        # HTTP only: routing, status codes, headers, DTO binding
  posts.service.ts           # business logic; knows nothing about HTTP
  posts.controller.spec.ts
  posts.service.spec.ts
  dto/create-post.dto.ts     # request bodies
  dto/update-post.dto.ts
  entities/post.entity.ts    # resource representation
```

Controllers stay thin and delegate to services. Services throw Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...) or domain errors that a filter maps to them. Register every feature module in `AppModule`. Generate with `pnpm api exec nest g resource <name>`, then fix imports to use `.js` extensions (see gotchas).

### REST rules

Every endpoint must follow REST principles:

- **Resources, not actions.** URLs are plural nouns: `/posts`, `/posts/:id`, `/posts/:postId/comments`. No verbs in paths (`/createPost`, `/posts/:id/delete` are wrong). Nest at most one level deep; beyond that, use top-level resources with filters.
- **HTTP methods by semantics:**
  - `GET` reads and never changes state.
  - `POST` on a collection creates.
  - `PUT` replaces the whole resource (idempotent).
  - `PATCH` updates part of it.
  - `DELETE` removes it (idempotent).
- **Status codes:**
  - `200` for reads and updates that return a body.
  - `201 Created` with a `Location` header and the created resource for `POST`.
  - `204 No Content` for `DELETE` and updates without a body.
  - `400` for malformed input, `422` for validation that fails on well-formed input (pick one convention and use it everywhere).
  - `401`/`403` for authentication/authorization, `404` for a missing resource, `409` for conflicts (duplicates, state clashes).
  - Never return `200` with an error in the body.
  - Set codes explicitly with `@HttpCode()` when Nest's default is wrong, for example `@HttpCode(204)` on `DELETE`.
- **Stateless.** Each request carries everything needed (for example the auth token in `Authorization`). No server-side session state between requests.
- **Representations.** JSON in and out, `camelCase` fields. Responses return resource representations (entities/response DTOs), never raw persistence objects or internal fields.
- **Collections.** Filtering, sorting and pagination go in query params (`?page=1&limit=20&sort=-createdAt&authorId=1`). Paginated responses include the data plus pagination metadata and links (`self`, `next`, `prev`).
- **Hypermedia.** Resources include links to themselves and to related resources where useful (for example a post links to its comments).
- **Consistent errors.** Keep Nest's default error shape (`statusCode`, `message`, `error`) across the whole API. Don't invent per-endpoint formats.
- **Validation.** Validate every body, param and query with DTOs and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`). Use `ParseIntPipe`/`ParseUUIDPipe` for ids. `class-validator`/`class-transformer` aren't installed yet; add them when the first DTO is needed.
- **Caching and concurrency.** `GET` responses may use `ETag`/`Cache-Control`. Don't make `GET` responses uncacheable by mixing in side effects.

### Tests

Each controller and service gets a colocated `*.spec.ts` (see the existing `app.controller.spec.ts` for the pattern with `Test.createTestingModule`). Each endpoint also gets an e2e test in `apps/api/test/` with supertest that asserts the status code, the important headers (such as `Location`) and the response body.

## Execution plans (`plan/`)

Every execution plan for this project lives in `plan/` at the repo root, one Markdown file per feature. Name the file after the feature in PascalCase and in Portuguese, for example `plan/PaginaLogin.md` or `plan/PaginaCadastro.md`.

- Once a plan is approved, save it in `plan/` before implementing it.
- If the scope changes during or after implementation (a swapped asset, a changed component), update the plan file with a dated note explaining what changed and why. Don't create a new file for the change.
- Plans follow the structure of `plan/PaginaLogin.md`: context, implementation steps, tests, commits and verification.

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
