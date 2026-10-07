# Frontend Architecture (apps/web)

## Role: You are acting as a Senior Frontend Engineer. Adhere strictly to the following constraints.

`apps/web` is a React 19 + Vite 8 frontend, linted with oxlint. This file covers component structure (Atomic Design), the Axios API layer, and Tailwind CSS styling rules. See the root `CLAUDE.md` for commands and the full guideline index; see `security-standards.md` for frontend security rules and `frontend-ux-seo.md` for accessibility, performance, SEO, component testing and the related image/font handling.

## Atomic Design

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

## API layer: Axios (`src/api/`)

- `client.ts` is the only Axios instance. `baseURL` comes from `VITE_API_URL` (default `http://localhost:3000`, see `.env.example`). `withCredentials: true`, since the session is an httpOnly cookie (`access_token`), not something the client reads or stores — there is no `tokenStorage.ts`, and there must never be one again: don't put a JWT in `localStorage`/`sessionStorage`.
- Every unsafe method (anything but GET/HEAD/OPTIONS) needs `X-CSRF-Token` set to the (non-HttpOnly) `csrf_token` cookie's value — see the API's `CsrfGuard`. A request interceptor does this, bootstrapping a token via `GET /auth/csrf` first if none is set (`src/api/csrf.ts`, memoized so concurrent callers share one bootstrap request); a response interceptor retries a `403` exactly once after refetching the token, using a flag stamped on the request config (not a `WeakSet` keyed by object identity — axios's `mergeConfig` builds a new config object on every retry, so identity-based tracking never recognizes a retried request and loops forever; this is not hypothetical, it happened while writing the test for it).
- One file per resource (`auth.ts`, `users.ts`) with typed functions that return `response.data`. Types in `types.ts` mirror the Swagger document.
- Pages turn failures into messages with `getErrorMessage` (`errors.ts`, pt-BR, by status; `429` reads `Retry-After`) and show them with `FormError`. Don't show the API's own messages.
- Private pages (`/perfil`) have no readable token to gate on synchronously anymore: they render an optimistic loading state, call `GET /auth/me`, and redirect to `/login` only on a `401`. They are not added to `e2e/routes.ts`; they get their own browser suite (`e2e/profile.e2e.ts`) with a fake API through `page.route`, seeding the session (where needed) via `browserContext.addCookies()` — the only way to write an `httpOnly` cookie from Playwright, since `page.addInitScript` + storage can no longer reach it.

## Styling: Tailwind CSS

- Style with Tailwind utility classes in JSX. Don't add new `.css` files or CSS modules per component; `src/index.css` only holds the Tailwind import and global base styles.
- Put design tokens (colors, fonts, spacing) in the Tailwind theme, not as hard-coded values scattered through components.
- **No arbitrary values in classes.** Don't write `w-[407px]`, `text-[15px]`, `bg-[#81FE88]` or similar. Map every value from the design to a token:
  - **Sizes** (width, height, spacing, max-width, inset, radius): use the nearest step of Tailwind's scale instead of the exact pixel value. The spacing scale is 4px per step (`w-102` = 408px, `size-4.5` = 18px), container sizes cover large widths (`max-w-sm` = 384px, `max-w-2xl` = 672px, `max-w-5xl` = 1024px), fractions cover percentages (`left-1/12`, `w-1/4`) and ratios use the native syntax (`aspect-4/5`). A difference of a few pixels from the Figma value is acceptable.
  - **Colors**: only project palette names (`bg-surface`, `text-primary`, `text-danger`). Never hex values in classes, and never Tailwind's default colors (`red-400`, `gray-500`) directly. For a new color, extend the palette with a `--color-<name>` token in the `@theme` block of `src/index.css` (it can point at a default color, e.g. `--color-danger: var(--color-red-400)`). Name tokens by role (`danger`, `surface`), not by hue.
  - **Typography**: Figma style-guide sizes live as `--text-*` tokens (`text-subtitle`, `text-paragraph-sm`, `text-label`); use them or the default scale (`text-lg`).
  - **Anything else** with no token (for example an `object-position`): add a named utility with `@utility` in `src/index.css`.
  - Composing an image from several Figma SVG parts: place them with coordinates inside one `<svg viewBox>` (`<image x y width height>`) instead of percentage `inset-[...]` classes.
- Component variants (size, color, state) are driven by props that map to class sets. Don't make the caller pass raw class strings for that.
- **Use `class-variance-authority` (CVA) to define those class sets** once a component has a variant prop (size, color, state) or a boolean that toggles classes. Call `cva()` at module scope, outside the component function, with the base (always-on) classes as the first argument and a `variants` object as the second; set `defaultVariants` instead of defaulting props in the function signature. Derive the component's variant props with `VariantProps<typeof theComponentCva>` instead of hand-writing a prop type and a parallel `Record<Variant, string>` lookup:
  ```tsx
  const button = cva('inline-flex items-center rounded-lg px-4 py-3 transition', {
    variants: {
      variant: { primary: 'bg-primary text-ink', secondary: 'bg-surface text-offwhite' },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', fullWidth: false },
  })

  export type ButtonProps = VariantProps<typeof button> & { ... }

  export function Button({ variant, fullWidth, ...props }: ButtonProps) {
    return <button className={button({ variant, fullWidth })} {...props} />
  }
  ```
  A component with no variants (a single, fixed class string) stays a plain template literal — don't introduce `cva()` for it. Multi-word boolean variant names (e.g. `fullWidth`) and numeric variant keys (e.g. `level: 1 | 2` on `Heading`) both work as plain object keys in `cva()`. This project doesn't use a `cn()`/`clsx` merge helper: components that take CVA variants `Omit` or simply don't expose `className`, so there's never an incoming class string to merge with the generated one.
  - **A new look for an existing component is a new key in its existing `variants` object, not a new conditional elsewhere.** When `Button` needed a secondary look for icon-led controls (like, logout), the fix was adding `ghost` next to `primary` inside its one `cva()` call (`atoms/Button/Button.tsx`), so every consumer keeps picking a `variant` instead of some callers getting a raw class string.
  - **CVA is for picking a class set, not for branching markup or props.** When two states of a component need different DOM, different handlers, or different required props — not just different classes — model that as a discriminated union on the props type and an early `if`/return, the same way you'd structure any other conditional component; don't stretch `cva()` to cover it. `LikeButton` (`molecules/LikeButton/LikeButton.tsx`) renders a `TextLink` to `/login` when `authenticated: false` and a `Button` with `onToggle`/`liked` when `authenticated: true` — two different components with different props, decided with a type guard, not a variant. `SessionLink` follows the same shape for signed-in vs signed-out.
  - A molecule that wraps a CVA atom still derives the atom's variant from domain state instead of asking its own caller to pass it: `FormField` and `TextareaField` both `Omit<AtomProps, 'id' | 'invalid'>` and pass `invalid={Boolean(error)}` to `Input`/`Textarea` themselves.
- Setup: Tailwind v4 via the `@tailwindcss/vite` plugin in `vite.config.ts`. There is no `tailwind.config.js`; v4 is configured in CSS, so theme tokens go in an `@theme` block in `src/index.css`. The VS Code extension `bradlc.vscode-tailwindcss` is recommended in `.vscode/extensions.json`.
