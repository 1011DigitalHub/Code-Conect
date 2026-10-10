# Plano: isolar falhas de slug no feed (issue #18)

## Contexto

Na revisão da PR #17 (fix do open redirect no `TextLink`, issue #15), a revisão de
IA apontou um problema fora do escopo daquele fix: o guard do `TextLink` faz
`throw` durante o render. Hoje isso só pode ser disparado por um slug de post que
não seja um caminho seguro começando por `/` e same-origin. Como o `slug` vem da
API e o `ErrorBoundary` mais próximo de um card do feed é o de nível de página
(`App.tsx`), um slug malformado em **um** post derrubaria a renderização do feed
**inteiro**, não só daquele card.

O risco é baixo hoje — todo slug é gerado no servidor por `slugify()`
(`apps/api/src/posts/slug.ts`), nunca aceito do cliente — mas é a única barreira,
e cobre três cenários diferentes:
1. Um bug futuro em `slugify()`/`uniqueSlug()`.
2. Dado legado que não passou pela versão atual da função (migração futura,
   import direto no banco).
3. Qualquer outro throw inesperado dentro de um card, não necessariamente ligado
   a slug.

Pedido do usuário (issue #18): defesa em profundidade nas duas pontas — hardening
na API (rejeitar na origem, com `class-validator`) e isolamento de impacto no
front (um card quebrado não derruba os outros).

## Descoberta importante que mudou a tradução literal do pedido

O pedido original presumia um `CreatePostDto` com campo `slug` validável por
`@Matches` do jeito que já existe para `thumbnailUrl`
(`apps/api/src/posts/dto/create-post.dto.ts:51`). Isso não existe: **o slug nunca
é input do cliente** — `CreatePostDto` só tem `title`/`excerpt`/`content`/
`thumbnailUrl`; o slug é inteiramente derivado do `title` por `slugify()` dentro
de `posts.service.ts`. Então "rejeitar na borda da API" não pode ser um
`@Matches` num campo de request body que não existe.

A tradução fiel da intenção (fechar o problema o mais cedo possível, com
`class-validator`, falhando alto) é: validar o **slug já gerado**, no único
lugar em que ele nasce — `PostsService.create()`, logo depois de
`uniqueSlug()` e antes de `prisma.post.create()` — usando a função standalone
`matches()` do `class-validator` (confirmado que `class-validator@0.15.1`, a
versão instalada, exporta `matches(value, pattern)` além dos decorators). Isso
cobre o cenário 1 (bug futuro em `slugify`) na origem, sem tocar o
`GET /posts`/`GET /posts/:slug` — que não é o lugar certo para essa checagem:
fazer uma lista inteira (`GET /posts`) devolver 500 por causa de **um** registro
ruim reproduziria exatamente o mesmo problema de "blast radius" que esta issue
quer evitar, só que do lado do servidor.

Os cenários 2 (dado legado) e 3 (qualquer outro throw) não são fecháveis por
validação de request — é exatamente para isso que serve o isolamento por card no
front, que é uma rede de segurança genérica, não específica de slug.

Confirmado lendo `slug.ts`: `slugify()` sempre produz ou `'post'` (fallback) ou
uma string que já bate com `^[a-z0-9]+(?:-[a-z0-9]+)*$` (colapsa tudo que não é
`[a-z0-9]` num único hífen, depois apara hífens nas pontas). `uniqueSlug()`
preserva essa invariante nos sufixos `-post`/`-2`/`-3`... Ou seja: a asserção
nova **não deveria rejeitar nenhum slug gerado hoje** — é puramente uma trava de
regressão para o futuro, não uma mudança de comportamento observável.

## 1. API: asserção de formato no momento da criação

**Arquivo:** `apps/api/src/posts/slug.ts` — exporta `SLUG_FORMAT` (regex) e
`assertSlugFormat(slug)`, usando `matches()` do `class-validator`.

**Arquivo:** `apps/api/src/posts/posts.service.ts` — `create()` chama
`assertSlugFormat(slug)` logo após `uniqueSlug()`, antes de `prisma.post.create()`.

Um `Error` simples (não `HttpException`) é a escolha certa: o
`AllExceptionsFilter` (`apps/api/src/common/filters/all-exceptions.filter.ts`)
já captura qualquer `Error` não tratado, loga o stack e devolve um 500
mascarado — o comportamento "falha alto, mas sem vazar detalhe pro cliente" que
o resto do projeto já usa para bug de verdade.

## 2. Web: `CardErrorBoundary` isolando cada card do feed

**Novo componente:** `apps/web/src/components/organisms/CardErrorBoundary/`
— organism (envolve `PostCard`, também organism; uma molécula/átomo não pode
depender de um nível acima).

Modelado no `ErrorBoundary` existente (`organisms/ErrorBoundary/ErrorBoundary.tsx`)
mas mais simples:
- Classe (obrigatório — sem equivalente em hooks no React 19).
- Sem `resetKey`: o item de lista já tem `key={post.slug}`; se o slug mudar, o
  React desmonta/remonta sozinho. Se não mudar, as props que causaram o throw
  também não mudam — não há "recuperação" real a destravar.
- Fallback: `null` ("neutralizar silenciosamente"). Decisão a revisitar se um
  placeholder visível for preferido depois.
- `componentDidCatch` só loga (`console.error`) — sem mexer em
  `document.title`/meta description, que são preocupação de página inteira.

**Arquivo:** `apps/web/src/components/organisms/PostList/PostList.tsx` — o
`CardErrorBoundary` envolve o `<li>` inteiro, não só o `<PostCard>`: assim, se o
card falha, o item some da lista por completo (sem `<li></li>` vazio inflando a
contagem de `listitem` para leitores de tela). O `key` muda de dono: do `<li>`
para o `<CardErrorBoundary>`, mesmo valor (`post.slug`).

## Descoberta #2, durante a implementação: o vetor original do slug não existe mais

Ao escrever o teste de isolamento do `PostList` com um slug malicioso (ex.:
`'//evil.example'`), descobri — e confirmei empiricamente rodando `new URL()`
em Node — que **nenhum conteúdo de slug consegue mais fazer o `TextLink` lançar
através do `PostCard`**. O `href` ali é sempre `` `/posts/${post.slug}` ``, e
esse prefixo literal fixo ancora o resultado na mesma origem não importa o que
vier depois — os truques de protocolo-relativo (`//`) e de backslash só
funcionam quando aparecem no **início** da referência, não no meio de um path
já existente. Testei todo vetor que `TextLink.test.tsx` rejeita (`//evil`,
`/\evil`, `/\t/evil`, etc.), com o prefixo `/posts/` na frente de cada um —
nenhum lança, nenhum resolve pra origem diferente.

Ou seja: o fix da PR #17 (checar por resultado via `new URL(...).origin`, em
vez de lista de prefixo) fechou esse vetor de forma mais completa do que a
própria revisão que abriu a issue #18 percebeu — pelo menos para este
call site específico.

