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
pnpm test:web          # web component tests (*.test.tsx), including axe checks
pnpm test:web:a11y     # web browser suites (Playwright, e2e/*.e2e.ts): accessibility and SEO
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
pnpm web build && pnpm web exec vite preview --host 127.0.0.1 --port 5174   # production build to audit with Lighthouse
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
- **No arbitrary values in classes.** Don't write `w-[407px]`, `text-[15px]`, `bg-[#81FE88]` or similar. Map every value from the design to a token:
  - **Sizes** (width, height, spacing, max-width, inset, radius): use the nearest step of Tailwind's scale instead of the exact pixel value. The spacing scale is 4px per step (`w-102` = 408px, `size-4.5` = 18px), container sizes cover large widths (`max-w-sm` = 384px, `max-w-2xl` = 672px, `max-w-5xl` = 1024px), fractions cover percentages (`left-1/12`, `w-1/4`) and ratios use the native syntax (`aspect-4/5`). A difference of a few pixels from the Figma value is acceptable.
  - **Colors**: only project palette names (`bg-surface`, `text-primary`, `text-danger`). Never hex values in classes, and never Tailwind's default colors (`red-400`, `gray-500`) directly. For a new color, extend the palette with a `--color-<name>` token in the `@theme` block of `src/index.css` (it can point at a default color, e.g. `--color-danger: var(--color-red-400)`). Name tokens by role (`danger`, `surface`), not by hue.
  - **Typography**: Figma style-guide sizes live as `--text-*` tokens (`text-subtitle`, `text-paragraph-sm`, `text-label`); use them or the default scale (`text-lg`).
  - **Anything else** with no token (for example an `object-position`): add a named utility with `@utility` in `src/index.css`.
  - Composing an image from several Figma SVG parts: place them with coordinates inside one `<svg viewBox>` (`<image x y width height>`) instead of percentage `inset-[...]` classes.
- Component variants (size, color, state) are driven by props that map to class sets. Don't make the caller pass raw class strings for that.
- Setup: Tailwind v4 via the `@tailwindcss/vite` plugin in `vite.config.ts`. There is no `tailwind.config.js`; v4 is configured in CSS, so theme tokens go in an `@theme` block in `src/index.css`. The VS Code extension `bradlc.vscode-tailwindcss` is recommended in `.vscode/extensions.json`.

### Component tests

- **Every component needs a test** covering its essential use: it renders with the required props, and its main interaction or behavior works (click calls the callback, input updates, conditional content shows). Don't create a component without its `*.test.tsx`.
- Test through what the user sees (roles, labels, text), not implementation details or Tailwind classes.
- Every component test file also has a `has no WCAG 2.2 AA violations` case that renders the component and calls `expectNoA11yViolations(container)` from `src/test/axe.ts` (see Accessibility below).
- The web app uses Vitest with `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom` (configured in `vite.config.ts`, setup file `src/test/setup.ts`, `globals: true`). Run with `pnpm test:web` or `pnpm web test:watch`.

### Accessibility: WCAG 2.2 level AA

The web app must conform to **WCAG 2.2 level AA** (which includes level A). A change that breaks an AA criterion isn't done, even if the feature works.

**Automated tests (two layers, both required):**

