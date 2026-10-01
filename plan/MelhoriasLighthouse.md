# Plano: Melhorias apontadas pelo Lighthouse (apps/web)

> Plano aprovado em 2026-10-01. Pedido adicional na aprovação: registrar no `CLAUDE.md` as boas práticas do Lighthouse para todas as páginas (passo 7).

> **Atualização (2026-10-01), ajustes durante a implementação:**
> - **Banners:** o WebP com q75 ficou com 55 KB no login e 42 KB no cadastro (antes, 1,29 MB e 1,41 MB), sem perda visível.
> - **`Group 2086.png`:** em vez de apagar, o arquivo foi para `plan/assets/`, porque é o mockup citado em `PaginaLogin.md`. Ele sai do build e continua disponível como referência.
> - **Fonte:** só os pesos 400 e 600 são importados. O 500 não é usado em nenhum componente (o código só tem `font-normal` e `font-semibold`). Com o `unicode-range`, o navegador baixa só o subconjunto latino (~18 KB por peso).
> - **Rotas dos testes de navegador:** a lista saiu do `e2e/a11y.e2e.ts` e foi para `e2e/routes.ts`, compartilhada pelas suítes `a11y` e `seo`.
> - **Teste de SEO:** está no novo `e2e/seo.e2e.ts`. Ele confere uma única meta description com 50 a 160 caracteres por rota, e que `/robots.txt` e `/llms.txt` respondem como `text/plain`. Sem o `robots.txt`, o teste falha como esperado (recebe `text/html`).
> - **JS do build de produção:** 267 KB (85 KB com gzip), contra 6,7 MB no servidor de dev. Isso confirma que os alertas de minificação e de JS sem uso eram ruído do `vite dev`.
> - **Nova medição:** o Lighthouse CLI com o Chromium do Playwright trava ao navegar neste ambiente, o mesmo problema dos testes de navegador. Por isso a tabela "depois" fica para ser preenchida com o Chrome, numa janela anônima, sobre o `vite preview` (ver "Verificação").

## Contexto
Rodamos o Lighthouse 13.4 (desktop) em `/login` e `/cadastro` no dia 2026-10-01:

| Categoria | Login | Cadastro |
|---|---|---|
| Performance | 61 | 60 |
| Acessibilidade | 100 | 100 |
| Boas práticas | 100 | 100 |
| SEO | 83 | 83 |
| Agentic browsing | 2/3 | 2/3 |

A nota de acessibilidade confirma o trabalho de WCAG que já fizemos. Antes de corrigir qualquer coisa, é preciso separar o que é problema real do que é ruído da forma como a medição foi feita.

**Ruído da medição (não vamos corrigir no código):**
- **Servidor de desenvolvimento.** As páginas vieram do `vite dev` em `localhost:5173`, sem minificação e com o React de desenvolvimento (`react-dom_client.js` tem 3 MB e `react-router.js` tem 1,6 MB). Daí saem os alertas "Minify JavaScript" (4 MB), "Reduce unused JavaScript" (1 MB), "Duplicated JavaScript" e "Total byte weight" (6,7 MB). Também é por isso que FCP fica em 2,7–2,8 s e LCP em 5–6 s na simulação.
- **Extensão LastPass.** O próprio Lighthouse avisa que extensões afetaram o resultado. A LastPass gerou a tarefa longa de cerca de 400 ms, o TBT de 80 ms no cadastro e a falha de bfcache (`EmbedderExtensionFrame`).
- **Cabeçalhos de segurança** (CSP, HSTS, COOP, X-Frame-Options, Trusted Types). Esses itens são informativos, não tiram nota, e são configurados na hospedagem. Ficam anotados para quando houver deploy.

**Problemas reais (entram neste plano):**
1. **Banners pesados.** `Banner_login_page.png` tem 1,29 MB e `Banner_cadastro_page.png` tem 1,41 MB, ambos com 1344×896. O banner é o elemento de LCP das duas páginas, e a economia estimada é de cerca de 1,2 MB em cada um.
2. **A requisição do LCP é descoberta tarde.** A imagem não tem `fetchpriority="high"` e só aparece depois que o React monta a página. Do atraso do LCP, cerca de 470–520 ms são "resource load delay" e cerca de 460 ms são "render delay".
3. **Google Fonts bloqueia a renderização.** O CSS de `fonts.googleapis.com` atrasa o primeiro desenho em cerca de 290 ms no login e 120 ms no cadastro, e a página depende de dois domínios externos.
4. **SEO: falta `<meta name="description">`.**
5. **SEO e agentic: `robots.txt` e `llms.txt` "inválidos".** Esses arquivos não existem, então o fallback de SPA do Vite devolve o `index.html` no lugar deles. São 24 erros de sintaxe no robots.txt.

## Passos

