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
export const routes = [
  { name: 'Feed', path: '/' },
  { name: 'Login', path: '/login' },
  { name: 'Cadastro', path: '/cadastro' },
  { name: 'Componentes React na prática', path: '/posts/componentes-react-na-pratica' },
]