1. **Components (Vitest + `axe-core`)**: `expectNoA11yViolations(container)` in `src/test/axe.ts` runs the axe rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a` and `wcag22aa` (list in `src/test/wcag.ts`). It fails with one line per violation. jsdom has no layout, so contrast and target size are turned off here and checked in layer 2.
2. **Pages in a real browser (Playwright + `@axe-core/playwright`)**: `apps/web/e2e/a11y.e2e.ts` runs against the production build (`vite build` + `vite preview`) at three widths: desktop 1440px, tablet 768px and mobile 320px. For each route in `e2e/routes.ts` it checks:
   - the full axe AA rule set, including color contrast and target size;
   - 1.4.10 Reflow: no horizontal scrolling;
   - 1.4.12 Text Spacing: no text cut off when spacing is increased;
   - 2.4.2 Page Titled: a title in the form `<Page> | Code Connect`;
   - 2.1.1 Keyboard and 2.4.7 Focus Visible: every control can be reached with Tab and shows a focus indicator.

   **Every new public route must be added to `e2e/routes.ts`.** The SEO suite (`e2e/seo.e2e.ts`) and Lighthouse CI (`lighthouserc.cjs`) use the same list.

**Rules when building UI:**
- Semantic HTML first: native `button`, `a`, `input` and `label`, plus headings in order. Use ARIA only when no native element fits.
- Every control has an accessible name (visible label, `aria-label` only when there is no visible text). Decorative images use `alt=""` or `aria-hidden="true"`; informative ones get a descriptive `alt`.
- Contrast:
  - At least **4.5:1** for text and **3:1** for large text (≥24px, or ≥18.66px bold) and for UI parts (borders, icons, focus rings).
  - Check a new color token against every background it is used on before adding it to `@theme`.
- Visible keyboard focus on every interactive element (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`). Never remove the outline without a replacement.
- Targets of at least 24×24px (2.5.8).
- Each page calls `usePageMeta('<Page>', '<description>')` (`src/pages/usePageMeta.ts`), which sets `document.title` to `<Page> | Code Connect` and the page's meta description. Don't use React 19's `<title>` or `<meta>` elements: `index.html` already has a `<title>` and a default description, and the browser keeps showing the first one.
- Forms:
  - Every field has a `<label>`, plus `autoComplete` for personal data (1.3.5).
  - Errors are shown as text (`role="alert"`) and linked to the field with `aria-describedby` and `aria-invalid`.
  - Don't rely on color alone to signal an error.
- Content works at 320px wide and at 200% zoom. Never block zoom in the viewport meta tag.

**Manual checks:** automated tests cover only part of WCAG. Before closing a feature, also:
- use the page with the keyboard only;
- test with a screen reader (NVDA on Windows);
- check it at 200% browser zoom.

Each plan's verification step lists these checks.

**Playwright gotchas on this machine (Windows):**
- The config uses `channel: 'chromium'` (new headless mode), because the old headless shell stops answering `Tab` key presses.
- It uses `workers: 1`, because parallel browsers hang.
- After a failing test, the runner can hang while restarting the browser. To list every failure, run one test at a time with `-g`.

### Performance and SEO (Lighthouse)

Every page must pass a Lighthouse audit, not only Login and Cadastro. A page that misses these targets isn't done.

**Targets (Lighthouse desktop, per route):**
- **100** in Accessibility, Best Practices and SEO; **≥ 90** in Performance.
- Core Web Vitals: LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms.
- Agentic Browsing: every audit passes (accessibility tree, `llms.txt`, CLS).

**How to measure:**
- **CI (main source of truth):** the GitHub Action `.github/workflows/lighthouse.yml` runs Lighthouse CI on every push to `main` and every PR that touches `apps/web`, and can be started by hand (`gh workflow run lighthouse.yml`). It builds the app, serves it with `vite preview`, audits every route in `e2e/routes.ts` three times (desktop preset) and fails if a target below is missed (`apps/web/lighthouserc.cjs`). The job summary shows a table of scores and LCP/CLS/TBT per route, and the JSON/HTML reports are in the `lighthouse-reports` artifact (`gh run download <id> -n lighthouse-reports`). LHCI bundles Lighthouse 12, which has no Agentic Browsing category; `e2e/seo.e2e.ts` covers `llms.txt` and `robots.txt`.
- Locally, the Lighthouse CLI hangs on this Windows machine; use Chrome DevTools instead.
- Always audit the production build (`pnpm web build`, then `vite preview`, see Commands). Never audit `vite dev`: its unminified, development-mode bundle (several MB) produces false "Minify JavaScript", "Unused JavaScript" and "Total byte weight" findings and slow FCP/LCP.
- Use an incognito window without extensions. Extensions such as password managers add long tasks and break the bfcache.
- Record the scores and LCP/CLS/TBT in the page's plan (see Execution plans).