Isso não invalida o `CardErrorBoundary`: ele continua sendo a rede de segurança
genérica certa para qualquer outro throw dentro de um card (cenário 3 do
plano original — um `post.author` nulo, um campo futuro mal tratado, etc.),
só não é mais "o fix para o vetor do slug" porque esse vetor específico já não
existe. O teste de isolamento no `PostList.test.tsx` foi escrito usando
`post.author = null` como gatilho real, em vez de um slug malicioso, porque é
o jeito atualmente possível de reproduzir a falha que a issue descreve.

## 3. Testes

- `apps/api/src/posts/slug.spec.ts`: casos novos para `assertSlugFormat` —
  slugs válidos passam, inválidos (`'Bad Slug'`, hífen duplo, hífen nas pontas,
  underscore) lançam.
- `apps/api/src/posts/posts.service.spec.ts`: mocka `uniqueSlug` para devolver
  um slug inválido, confirma que `create()` rejeita **e** que
  `prisma.post.create` nunca foi chamado.
- `apps/web/src/components/organisms/CardErrorBoundary/CardErrorBoundary.test.tsx`:
  mesmo padrão do `ErrorBoundary.test.tsx` (componente `Explodes`, `console.error`
  espiado, caso feliz e caso de falha).
- `apps/web/src/components/organisms/PostList/PostList.test.tsx`: lista de 5
  posts onde um tem `author: null` (gatilho real de throw, não mais um slug —
  ver descoberta acima), confirma 4 `listitem`s (não 5, não 0) e que os outros
  títulos continuam no documento.

Cada teste novo provado por reversão deliberada: reverter a mudança
correspondente, confirmar que o teste falha do jeito esperado, restaurar,
confirmar que passa.

## Verificação

- `pnpm typecheck && pnpm lint` (type-aware).
- `pnpm test:api` e `pnpm test:web`.
- `pnpm db:up` + `pnpm test:api:e2e` — confirma que a asserção nova (que corre em
  todo `POST /posts`) não quebra nenhum fluxo de criação existente. Sem caso e2e
  novo dedicado: a asserção é inacessível via HTTP normal hoje, só dispara com
  uma regressão em `slugify()`/`uniqueSlug()` — o teste de unidade mockando
  `uniqueSlug` é o jeito certo de exercitá-la.
- `pnpm test:web:a11y` — confirma que mover o `key` do `<li>` para o
  `CardErrorBoundary` não quebra a11y nem o teste de nomes de controle únicos.
- Commits separados por preocupação (asserção na API; `CardErrorBoundary` +
  `PostList`).
- PR contra a `main` fechando a issue #18.

## Rodadas de revisão (PR #20)

**Rodada 1** — achados confirmados no código e corrigidos:
- `PostList.test.tsx`: `mockRestore()` do spy de `console.error` ficava no fim
  do teste; se um `expect` falhasse antes, o spy vazava para os testes
  seguintes. Corrigido com `try/finally`.
- `CardErrorBoundary.test.tsx`: faltava o caso `has no WCAG 2.2 AA violations`
  que `frontend-ux-seo.md` exige em todo arquivo de teste de componente.
- `slug.ts`: a mensagem de erro interpolava o slug cru (risco de log
  injection, já que o slug só chega ali depois que a invariante que deveria
  garantir já quebrou) e `assertSlugFormat` não checava `SLUG_MAX_LENGTH`.
  Corrigido com `JSON.stringify` na mensagem e a checagem de comprimento.

**Rodada 2** — achado confirmado e corrigido:
- `CardErrorBoundary.tsx`: o comentário de cabeçalho ainda apontava o
  `TextLink`/slug como gatilho provável, contradizendo a descoberta já
  registrada neste plano. Corrigido para apontar um campo malformado
  qualquer (ex.: `author` ausente) como o gatilho realista.

**Rodada 3** — LGTM, nada bloqueante. Um nit opcional, verificado e **não
aplicado**: usar `SLUG_FORMAT.test(slug)` direto em vez de `matches()` do
`class-validator`, para não acoplar um util puro de domínio à lib de
validação de DTOs. Não aplicado porque a escolha de `matches()` foi
deliberada (ver seção 1): manter a validação do slug na mesma base que o
resto do módulo já usa para validar campos, não uma regex "nua" isolada.
É uma troca de estilo sem efeito em corretude, segurança ou comportamento —
ambas as formas são válidas; `matches()` foi mantido por consistência com o
restante do arquivo `create-post.dto.ts`.
