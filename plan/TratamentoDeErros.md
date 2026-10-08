# Plano: Tratamento de Erros — 404 e Error Boundary (apps/web)

## Contexto

Duas lacunas que existiam desde o início do projeto, mas que o merge do feed (PR #4) promoveu a bloqueantes:

1. **Nenhuma rota `path="*"`.** `src/App.tsx` tem 6 rotas (`/`, `/login`, `/cadastro`, `/perfil`, `/posts/novo`, `/posts/:slug`) e nenhuma de fallback. Um endereço que não casa com nenhuma delas — um link antigo, um typo em rota estática — renderiza uma **tela em branco**, sem título, sem explicação e sem caminho de volta.

   **Não** é o caso de um slug de post inexistente: `/posts/<qualquer-coisa>` casa com `/posts/:slug` e nunca chega ao catch-all; quem trata é a própria `PostPage`, pelo estado `notFound` de `usePostDetail`. Esta correção foi apontada na revisão da PR #14 — a versão anterior deste plano e três comentários de código afirmavam o contrário.

2. **Nenhum error boundary.** O `TextLink` (`atoms/TextLink/TextLink.tsx`) passou a **lançar** quando recebe um `href` que não começa com `/`, guarda adicionada no plano Secure by Design para fechar o vetor de `javascript:` URL. O feed é o primeiro consumidor que monta hrefs a partir de dados da API (`/posts/${post.slug}`), e `Pagination`/`LikeButton` recebem `href`/`buildHref` injetados pelo chamador. Sem boundary, uma exceção de render em qualquer ponto da árvore desmonta o app inteiro e deixa a mesma tela em branco — o oposto de falhar alto de forma útil.

Os dois casos terminam no mesmo sintoma (tela branca) por motivos diferentes: rota não casada e exceção de render. Este plano cobre os dois.

## 1. `NotFoundPage` (`src/pages/NotFoundPage/`)

Arquivos: `NotFoundPage.tsx`, `NotFoundPage.test.tsx`, `index.ts`.

- Reaproveita `CenteredTemplate` (`components/templates/CenteredTemplate`), o mesmo layout de `/perfil`: já renderiza o `<h1>` pelo atom `Heading` a partir da prop `title`, então não há heading duplicado.
- `usePageMeta('Página não encontrada', '<descrição pt-BR de 50 a 160 caracteres>')` — define `document.title` como `Página não encontrada | Code Connect` e a meta description própria da página.
- Conteúdo: texto curto explicando que o endereço não existe e um `TextLink href="/"` de volta ao feed. Aqui o `TextLink` é apropriado: é navegação normal, com literal hardcoded.
- `App.tsx`: `<Route path="*" element={<NotFoundPage />} />` como **última** rota.

### Rota na tabela de auditoria

`e2e/routes.ts` recebe `{ name: 'Página não encontrada', path: '/essa-rota-nao-existe' }`.

O `name` precisa casar com o começo do `<title>` real: `a11y.e2e.ts` monta a asserção de WCAG 2.4.2 como `new RegExp('^' + route.name + '\\b.*Code Connect')`. A mesma lista dirige `seo.e2e.ts` (descrição única de 50–160 caracteres) e o Lighthouse CI (`lighthouserc.cjs`).

**Limitação conhecida, deliberada:** a SPA serve esta página com **HTTP 200**, não 404 — tanto no `vite preview` quanto no nginx de produção (`try_files $uri $uri/ /index.html` em `apps/web/default.conf.template`). É o comportamento normal de uma single-page app e mantém verde a auditoria "Page has successful HTTP status code" do Lighthouse. Um 404 de verdade exigiria o servidor conhecer as rotas do React Router; não vale essa duplicação agora.

**Trade-off aceito (soft 404):** como a resposta é 200 e a página não tem `noindex`, um buscador pode em teoria indexar um endereço inexistente como conteúdo. Não adicionamos `noindex` de propósito: ele derruba a auditoria `is-crawlable` do Lighthouse nessa rota, e o `lighthouserc.cjs` exige **SEO 100** em todas. Entre um risco teórico de indexação e furar um gate que protege todas as páginas reais, fica o primeiro. Revisitar se o site passar a ser indexado de verdade e isso aparecer no Search Console.

`public/llms.txt` **não** muda: a 404 não é página de conteúdo para indexar. `public/robots.txt` também não — não há o que bloquear.

## 2. `ErrorBoundary` (`src/components/organisms/ErrorBoundary/`)

Arquivos: `ErrorBoundary.tsx`, `ErrorBoundary.test.tsx`, `index.ts`.

- Nível **organism**: mantém estado local e renderiza uma seção autossuficiente da UI, importando apenas de níveis iguais ou inferiores — o que a regra de Atomic Design do `CLAUDE.md` permite.
- Precisa ser **class component** (`getDerivedStateFromError` + `componentDidCatch`). React 19 não tem equivalente em hook, e não vale uma dependência nova (`react-error-boundary`) por um componente de ~40 linhas.
- Montado em `App.tsx` **dentro** do `BrowserRouter`, envolvendo `<Routes>`.

### O fallback usa HTML nativo, não os átomos do projeto

Decisão explícita: o fallback é montado com `<h1>`, `<p>` e `<a href="/">` estilizados direto com classes Tailwind, **sem importar `Heading` nem `TextLink`**.

O motivo é que uma rede de segurança não pode depender do que ela protege. Se o próprio design system quebrar — e o gatilho mais provável de um boundary neste projeto é justamente o `throw` do `TextLink` —, um fallback construído com esses mesmos átomos falharia em cascata, e o React descarta um boundary que lança durante o próprio fallback. HTML nativo não tem como falhar assim.

Isso é uma exceção consciente à convenção de "componha a partir dos átomos", e vai comentada no arquivo para não parecer descuido.

Efeito colateral desejável: `<a href="/">` provoca navegação de página real em vez do roteamento client-side do `TextLink`, o que **remonta a aplicação do zero** e descarta o estado React corrompido que causou o erro. Um `<Link>` manteria a mesma árvore montada.

As classes seguem as mesmas regras de sempre: só tokens da paleta (`bg-surface` e `border-page` no card, `text-offwhite`, `text-muted`, `text-primary` no texto), nenhum valor arbitrário, e o foco visível (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`) que todo elemento interativo precisa ter.

O nome do site aparece inline no `document.title` do fallback em vez de vir do `SITE_NAME` de `pages/usePageMeta.ts`: um organism importando de `src/pages/` inverteria a hierarquia do Atomic Design, e a mesma lógica de não depender do que se protege vale aqui.

### Reset em navegação client-side

O boundary recebe uma prop `resetKey` e limpa o erro quando ela muda; `App.tsx` passa o `pathname` atual. Sem isso, o estado `failed` sobrevive a uma navegação client-side — o Voltar do navegador troca a URL sem remontar nada, e o fallback ficaria na tela sob um endereço sem relação com ele. Foi um bug encontrado na revisão da PR #14.

Preferido a `<ErrorBoundary key={pathname}>`: o `key` é o idioma documentado do React e seria mais curto, mas remonta todo o subtree `<Routes>` a cada navegação, o que refaria o fetch do feed sempre que alguém voltasse para `/`.

## 3. Testes essenciais (por role, label ou texto)

### `NotFoundPage.test.tsx`
- renderiza o `h1` "Página não encontrada";
- oferece um link para o feed (`/`);
- define o título e a meta description da página;
- `has no WCAG 2.2 AA violations`.

### `ErrorBoundary.test.tsx`
- renderiza os filhos normalmente quando nada lança;
- mostra o fallback quando um filho lança durante o render;
- o fallback oferece o link de volta para `/`;
- `has no WCAG 2.2 AA violations` (no estado de fallback, que é o que importa auditar).

**Sobre silenciar o `console.error`:** o React emite o erro capturado no console mesmo com o boundary funcionando, então o teste precisa de `vi.spyOn(console, 'error')`. O mock vai em `beforeEach` com `mockRestore()` em `afterEach`, nunca aplicado de forma solta no corpo do arquivo — um spy que vaza silencia erros legítimos dos outros testes da suíte e esconde regressões reais.

Todo arquivo de teste de componente leva o caso axe com `expectNoA11yViolations(container)` de `src/test/axe.ts`.

## 4. Commits (Conventional Commits)

- `feat(web): render a not found page for unmatched routes` — página, teste, `path="*"` e a entrada em `e2e/routes.ts`
- `feat(web): catch render errors at the root with an error boundary` — componente, teste e a montagem em `App.tsx`
- `docs(root): add the error handling plan` — este arquivo

## Verificação

```bash
pnpm typecheck
pnpm lint            # type-aware; depois do typecheck, que ele precisa dos tipos compilando
pnpm test:web
pnpm test:web:a11y   # inclui a rota nova nos 3 viewports (1440, 768, 320)
pnpm build
```

Não precisa de `pnpm test:api` nem `test:api:e2e`: esta fase não toca `apps/api`.

Manuais obrigatórios do `CLAUDE.md`, na rota nova:
- usar a página só com o teclado;
- testar com leitor de tela (NVDA no Windows);
- conferir em zoom de 200%.

### Lighthouse (build de produção, preset desktop)

Medido pelo Lighthouse CI na PR #14 (run `37713794113`), mediana de 3 execuções por rota. O CLI local trava nesta máquina, então o CI é a fonte oficial — como o próprio `CLAUDE.md` determina.

| Rota | Performance | Acessibilidade | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/essa-rota-nao-existe` | 100 | 100 | 100 | 100 | 0,44 s | 0,003 | 0 ms |

As demais rotas na mesma execução, para contexto — nenhuma regrediu com a entrada do boundary na árvore:

| Rota | Performance | Acessibilidade | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` (feed) | 100 | 100 | 100 | 100 | 0,65 s | 0,007 | 0 ms |
| `/login` | 100 | 100 | 100 | 100 | 0,61 s | 0,000 | 0 ms |
| `/cadastro` | 100 | 100 | 100 | 100 | 0,60 s | 0,000 | 0 ms |
| `/posts/componentes-react-na-pratica` | 100 | 100 | 100 | 100 | 0,69 s | 0,002 | 0 ms |
