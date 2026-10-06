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
pnpm typecheck         # tsc -b / tsc --noEmit in every app (separate from build; also checks test files on the API)
pnpm audit --audit-level=high   # dependency vulnerabilities; CI fails on this (.github/workflows/security.yml)
pnpm test:web          # web component tests (*.test.tsx), including axe checks
pnpm test:web:a11y     # web browser suites (Playwright, e2e/*.e2e.ts): accessibility, SEO and security headers
pnpm test:api          # api unit tests (*.spec.ts), no database needed
pnpm test:api:e2e      # api e2e tests (test/*.e2e-spec.ts, separate vitest config); needs pnpm db:up
pnpm start:api         # node dist/main (needs a build first)
pnpm db:up             # start PostgreSQL in Docker (docker-compose.yml) and wait until healthy
pnpm db:down           # stop it; data stays in the code-connect-pgdata volume
pnpm db:migrate        # prisma migrate dev: apply migrations / create one after editing schema.prisma
pnpm db:studio         # Prisma Studio, to browse the data
```

The hardened production images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) aren't part of the day-to-day loop above — `pnpm dev` against `pnpm db:up`'s postgres is faster. Build and smoke-test them locally with `docker compose up --build api web` (needs `JWT_SECRET`/`CORS_ORIGINS`/`VITE_API_URL` in the root `.env`, see `.env.example`); `pnpm dev`/`pnpm db:up` stays the normal workflow.

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
- Keep API calls out of `components/`. Pages (or hooks they use) fetch data and pass it down as props. Components never import from `src/api/`.

### API layer: Axios (`src/api/`)

- `client.ts` is the only Axios instance. `baseURL` comes from `VITE_API_URL` (default `http://localhost:3000`, see `.env.example`). `withCredentials: true`, since the session is an httpOnly cookie (`access_token`), not something the client reads or stores — there is no `tokenStorage.ts`, and there must never be one again: don't put a JWT in `localStorage`/`sessionStorage`.
- Every unsafe method (anything but GET/HEAD/OPTIONS) needs `X-CSRF-Token` set to the (non-HttpOnly) `csrf_token` cookie's value — see the API's `CsrfGuard`. A request interceptor does this, bootstrapping a token via `GET /auth/csrf` first if none is set (`src/api/csrf.ts`, memoized so concurrent callers share one bootstrap request); a response interceptor retries a `403` exactly once after refetching the token, using a flag stamped on the request config (not a `WeakSet` keyed by object identity — axios's `mergeConfig` builds a new config object on every retry, so identity-based tracking never recognizes a retried request and loops forever; this is not hypothetical, it happened while writing the test for it).
- One file per resource (`auth.ts`, `users.ts`) with typed functions that return `response.data`. Types in `types.ts` mirror the Swagger document.
- Pages turn failures into messages with `getErrorMessage` (`errors.ts`, pt-BR, by status; `429` reads `Retry-After`) and show them with `FormError`. Don't show the API's own messages.
- Private pages (`/perfil`) have no readable token to gate on synchronously anymore: they render an optimistic loading state, call `GET /auth/me`, and redirect to `/login` only on a `401`. They are not added to `e2e/routes.ts`; they get their own browser suite (`e2e/profile.e2e.ts`) with a fake API through `page.route`, seeding the session (where needed) via `browserContext.addCookies()` — the only way to write an `httpOnly` cookie from Playwright, since `page.addInitScript` + storage can no longer reach it.

### Frontend security

- No secret ever goes in a `VITE_*` variable: Vite inlines every `import.meta.env.VITE_*` value into the client bundle at build time, so it is visible to anyone who opens DevTools, build artifact or not. `VITE_API_URL` (a public URL) is the only one that should ever exist.
- No `dangerouslySetInnerHTML` without `dompurify` sanitizing the input first — there is currently none in the codebase and no reason to add one.
- A dynamic link (`<a href={...}>`, or `TextLink`'s `href` prop) must be validated to start with `/` before being used, closing off a `javascript:` URL vector. `TextLink` (`src/components/atoms/TextLink/TextLink.tsx`) throws if it doesn't; every current caller passes a hardcoded literal, so this is a guard for the first caller that ever passes API-sourced data, not a fix for something broken today.
- Security headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`) are set in `vite.config.ts`'s `preview.headers`, which Playwright and Lighthouse CI both run against — they are tested, not just documented. The production nginx config (`apps/web/default.conf.template`) carries the same values; keep the two in sync by hand, since nginx has no way to import `vite.config.ts` at build time. `script-src` has no `'unsafe-inline'` (there is no inline `<script>` in `index.html`); `style-src` does, only because the WCAG 1.4.12 Playwright test injects a stylesheet via `page.addStyleTag`, which a strict `style-src` blocks — inline CSS has nowhere near the attack surface of inline JS, so this is the standard, lower-risk trade-off, not an oversight.

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
- Security headers (CSP, HSTS, COOP, X-Content-Type-Options, Referrer-Policy) are set in `vite.config.ts`'s `preview.headers` and mirrored in the production nginx config — see "Frontend security" above. Lighthouse's Best Practices score does **not** catch a missing or broken CSP (the CSP-XSS audit is informational, not scored); `e2e/security.e2e.ts` is the real check for these.

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
- **Stateless.** Each request carries everything needed (the session cookie, the CSRF header on an unsafe method). No server-side session store between requests — the API keeps no session state of its own; see Security below for what that trades away (a token can't be revoked server-side before it expires).
- **Representations.** JSON in and out, `camelCase` fields. Responses return resource representations (entities/response DTOs), never raw persistence objects or internal fields.
- **Collections.** Filtering, sorting and pagination go in query params (`?page=1&limit=20&sort=-createdAt&authorId=1`). Paginated responses include the data plus pagination metadata and links (`self`, `next`, `prev`).
- **Hypermedia.** Resources include links to themselves and to related resources where useful (for example a post links to its comments).
- **Consistent errors.** Keep Nest's default error shape (`statusCode`, `message`, `error`) across the whole API. Don't invent per-endpoint formats.
- **Validation.** Validate every body, param and query with DTOs and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`). Use `ParseIntPipe`/`ParseUUIDPipe` for ids. The pipe is set up in `configureApp` (`src/app.setup.ts`), which `main.ts` and the e2e tests both call, so tests run with the same validation as production.
- **Caching and concurrency.** `GET` responses may use `ETag`/`Cache-Control`. Don't make `GET` responses uncacheable by mixing in side effects.

### Security: authentication and authorization

Auth lives in `src/auth/` (`AuthGuard`, `CsrfGuard`, JWT) and users in `src/users/`. Users are stored in PostgreSQL through Prisma (see Database below and `plan/PersistenciaDados.md`). The full migration from the original Bearer-token design to the cookie session below is `plan/SecureByDesign.md`.

**Session cookie, not a token the client holds:**
- `POST /auth/login` sets an `access_token` cookie (`HttpOnly`, `SameSite` from `COOKIE_SAMESITE` — default `strict`, `Secure` from `COOKIE_SECURE` — default on in production, off elsewhere) via `getSessionCookieOptions()` (`auth/cookie.constants.ts`). The response body carries only `{ tokenType, expiresIn }` — never the raw token. There is no `Authorization: Bearer` support anymore; `AuthGuard` only reads the cookie.
- "Lembrar-me" (`remember` on `LoginDto`) controls both the cookie's `Max-Age` (persistent vs. a session cookie) and the JWT's own lifetime (`JWT_EXPIRES_IN_SECONDS` vs. the longer `REMEMBER_ME_EXPIRES_IN_SECONDS`) — the two must move together, or a cookie that outlives its token produces a "logged in, but every request 401s" loop.
- `POST /auth/logout` clears the cookie. It does **not** revoke the token server-side (the API is stateless, no session store) — a token captured before logout stays valid until it expires. This is a deliberately accepted trade-off, documented in `SECURITY.md` and exercised (not just asserted) by an e2e case in `test/security.e2e-spec.ts`.
- `JWT_SECRET` comes from `getJwtSecret()` (`auth/auth.constants.ts`), validated at boot by `src/env.ts` (see below) — never hard-code one, never commit one, never log a token. The payload holds only `sub` (user id) and `email`; never a password, hash or other sensitive data — a JWT is signed, not encrypted. Signing and verifying both pin `algorithms: ['HS256']` explicitly (`auth/auth.constants.ts`'s `JWT_ALGORITHM`) rather than relying on a library default.

**CSRF:**
- A signed, session-bound double-submit token (`CsrfGuard`, `auth/csrf.ts`): the `csrf_token` cookie (readable, not `HttpOnly`) and the `X-CSRF-Token` header must match, and the cookie's HMAC must verify against a key derived from the current `access_token` cookie — a token minted for a different session (or before the current one existed) doesn't validate. Required on every unsafe method (`POST`/`PUT`/`PATCH`/`DELETE`), including `@Public()` routes like login and sign-up: `SameSite=Strict` alone doesn't stop login CSRF, since a cross-site POST's `Set-Cookie` response is still stored by the browser and sent on the victim's next same-site navigation.
- `GET /auth/csrf` (`@Public()`, `@NoCsrf()`) lets an anonymous visitor bootstrap a token before their first mutation. Login rotates it, bound to the newly-issued token — not to whatever stale `access_token` cookie the login request happened to carry.
- A new webhook/machine-to-machine route that genuinely can't carry the header gets `@NoCsrf()`, not a broader exemption.

**Auth Guard — fail-closed by default:**
- `AuthGuard` is a global `APP_GUARD` (registered in `AppModule`, alongside `ThrottlerGuard` and `CsrfGuard` in one explicit array — their relative order matters and doesn't survive being split across modules, since Nest doesn't guarantee cross-module `APP_GUARD` resolution order). **Every route is protected unless it carries `@Public()`.** This is inverted from the old opt-in model on purpose: a new endpoint that forgets a decorator stays protected instead of accidentally becoming public.
- Read the current user with `@CurrentUser()` (`auth/current-user.decorator.ts`), not a raw `@Req()` — it's only valid on a route behind the guard, since `request.user` is genuinely absent on a `@Public()` one (see the `MaybeAuthenticatedRequest`/`AuthenticatedRequest` split in `auth/auth.types.ts`).
- Derive the user from the token (`user.sub`), never from an id sent by the client. A valid token for a user that no longer exists is a `401`.
- `/api/docs` and `/api/docs-json` are **not** protected by this guard and can't be: `SwaggerModule` registers its routes directly on the underlying Express instance (`httpAdapter.get(...)`), bypassing Nest's router entirely, so no Nest guard ever sees them. Gate them with `SWAGGER_ENABLED` instead (see `env.ts` below) — defaults on outside production, off in it.
- **BOLA/IDOR**: there is no route with a `:id` param yet, so there is no ownership check to write — but the pattern for the first one that needs it: derive the actor from `@CurrentUser()`, never trust an id from the body or path as the actor, and prefer a single query shaped `where: { id, authorId: actor.sub }` over a separate existence check (avoids a TOCTOU gap and an extra round trip). Return `404` instead of `403` when the resource's existence itself should be private. Every new owned resource needs an e2e case proving user A can't touch user B's resource.
- No RBAC/roles exist yet (no `role` column, no `RolesGuard`) — add them when a feature actually needs one, not speculatively.

**Passwords and credentials:**
- Hash with `scrypt` at `N=2^17` (OWASP's 2023+ minimum for an interactive login; `r`/`p` at the conventional defaults), compared with `timingSafeEqual` (`users/password.ts`). Stored as `scrypt$N=<N>,r=<r>,p=<p>$<salt>$<hash>` — versioned, so the cost can be raised again later without invalidating every existing hash, which the old unversioned `"<salt>:<hash>"` format couldn't do. `verifyPassword` still accepts that legacy format; `shouldRehash()` flags any hash (legacy or an older versioned one) that isn't at the current cost, and `AuthService.signIn` re-hashes and persists it on the next successful login — never store, log or return a plain password or hash. Responses use `UserEntity`, which has no password field, and `PrismaService` sets a global `omit` on `User.passwordHash` (see Database below) so it isn't even fetched except where `findByEmail` explicitly opts back in.
- Login failures return the same `401` message for an unknown email and a wrong password — and `AuthService.signIn` always runs the scrypt comparison, against a fixed `DUMMY_HASH` when the user doesn't exist, so an unknown email doesn't also respond measurably faster (the short-circuit that used to skip the comparison entirely was a real timing side channel the identical message alone didn't close).
- Passwords are 8 to 72 characters; emails are capped at 254 (the column's `VARCHAR(254)`, enforced with `@MaxLength(254)` on the DTOs — without it an over-long email reached Prisma and came back as a `500`). Normalize emails (trim, lowercase) before comparing or storing them.

**General:**
- Responses return response DTOs or entities, never raw stored records. `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` stops mass assignment (a client can't set `id` or `role`).
- Errors keep Nest's default shape and don't leak stack traces, SQL or internal messages.
- **Environment variables are validated once at boot**, not read ad hoc: `src/env.ts`, imported first in `main.ts` right after `load-env.js`, aggregates every problem into one error message instead of surfacing them one at a time on the first request that happens to need the broken variable. It validates `NODE_ENV` (must be `development`/`test`/`production` — previously read in two places and undeclared in any `.env.example`), `DATABASE_URL`'s scheme, `CORS_ORIGINS` being non-empty in production, `JWT_SECRET`'s length, `TRUST_PROXY` and `SWAGGER_ENABLED`. Keep `.env` files out of git and commit a `.env.example` next to each one (`.gitignore` ignores `.env.*` except `.env.example`).
- **Security headers**: `helmet` is applied in `configureApp`, **before** `enableCors()` — the `cors` package ends an OPTIONS preflight itself without calling `next()`, so anything registered after it never runs for that request; this was a real bug (`X-Powered-By` leaking on every preflight), found by curling the built Docker image, not by reading the code. Swagger UI's CSP exemption (`script-src 'self' 'unsafe-inline'`, since its bundled page has an inline init script) uses helmet's dash-case directive keys (`'script-src'`) — a camelCase override adds a second directive instead of replacing it, and helmet rejects the result outright.
- **CORS** is set in `configureApp` through `getCorsOptions()` (`src/cors.ts`). Allowed origins come from `CORS_ORIGINS` (comma-separated; dev default is the Vite origins; in production, without it, `env.ts` refuses to boot). Never `*`. `credentials: true` (the session is a cookie now) and `X-CSRF-Token` is in `allowedHeaders`; `Authorization` is not, since the Bearer bridge is gone. `Location` and `Retry-After` are exposed to the browser.
- **Rate limiting** (`@nestjs/throttler`, in-memory, per IP) is global now (`ThrottlerGuard` as an `APP_GUARD`, `DEFAULT_THROTTLE` 100/min/IP), with tighter overrides on `POST /auth/login` (5/min) and `POST /users` (3/min) via `@Throttle(...)` in `common/throttle.constants.ts` — don't also add `@UseGuards(ThrottlerGuard)` on a route now that the guard is global, that runs it twice per request and double-counts against the same limit (an actual bug this project hit once already). Excess requests get `429` with `Retry-After`; document `@ApiTooManyRequestsResponse` on any new limited route.
- **Behind a reverse proxy**, set `TRUST_PROXY` to the hop count (an integer, e.g. `1`) — `configureApp` turns that into Express's `trust proxy` setting. Never set it to `true`-equivalent/trust-everything: that trusts the whole `X-Forwarded-For` chain, letting any client spoof its own IP and bypass the rate limiter entirely, which is the opposite of what it's for.
- `app.enableShutdownHooks()` (`main.ts`) makes a real `SIGTERM`/`SIGINT` run every `OnModuleDestroy` hook (`PrismaService` disconnects cleanly) instead of the process dying with open connections — verified by timing `docker stop` against the built image (~0.6-0.7s, not the 10s default grace period).
- A shared throttler store (Redis) is still needed if there is more than one API instance — the in-memory store doesn't coordinate across processes.
- **Deploying the web app and the API on different registrable domains** (e.g. a static host for the SPA, a separate host for the API) turns the session cookie third-party, which `SameSite=Strict`/`Lax` both drop and `None` requires `Secure` for — and is being phased out by browsers regardless. Prefer deploying them same-site (the API behind the web origin at `/api` via a reverse proxy, or `api.example.com` + `app.example.com` sharing `COOKIE_DOMAIN=.example.com`) over reaching for the `COOKIE_SAMESITE=none`/`COOKIE_DOMAIN` escape hatch, which is a real but second-choice option.
- Run `pnpm audit` when adding auth-related dependencies. A new high-severity finding either gets fixed upstream or gets a narrow, documented override in `pnpm-workspace.yaml` (see the existing Prisma CLI and `source-map-js` ones) — never a relaxed `--audit-level`.

### Database: PostgreSQL + Prisma

- **PostgreSQL 18 in Docker**, defined in `docker-compose.yml` at the repo root. Data lives in the named volume `code-connect-pgdata`, so it survives `docker compose down`. `docker compose down -v` deletes it; only run that on purpose. The port is bound to `127.0.0.1` only. `docker/postgres/init/` runs only when the volume is created empty and creates the `codeconnect_test` database.
- **Prisma 7** (`prisma-client` generator, `@prisma/adapter-pg`). Chosen over Drizzle, TypeORM and MikroORM; the reasons are in `plan/PersistenciaDados.md`.
  - Schema: `apps/api/prisma/schema.prisma`. Models are PascalCase singular in code and mapped to snake_case plural tables/columns (`@@map("users")`, `@map("password_hash")`).
  - After changing the schema, run `pnpm db:migrate --name <change>` and commit the generated folder under `prisma/migrations/`. Never edit a migration that is already committed.
  - The client is generated into `apps/api/src/generated/prisma` (git-ignored, also ignored by oxlint and Prettier) by `postinstall` and `build`. Import it as `../generated/prisma/client.js`.
  - `pnpm-workspace.yaml` overrides `mysql2` and `deepmerge-ts` (transitive dependencies of the Prisma CLI that `prisma@7.10.0` pins at vulnerable versions; the API doesn't use either at runtime). Keep the overrides until a stable Prisma release bumps them, then remove them and re-run `pnpm audit`.
  - Keep `prisma` and `@prisma/client` on the same version. The npm `latest` tag of `prisma` may point at a prerelease, so add or upgrade with an explicit version.
- **Access**: inject `PrismaService` (`src/prisma/`, global module) into services only, never into controllers. Map Prisma errors to Nest exceptions in the service (unique violation `P2002` → `ConflictException`). Never return a Prisma record directly; wrap it in the response entity (`UserEntity`).
- **Minimize what a query fetches.** `PrismaService` sets a global `omit` for any sensitive column (today: `User.passwordHash`), so it never comes back unless a call site explicitly opts back in with its own `omit: { passwordHash: false }` (see `UsersService.findByEmail`, the one place that needs it to verify a login). A new sensitive column gets the same treatment, not a per-query `select` scattered across call sites that each have to remember to exclude it.
- **Raw SQL only as a tagged template** (`` prisma.$queryRaw`...` ``/`` prisma.$executeRaw`...` ``) or `Prisma.sql`, never string interpolation into `$queryRawUnsafe`/`$executeRawUnsafe`. The only raw SQL in the codebase today is `test/db.ts`'s `` prisma.$executeRaw`TRUNCATE TABLE users RESTART IDENTITY CASCADE` ``.
- **Soft deletes.** No resource has a `DELETE` route yet, so there's no `deletedAt` column yet either — when one does, prefer a `deletedAt` flag over a hard delete for anything a user might reasonably want undone, and filter it out of every read query (a Prisma `$extends` query middleware on `PrismaService`, not a per-call `where`, so a forgotten filter can't leak a "deleted" row).
- **Environment**: `apps/api/.env` holds `DATABASE_URL`, `TEST_DATABASE_URL` and the rest of what `env.ts` validates, for running the API outside a container. The root `.env` holds `POSTGRES_PASSWORD` for Docker Compose, plus `JWT_SECRET`/`CORS_ORIGINS`/`VITE_API_URL` — separate copies, only needed to run the containerized `api`/`web` services (`docker compose up api web`). Both are git-ignored; copy them from the `.env.example` files. `src/load-env.ts` loads `apps/api/.env` with `process.loadEnvFile()` and must stay the first import of `main.ts`.
- **Tests**: unit tests mock `PrismaService` (or the service that uses it) and need no database. E2E tests run against `TEST_DATABASE_URL`: `test/global-setup.ts` refuses to run if it equals `DATABASE_URL` and runs `prisma migrate deploy`, and `resetDatabase(app)` (`test/db.ts`) truncates the tables before each test. Test files run sequentially (`fileParallelism: false`).

### API documentation: Swagger (OpenAPI)

The Swagger setup is in `src/swagger.ts` (`setupSwagger`, called from `main.ts` and the e2e tests): UI at `/api/docs`, JSON at `/api/docs-json`. Every endpoint must be documented, and a change to an endpoint isn't done until its Swagger is updated.

- **No CLI plugin.** Vitest doesn't go through `nest build`, so document explicitly. Every DTO and entity field has `@ApiProperty({ example, description })`, with `minLength`/`maxLength`/`enum`/`format` when they apply, matching the `class-validator` rules.
- Each controller has `@ApiTags('<resource>')`. Each handler has `@ApiOperation({ summary })` (in pt-BR, short) and one response decorator for the success code (`@ApiOkResponse`, `@ApiCreatedResponse`, ...), with `type` set to a response class (arrays use `type: [X]`).
- Document every error the endpoint can return (`@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiConflictResponse`, `@ApiNotFoundResponse`, ...) with `type: ErrorResponseDto` (`common/dto/error-response.dto.ts`), which mirrors Nest's default error shape.
- Protected routes carry `@ApiCookieAuth('cookie')` (the session cookie) and, where relevant, `@ApiSecurity('csrf')` for the `X-CSRF-Token` header — both schemes are registered in `src/swagger.ts`. Public routes carry neither.
- Document inputs through DTO classes (`@Body`, `@Query`, `@Param`), not inline types, because only classes reach the OpenAPI document. Response types must be classes too.
- Swagger examples never contain real data or real secrets. Use obvious fakes (`maria@exemplo.com`, `senha-segura-123`).
- Each feature's e2e test asserts that its paths appear in `GET /api/docs-json` (see `test/auth.e2e-spec.ts`). `SWAGGER_ENABLED` (see `env.ts`) gates whether it's served at all — defaults off in production. No guard can do this instead: `SwaggerModule` registers its routes directly on the Express instance, bypassing Nest's router (and every `APP_GUARD`) entirely.

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
- API plans list the security cases a new endpoint needs, the same way web plans list accessibility cases: `401` with no session, `403` with a missing/mismatched CSRF pair on an unsafe method, and — for any route with a `:id` — an ownership case proving user A can't reach user B's resource (see "BOLA/IDOR" under Security above).

## PR validation

Four GitHub Actions workflows, with different path scopes — know which ones actually ran before trusting a green PR:

- `.github/workflows/ci.yml` — **no path filter, runs on every push/PR regardless of what changed.** Three jobs: `quality` (`pnpm lint`, `pnpm typecheck`, `pnpm test:api`, `pnpm test:web`, no database), `e2e-api` (a Postgres service container, then `pnpm test:api:e2e`), `e2e-web` (`pnpm test:web:a11y` against the production build). This is the deterministic gate; keep it passing before merging.
- `.github/workflows/security.yml` — **also no path filter.** Secret scanning (TruffleHog, full git history), SAST (Semgrep OSS — oxlint has no security plugin of its own), and `pnpm audit --audit-level=high`.
- `.github/workflows/lighthouse.yml` — scoped to `apps/web/**` (plus the lockfile and its own workflow file). Performance/a11y/SEO scores against the production build; see "Performance and SEO (Lighthouse)" above.
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
- `apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage, non-root (`USER node` / `USER nginx`) production images — see `docker-compose.yml`'s `api`/`web` services and "Commands" above. Both apps' workspace installs run `apps/api`'s own `postinstall` (`prisma generate`) regardless of which app is being built, so both Dockerfiles copy `apps/api/prisma` in before `pnpm install`, even the web one.