### 1. Banners em WebP (problema 1)
- Converter os dois banners para WebP com qualidade ~75, mantendo 1344×896. A largura máxima na tela é de 408px (`lg:w-102`), mas no celular o corte `aspect-4/5` com `object-cover` usa a altura inteira, então reduzir a imagem não compensa.
- A conversão é feita uma única vez, sem adicionar dependência: `pnpm dlx sharp-cli`. Os `.webp` vão para `apps/web/public/`, e os PNGs saem.
- Atualizar `bannerSrc` em `src/pages/LoginPage/LoginPage.tsx`, `src/pages/SignUpPage/SignUpPage.tsx` e nos testes que conferem o caminho (`AuthTemplate.test.tsx`, `SignUpPage.test.tsx` e, se houver, `LoginPage.test.tsx`).
- Remover `public/Group 2086.png` (389 KB). Nenhum arquivo do código o usa, mas ele entra no build.

### 2. Prioridade da imagem do LCP (problema 2)
- No `<img>` de `src/components/templates/AuthTemplate/AuthTemplate.tsx`, adicionar:
  - `fetchPriority="high"`, para o navegador buscar o banner antes das outras imagens;
  - `decoding="async"`;
  - `width={1344} height={896}`, as dimensões intrínsecas, que ajudam o cálculo de layout. As classes `size-full object-cover` continuam controlando o tamanho na tela.
- Não vamos pré-carregar a imagem no `index.html`, porque cada rota usa um banner diferente. O atraso que sobra vem da SPA (o HTML não tem a imagem) e só some com pré-renderização, o que fica fora do escopo.

### 3. Fonte hospedada no próprio projeto (problema 3)
- Adicionar a dependência `@fontsource/prompt` e importar os pesos 400, 500 e 600 no `src/main.tsx` (por exemplo, `import '@fontsource/prompt/400.css'`). O Vite empacota os arquivos `.woff2` com `font-display: swap`.
- Tirar do `index.html` os dois `preconnect` e o `<link>` do Google Fonts.
- O `--font-sans: "Prompt", sans-serif` em `src/index.css` continua igual.
- Com isso, o pedido de CSS externo que bloqueava a renderização deixa de existir, e a página não depende mais de terceiros.

### 4. Meta description (problema 4)
- Colocar no `index.html` uma descrição padrão do site.
- Generalizar `src/pages/usePageTitle.ts` para `usePageMeta(page, description)`, que define o título e atualiza a `meta[name="description"]`. As duas páginas passam a enviar uma descrição própria.
- Estender `usePageTitle.test.ts`, renomeado para `usePageMeta.test.ts`, para conferir também a descrição. Os testes das páginas conferem a descrição de cada uma.
- No CLAUDE.md, trocar a regra do `usePageTitle` por `usePageMeta`.

### 5. robots.txt e llms.txt (problema 5)
- `public/robots.txt`: `User-agent: *` / `Allow: /`.
- `public/llms.txt`: um `# Code Connect`, um resumo curto e links para `/login` e `/cadastro`.

### 6. Medição reproduzível
- Registrar no plano como medir:
  - rodar sobre o build de produção (`pnpm web build && pnpm web exec vite preview --host 127.0.0.1 --port 5174`);
  - usar uma janela anônima, sem extensões.
- Guardar os números de antes (os desta auditoria) e de depois numa tabela no plano.

### 7. CLAUDE.md: seção "Performance and SEO (Lighthouse)" para todas as páginas
Criar a seção logo depois de "Accessibility: WCAG 2.2 level AA", no mesmo tom de regras curtas.

**Metas**
- Em toda rota nova, o Lighthouse desktop deve dar 100 em Accessibility, Best Practices e SEO, e pelo menos 90 em Performance.
- Core Web Vitals:
  - LCP ≤ 2,5 s;
  - CLS ≤ 0,1;
  - TBT ≤ 200 ms.

**Como medir**
- Rodar sempre no build de produção (`vite preview`), nunca no `vite dev`.
- Usar uma janela anônima, sem extensões.
- Registrar o resultado no plano da feature.

**Imagens**
- Usar WebP ou AVIF, sem PNG ou JPG pesados para fotos.
- Cada imagem com no máximo ~200 KB, nas dimensões que a tela realmente usa.
- Sempre informar `width` e `height`.
- A imagem do LCP (em geral o banner ou hero) leva `fetchPriority="high"` e nunca `loading="lazy"`.
- Imagens abaixo da dobra levam `loading="lazy"`.
- Não deixar arquivos sem uso em `public/`.

**Fontes**
- Hospedar as fontes no projeto (`@fontsource/*`), importadas no `main.tsx`, só com os pesos usados.
- Não usar CSS de fontes de terceiros, porque ele bloqueia a renderização.