**Images:**
- Photos and banners are WebP (or AVIF), never large PNG/JPG. Aim for ≤ ~200 KB per image, exported at the largest size the layout actually renders. Convert once with `pnpm dlx sharp-cli -i <file> -o <dir> -f webp -q 75`.
- Every `<img>` has `width` and `height` (its intrinsic size), so the browser reserves its space; classes still set the rendered size.
- The LCP image of a page (usually the banner/hero) gets `fetchPriority="high"` and never `loading="lazy"`. Images below the fold get `loading="lazy"`.
- Small icons and logos are SVG. Don't keep unused files in `public/`: everything there ships with the build (design references go in `plan/assets/`).

**Fonts:**
- Self-host fonts with `@fontsource/*`, imported in `src/main.tsx`, only the weights the design uses (today Prompt 400 and 600). No third-party font stylesheets (Google Fonts): they block the first render and add external origins.

**JavaScript and CSS:**
- Nothing render-blocking in `index.html`: no external stylesheets or synchronous scripts.
- Check a dependency's size before adding it (prefer small, tree-shakeable packages). When the bundle grows, load heavy routes with `React.lazy` + `Suspense`.
- Avoid long tasks (> 50 ms) during load; defer non-critical work.

**Layout stability:**
- No layout shifts: reserve space for images, embeds and late content (`width`/`height`, `aspect-*`), and don't insert content above what is already on screen.

**SEO:**
- Every page calls `usePageMeta(title, description)`. The description is unique per page, 50 to 160 characters, in pt-BR. `e2e/seo.e2e.ts` checks it for every route.
- One `h1` per page and headings in order; links are real `<a href>` with descriptive text; `<html lang="pt-BR">` stays.
- `public/robots.txt` and `public/llms.txt` must exist (otherwise the SPA fallback serves `index.html` and both are reported invalid). Update `llms.txt` (an H1 and links to the public routes) when a public route is added.

