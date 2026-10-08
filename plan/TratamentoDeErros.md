# Plano: Tratamento de Erros — 404 e Error Boundary (apps/web)

## Contexto

Duas lacunas que existiam desde o início do projeto, mas que o merge do feed (PR #4) promoveu a bloqueantes:

1. **Nenhuma rota `path="*"`.** `src/App.tsx` tem 6 rotas (`/`, `/login`, `/cadastro`, `/perfil`, `/posts/novo`, `/posts/:slug`) e nenhuma de fallback. Uma URL desconhecida — ou um slug de post que não existe — renderiza uma **tela em branco**, sem título, sem explicação e sem caminho de volta. Com a rota paramétrica `/posts/:slug` isso deixou de ser hipotético: basta um link antigo ou um typo.

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

As classes seguem as mesmas regras de sempre: só tokens da paleta (`bg-page`, `text-offwhite`, `text-primary`), nenhum valor arbitrário, e o foco visível (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`) que todo elemento interativo precisa ter.

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

A preencher na implementação, medido conforme as regras de "Performance and SEO" do `CLAUDE.md`:

| Rota | Performance | Acessibilidade | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/essa-rota-nao-existe` | | | | | | | |
