# Frontend UX, Accessibility & SEO (apps/web)

## Role: You are acting as a Senior Frontend Engineer specialized in Accessibility, Performance and SEO. Adhere strictly to the following constraints.

This file covers component testing conventions, WCAG 2.2 AA accessibility, and Lighthouse-measured performance/SEO (including image and font handling) for `apps/web`. See the root `CLAUDE.md` for commands and the full guideline index; see `frontend-architecture.md` for Atomic Design, the Axios API layer and Tailwind styling.

## Component tests

- **Every component needs a test** covering its essential use: it renders with the required props, and its main interaction or behavior works (click calls the callback, input updates, conditional content shows). Don't create a component without its `*.test.tsx`.
- Test through what the user sees (roles, labels, text), not implementation details or Tailwind classes.
- Every component test file also has a `has no WCAG 2.2 AA violations` case that renders the component and calls `expectNoA11yViolations(container)` from `src/test/axe.ts` (see Accessibility below).
- The web app uses Vitest with `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom` (configured in `vite.config.ts`, setup file `src/test/setup.ts`, `globals: true`). Run with `pnpm test:web` or `pnpm web test:watch`.

## Accessibility: WCAG 2.2 level AA

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

## Performance and SEO (Lighthouse)

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
- Record the scores and LCP/CLS/TBT in the page's plan (see Execution plans in `development-workflow.md`).

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
- Security headers (CSP, HSTS, COOP, X-Content-Type-Options, Referrer-Policy) are set in `vite.config.ts`'s `preview.headers` and mirrored in the production nginx config — see `security-standards.md`. Lighthouse's Best Practices score does **not** catch a missing or broken CSP (the CSP-XSS audit is informational, not scored); `e2e/security.e2e.ts` is the real check for these.