**Best practices:**
- No errors in the browser console; no permission requests (location, notifications) on page load.
- Security headers (CSP, HSTS, COOP, X-Frame-Options) belong to the hosting setup; add them when the app is deployed.

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
- **Validation.** Validate every body, param and query with DTOs and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`). Use `ParseIntPipe`/`ParseUUIDPipe` for ids. The pipe is set up in `configureApp` (`src/app.setup.ts`), which `main.ts` and the e2e tests both call, so tests run with the same validation as production.
- **Caching and concurrency.** `GET` responses may use `ETag`/`Cache-Control`. Don't make `GET` responses uncacheable by mixing in side effects.

### Security: authentication and authorization

Auth lives in `src/auth/` (`AuthGuard`, JWT) and users in `src/users/`. The first version keeps users in an in-memory array (see `plan/AutenticacaoUsuario.md`).

**JWT:**
- Sign and verify with `@nestjs/jwt`. The secret comes from `JWT_SECRET` (see `getJwtSecret()` in `auth/auth.constants.ts`). Never hard-code a secret, never commit one, and never log tokens. In production the API must refuse to start without `JWT_SECRET`.
- Tokens are short-lived (`JWT_EXPIRES_IN`, in seconds, default 1 hour). The payload holds only what the guard needs (`sub` = user id, `email`). Never put a password, hash or other sensitive data in it: a JWT is signed, not encrypted.
- The token travels only in `Authorization: Bearer <token>`. Don't accept it in the URL or query string, and keep the API stateless.
- The login response is `{ accessToken, tokenType, expiresIn }`.

**Auth Guard:**
- Follow the NestJS "Authentication" guide: an `AuthGuard` implementing `CanActivate` that reads the Bearer header, calls `JwtService.verifyAsync` with the secret, and stores the payload in `request.user`. Any missing, malformed, expired or invalid token throws `UnauthorizedException`, with no detail about why.
- Protect each route explicitly with `@UseGuards(AuthGuard)` and `@ApiBearerAuth()`, or register the guard globally and mark public routes with a decorator. Never leave a route unprotected by accident: a new endpoint that returns user data must have a guard and an e2e test for the `401` case.
- Derive the user from the token (`request.user.sub`), never from an id sent by the client. A valid token for a user that no longer exists is a `401`.
- Use the typed `JwtPayload` and `AuthenticatedRequest` in `auth/auth.types.ts`, not `any`.

**Passwords and credentials:**
- Hash passwords with `scrypt` + a random salt and compare with `timingSafeEqual` (`users/password.ts`), or another adaptive hash (argon2, bcrypt). Never store, log or return a plain password or hash. Responses use `UserEntity`, which has no password field.
- Login failures return the same `401` message for an unknown email and a wrong password, so the API doesn't reveal which emails are registered.
- Passwords are 8 to 72 characters. Normalize emails (trim, lowercase) before comparing or storing them.

**General:**
- Responses return response DTOs or entities, never raw stored records. `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` stops mass assignment (a client can't set `id` or `role`).
- Errors keep Nest's default shape and don't leak stack traces, SQL or internal messages.
- Read secrets and settings from environment variables (`JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`). When a `.env` file is added, keep it out of git and commit a `.env.example`.
- Before the web app calls the API from the browser, enable CORS only for the known origins (`app.enableCors({ origin: [...] })`), never `*` together with credentials. Add rate limiting (`@nestjs/throttler`) to `POST /auth/login` and `POST /users` before deploying. Security headers (`helmet`) are added with the rest of the hosting setup.
- Run `pnpm audit` when adding auth-related dependencies.

### API documentation: Swagger (OpenAPI)

The Swagger setup is in `src/swagger.ts` (`setupSwagger`, called from `main.ts` and the e2e tests): UI at `/docs`, JSON at `/docs-json`. Every endpoint must be documented, and a change to an endpoint isn't done until its Swagger is updated.

- **No CLI plugin.** Vitest doesn't go through `nest build`, so document explicitly. Every DTO and entity field has `@ApiProperty({ example, description })`, with `minLength`/`maxLength`/`enum`/`format` when they apply, matching the `class-validator` rules.
- Each controller has `@ApiTags('<resource>')`. Each handler has `@ApiOperation({ summary })` (in pt-BR, short) and one response decorator for the success code (`@ApiOkResponse`, `@ApiCreatedResponse`, ...), with `type` set to a response class (arrays use `type: [X]`).
- Document every error the endpoint can return (`@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiConflictResponse`, `@ApiNotFoundResponse`, ...) with `type: ErrorResponseDto` (`common/dto/error-response.dto.ts`), which mirrors Nest's default error shape.
- Protected routes carry `@ApiBearerAuth()`, so Swagger UI sends the token after "Authorize". Public routes don't.
- Document inputs through DTO classes (`@Body`, `@Query`, `@Param`), not inline types, because only classes reach the OpenAPI document. Response types must be classes too.
- Swagger examples never contain real data or real secrets. Use obvious fakes (`maria@exemplo.com`, `senha-segura-123`).
- Each feature's e2e test asserts that its paths appear in `GET /docs-json` (see `test/auth.e2e-spec.ts`). Before deploying, decide whether `/docs` stays public; if not, disable it or protect it in production.

### Tests

Each controller and service gets a colocated `*.spec.ts` (see the existing `app.controller.spec.ts` for the pattern with `Test.createTestingModule`). Each endpoint also gets an e2e test in `apps/api/test/` with supertest that asserts the status code, the important headers (such as `Location`) and the response body.

## Execution plans (`plan/`)

Every execution plan for this project lives in `plan/` at the repo root, one Markdown file per feature. Name the file after the feature in PascalCase and in Portuguese, for example `plan/PaginaLogin.md` or `plan/PaginaCadastro.md`.

- Once a plan is approved, save it in `plan/` before implementing it.
- If the scope changes during or after implementation (a swapped asset, a changed component), update the plan file with a dated note explaining what changed and why. Don't create a new file for the change.
- Plans follow the structure of `plan/PaginaLogin.md`: context, implementation steps, tests, commits and verification.
- Web plans include accessibility: the tests step lists the axe case for each new component and the new routes added to `e2e/routes.ts`. The verification step runs `pnpm test:web:a11y` and the manual checks (keyboard only, screen reader, 200% zoom).
- Web plans for a page also include performance and SEO: the page's meta description, its LCP image and how it is optimized, and, in the verification step, a Lighthouse table (scores per category plus LCP, CLS and TBT) measured on the production build.
- When a plan lists measurements from the design, it also names the Tailwind token each one maps to (for example "407px → `w-102`", "`#81FE88` → `primary`"), following the styling rules above. New colors go in the plan's theme step as `--color-*` tokens.

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
