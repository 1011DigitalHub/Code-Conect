// Every public route of the app. The browser suites (a11y, seo) and Lighthouse
// CI (lighthouserc.cjs) all read this list, so it is the single source of truth.
//
// `name` has to match the start of the page's real <title> (see the WCAG 2.4.2
// check in a11y.e2e.ts). For the post route that means the seeded post's title:
// the suites run against a migrated and seeded database, and the slug below is
// the first fixture in prisma/seed.ts.
//
// /posts/novo and /perfil are absent on purpose: both redirect an anonymous
// visitor to /login, so they are private and get their own suites.
// /vincular-conta is absent for a different reason: it's Disallow'd in
// robots.txt (a transient flow step, not indexable content — see
// plan/LoginSocial.md), and Lighthouse's SEO audit scores a route listed
// here *and* blocked by robots.txt as a failure — that's what excluding it
// here avoids, not a lack of a11y coverage (LinkAccountPage.test.tsx
// already runs expectNoA11yViolations at the component level).
export const routes = [
  { name: 'Feed', path: '/' },
  { name: 'Login', path: '/login' },
  { name: 'Cadastro', path: '/cadastro' },
  { name: 'Componentes React na prática', path: '/posts/componentes-react-na-pratica' },
  // The catch-all route. Any unmatched path renders it, and the SPA serves it
  // with HTTP 200 (try_files falls back to index.html), so the Lighthouse
  // "successful HTTP status code" audit still passes.
  { name: 'Página não encontrada', path: '/essa-rota-nao-existe' },
]