**JavaScript**
- Não adicionar scripts ou CSS que bloqueiem a renderização no `index.html`.
- Antes de adicionar uma dependência pesada, verificar o tamanho dela.
- Rotas novas e pesadas são carregadas com `React.lazy` e `Suspense`, quando o bundle crescer.
- Evitar tarefas longas (mais de 50 ms) no carregamento.

**Layout**
- Nenhum deslocamento de layout. Reservar espaço para imagens, embeds e conteúdo que chega depois de carregar (`aspect-*`, `width`/`height`).

**SEO**
- Toda página chama `usePageMeta(título, descrição)`. A descrição é única, tem de 50 a 160 caracteres e está em pt-BR.
- Manter um só `h1` por página, com a hierarquia de títulos sem pular níveis.
- Links com texto descritivo, `<a href>` rastreável e `lang="pt-BR"` no `<html>`.
- `public/robots.txt` e `public/llms.txt` existem e são atualizados quando uma rota pública é criada. O `llms.txt` tem um H1 e links para as rotas.

**Boas práticas**
- Nenhum erro no console.
- Não pedir permissões (localização, notificações) no carregamento.
- Os cabeçalhos de segurança (CSP, HSTS, COOP, X-Frame-Options) ficam como requisito do deploy.

**Plans:** a seção de verificação de cada plano de página inclui a tabela do Lighthouse, com a nota de cada categoria e LCP, CLS e TBT.

## Testes
- Atualizar os testes que conferem o `src` do banner.
- Adicionar ao teste do `AuthTemplate` uma verificação de que o `<img>` tem `fetchpriority="high"`.
- Fazer o novo teste do `usePageMeta` cobrir o título e a descrição.
- Adicionar ao `e2e/a11y.e2e.ts` (ou a um novo `e2e/seo.e2e.ts`) uma verificação, por rota, de que a `meta description` não está vazia, e de que `/robots.txt` e `/llms.txt` respondem como `text/plain`, não como HTML.

## Commits (Conventional Commits)
1. `perf(web): serve auth banners as webp` (imagens, `bannerSrc`, testes, remoção do PNG sem uso)
2. `perf(web): prioritize the auth banner fetch` (`AuthTemplate` + teste)
3. `perf(web): self-host the prompt font` (dependência, `main.tsx`, `index.html`)
4. `feat(web): add page meta descriptions` (`usePageMeta`, páginas, testes, `index.html`)
5. `feat(web): add robots.txt and llms.txt` (+ teste e2e)
6. `docs(root): add lighthouse performance and seo standards` (seção nova no CLAUDE.md, regra do `usePageMeta`, este plano em `plan/MelhoriasLighthouse.md`)

## Verificação
- `pnpm test:web`, `pnpm lint` e `pnpm build` passam.
- `pnpm test:web:a11y` continua passando. Pelos travamentos conhecidos, rodar um teste por vez se for preciso.
- No `dist/`, os banners `.webp` devem ter menos de 200 KB cada, e nenhum `.png` grande deve aparecer.
- Rodar o Lighthouse de novo, sobre o `vite preview`, numa janela anônima, nas duas rotas. Esperado:
  - acessibilidade e boas práticas continuam em 100;
  - SEO chega a 100;
  - agentic chega a 3/3;
  - "Improve image delivery" e "Render-blocking requests" deixam de aparecer;
  - performance fica bem acima de 60.

### Resultado (preencher após medir no Chrome)
| Categoria / métrica | Login antes | Login depois | Cadastro antes | Cadastro depois |
|---|---|---|---|---|
| Performance | 61 | | 60 | |
| Acessibilidade | 100 | | 100 | |
| Boas práticas | 100 | | 100 | |
| SEO | 83 | | 83 | |
| Agentic browsing | 2/3 | | 2/3 | |
| LCP | 5,0 s* | | 6,1 s* | |
| CLS | 0 | | 0 | |
| TBT | 0 ms | | 80 ms* | |

\* Medido no `vite dev`, com extensão ativa.

> **Atualização (2026-10-01), Lighthouse no GitHub Actions:** a medição passou a rodar no CI, já que o Lighthouse CLI trava nesta máquina Windows. O workflow `.github/workflows/lighthouse.yml` (pnpm 12, Node 22) gera o build, serve com `vite preview` e roda o `@lhci/cli` 0.15.1 nas rotas de `e2e/routes.ts`: três execuções por rota, com preset desktop. O `apps/web/lighthouserc.cjs` reprova o job se alguma meta do CLAUDE.md não for atingida. O resumo do job mostra a tabela (gerada por `apps/web/lighthouse-summary.mjs`), e os relatórios ficam no artefato `lighthouse-reports`. O LHCI usa o Lighthouse 12, que não tem a categoria Agentic Browsing; o `e2e/seo.e2e.ts` cobre o `llms.txt`. A tabela acima pode ser preenchida com o resultado do primeiro run no CI.
