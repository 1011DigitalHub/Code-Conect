# Plano: Página de Feed de Posts (apps/api + apps/web)

## Contexto

O Code Connect hoje é só autenticação: `POST /users`, `POST /auth/login`, `GET /auth/me` na API, e as páginas `/login`, `/cadastro` e `/perfil` na web. Não existe nenhum conteúdo — o produto não tem razão de existir até ter o feed. Este plano entrega o núcleo da aplicação: posts com busca, curtidas e comentários, de ponta a ponta.

O que isso exige, nesta ordem:

1. **Backend novo do zero**: modelos `Post`, `Comment` e `Like`, migration, busca full-text em português no Postgres, endpoints REST paginados e um seed com posts mockados.
2. **Leitura pública com contexto de quem olha**: o feed é visível sem login (requisito 4.2), mas precisa saber se *você* já curtiu cada post (requisito 4.3). Isso é novo: hoje toda rota é ou totalmente pública ou totalmente protegida. Nasce um `OptionalAuthGuard`.
3. **Frontend com layout compartilhado** entre feed e detalhe do post (requisito 4.4), menu lateral com o link Login/Sair alternando pela sessão (requisito 4.5) e busca que executa no backend (requisito 4.6).

**Resultado pretendido:** um visitante abre `/`, vê os posts, busca por tema e abre um post. Se entrar, passa a curtir, comentar e publicar, sem sair do lugar.

### Decisões já confirmadas com o usuário (2026-10-05)

| Tema | Decisão |
|---|---|
| Rota do feed | **`/`**. O feed vira a porta de entrada; `/login` continua existindo. Nenhum teste atual depende de `/` renderizar o login (verificado: `LoginPage.test.tsx` monta `/login`, e `e2e/routes.ts` lista `/login`). |
| Cobertura de navegador | **API como segundo `webServer` do Playwright**, com `db:up` + `db:seed` antes. As metas do projeto (performance ≥ 0.9, LCP ≤ 2500 ms, CLS ≤ 0.1) são exatamente o risco que um feed introduz; medir página vazia não mede nada. `pnpm test:web:a11y` passa a exigir Postgres. |
| Thumbnails | **Só placeholder por enquanto.** Nenhum arquivo novo em `public/`. O seed cobre os três estados (`null`, URL quebrada, URL válida) e o caminho da imagem real fica implementado e testado para quando houver assets. |
| Identificador do post | **`slug`** na URL e nos links (`/posts/:slug`), `id` só interno. URLs legíveis, um identificador só, e os testes e2e deixam de depender de `id: 1`. Desvia de `UserEntity.links.self = '/users/1'` de propósito. |
| Runner do seed | **`tsx`** como devDependency da API (ver passo 5 — há um bloqueio verificado que elimina as alternativas). |

> **Figma não lido.** O node `155-3100` não pôde ser aberto: o servidor MCP `plugin:figma:figma` não está autorizado e esta sessão não é interativa, então o fluxo OAuth não roda. O layout abaixo segue a estrutura canônica do Code Connect (rail lateral com logo e navegação, busca no topo, grid de cards). **As medidas finas da tabela do passo 7 precisam ser conferidas contra o Figma durante a implementação**; se divergirem, a correção entra como nota datada neste arquivo, no padrão do projeto. Para autorizar: `/mcp` numa sessão interativa do terminal → servidor `figma` → `Authenticate`.

> **Onde este arquivo vai morar.** Aprovado o plano, ele é salvo como `plan/PaginaFeed.md` antes de qualquer código, conforme o `CLAUDE.md` e o padrão dos outros planos.

> **Atualização (2026-10-05), o modelo de autenticação mudou debaixo deste plano.** O plano foi escrito com a árvore em `feat/integracao-front-back`. A implementação começou em `feat/secure-by-design`, que já trocou o Bearer token por **cookie httpOnly + CSRF double-submit**. O escopo e os requisitos 4.1–4.6 não mudam; o desenho de autenticação muda assim:
>
> | Ponto | Plano original | Agora |
> |---|---|---|
> | `AuthGuard` | por rota, com `@UseGuards(AuthGuard)` | **global** (`APP_GUARD` no `AppModule`), toda rota protegida por padrão, com opt-out em `@Public()` |
> | Sessão | `Authorization: Bearer <token>` | cookie httpOnly `access_token`; o bridge do Bearer foi removido |
> | `OptionalAuthGuard` | guard novo lendo o header Bearer | **não existe mais.** Em vez disso, o ramo `isPublic` do `AuthGuard` global passa a tentar ler e verificar o cookie, preenchendo `request.user` quando válido e ignorando falha. Um guard só, e toda rota `@Public()` fica "opcionalmente autenticada" de maneira uniforme |
> | `src/auth/bearer.ts` | extrair `extractBearerToken` | **desnecessário.** Não há Bearer; `readCookie` (`src/auth/cookies.ts`) já é o helper compartilhado |
> | Usuário atual | `@Req() req: AuthenticatedRequest` → `req.user.sub` | `@CurrentUser()` (já existe) nas rotas protegidas; `@Req() req: MaybeAuthenticatedRequest` → `req.user?.sub` nas `@Public()` |
> | Mutações (`POST`/`PUT`/`DELETE`) | nada | o `CsrfGuard` global já exige `X-CSRF-Token` casando com o cookie `csrf_token`. Nenhum código novo, mas **todo e2e que muta precisa de `fetchCsrfToken(agent)`** (`test/cookies.ts`) |
> | Rate limiting | `@UseGuards(ThrottlerGuard)` por rota | `ThrottlerGuard` já é global; `@Throttle({ default: X })` só aperta o limite |
> | `useSession` (web) | `getToken() !== null`, síncrono | `tokenStorage.ts` **não existe mais** e o cookie é invisível ao JS. O hook passa a sondar `GET /auth/me` e expõe `status: 'loading' \| 'authenticated' \| 'anonymous'`, o `user` e um `signOut()` que chama `POST /auth/logout`. É o padrão que a `ProfilePage` já usa |
> | Sidebar durante `loading` | não existia | renderiza o link **"Login"** (anônimo otimista, o caso comum num feed público) e troca para "Sair" se a sessão resolver autenticada. Link e botão são **uma** parada de Tab cada, então a contagem do teste de Tab fica estável e não há salto de layout |
> | Sessão falsa no Playwright | `page.addInitScript` + `sessionStorage` | `page.context().addCookies([{ name: 'access_token', httpOnly: true, ... }])`, como a `e2e/profile.e2e.ts` já faz |

---

> **Atualização (2026-10-05), implementação concluída.** A execução seguiu este plano com os ajustes abaixo, descobertos ao rodar o `e2e/a11y.e2e.ts` de verdade contra o feed semeado:
>
> - **`line-clamp` removido do resumo e nenhum foi aplicado ao título.** O teste `keeps text visible with increased text spacing` (WCAG 1.4.12) injeta `line-height`/`letter-spacing`/`word-spacing` maiores e falha se algum elemento com `overflow` não visível cortar texto. `line-clamp-3` é exatamente isso: corta o resumo numa altura fixa, e com o espaçamento maior ele passou a esconder frases inteiras. O card simplesmente fica com altura variável conforme o tamanho do resumo — não há CLS nisso, porque a altura não muda depois da pintura inicial, só varia entre posts.
> - **A pluralização de "comentário(s)" deixou de ser `sr-only`.** O mesmo teste trata qualquer elemento com overflow escondido e texto maior que a caixa como corte de conteúdo, e o utilitário `sr-only` do Tailwind (`position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0)`) é exatamente esse padrão — um falso positivo da heurística do teste, mas trocar por texto visível ("4 comentários") resolve sem precisar tocar na suíte compartilhada, e é estritamente melhor (texto visível serve todo mundo, não só quem usa leitor de tela).
> - **`playwright.config.ts` ganhou um segundo `webServer`** para a API (ver decisão da tabela acima), com `cwd: '../api'`, `pnpm start:dev` localmente e `pnpm build && pnpm start:prod` em CI, `timeout: 120_000`. Exige `pnpm db:up && pnpm db:migrate && pnpm db:seed` antes de rodar `pnpm test:web:a11y`.
> - **Os mocks de `page.route` em `e2e/post.e2e.ts` e `e2e/feed-session.e2e.ts` casam por `url.origin` + `url.pathname`, nunca por um padrão glob/regex de caminho isolado.** Descoberta ao rodar de verdade: `page.goto('/posts/<slug>')` é, ele mesmo, uma navegação para essa URL — e como a rota cliente da SPA usa exatamente o mesmo caminho (`/posts/:slug`) que o endpoint da API, um padrão tipo `**/posts/<slug>` intercepta as duas coisas, servindo o JSON mockado como se fosse o documento HTML da página. Uma função `(url: URL) => boolean` comparando `url.origin` evita a colisão e também evita a armadilha de escape de `\?` dentro de regex construída por template string (o `\?` perde a barra sob as regras de escape de string do JS antes de o motor de regex vê-lo).
> - **`.github/workflows/lighthouse.yml` ganhou um serviço Postgres + build/migração/seed/start da API antes do `lhci collect`**, pela mesma razão do `playwright.config.ts`: sem isso, o Lighthouse mediria o feed vazio ou em erro, não a página real. **Não verificado contra uma execução real do GitHub Actions** — só contra a suíte local do Playwright, que exercita o mesmo caminho (API real + `vite preview`). Rodar `gh workflow run lighthouse.yml` e registrar o resultado aqui antes de considerar este passo fechado.
> - **Verificado ao vivo:** `prisma migrate status` sem drift após a migration com a coluna gerada; `websearch_to_tsquery('portuguese','componente')` casando com "Componentes React na prática" (rank 0,64); `?q=!!!` devolvendo lista vazia em vez de erro; `pnpm db:seed` rodado duas vezes sem duplicar nem reordenar; 94→103 testes unitários da API, 88 e2e da API, 295 testes de componente/página da web e 102 testes de navegador (3 larguras), todos verdes.

## 1. Modelos e migration (`apps/api/prisma/`)

### `schema.prisma`

```prisma
model Post {
  id           Int      @id @default(autoincrement())
  slug         String   @unique @db.VarChar(160)
  title        String   @db.VarChar(120)
  excerpt      String   @db.VarChar(160)
  content      String
  thumbnailUrl String?  @map("thumbnail_url") @db.VarChar(500)
  authorId     Int      @map("author_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Coluna gerada. O Prisma não sabe expressar GENERATED ALWAYS AS, então o SQL
  // desta coluna é escrito à mão na migration. Ela é declarada aqui só para o
  // `migrate dev` não enxergar drift e tentar removê-la.
  searchVector Unsupported("tsvector")? @map("search_vector")

  author   User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments Comment[]
  likes    Like[]

  @@index([createdAt(sort: Desc), id(sort: Desc)])
  @@index([authorId])
  @@index([searchVector], type: Gin, map: "posts_search_vector_idx")
  @@map("posts")
}

model Comment {
  id        Int      @id @default(autoincrement())
  body      String   @db.VarChar(1000)
  postId    Int      @map("post_id")
  authorId  Int      @map("author_id")
  createdAt DateTime @default(now()) @map("created_at")

  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([postId, createdAt])
  @@index([authorId])
  @@map("comments")
}

model Like {
  postId    Int      @map("post_id")
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([postId, userId])
  @@index([userId])
  @@map("likes")
}
```

No `User`, acrescentar `posts Post[]`, `comments Comment[]` e `likes Like[]`.

Decisões embutidas:
- **`Like` com chave primária composta** `@@id([postId, userId])`, sem `id` sintético: dá a unicidade e o índice de graça, e uma curtida não tem identidade própria. O campo é `userId`, não `authorId` — curtida não é autoria.
- **`excerpt` é `VarChar(160)` com mínimo de 50 no DTO.** Ele é reaproveitado como `description` do `usePageMeta` da página do post, e a suíte `e2e/seo.e2e.ts` exige 50–160 caracteres. Travar a faixa no banco e no DTO significa que a página nunca precisa inventar uma descrição.
- **Sem contadores desnormalizados.** `likeCount`/`commentCount` vêm do `_count` do Prisma. Com 9 linhas por página é barato e não dessincroniza.
- **`Unsupported("tsvector")?` precisa ser opcional**, para o Prisma deixá-la fora dos inputs de `create`/`update` (é gerada, não gravável).
- `onDelete: Cascade` em tudo.

### Migration (a ordem importa)

```bash
pnpm --filter api exec prisma migrate dev --create-only --name create_posts_comments_likes
# editar à mão o migration.sql gerado
pnpm db:migrate
```

No SQL gerado, trocar a linha `"search_vector" tsvector,` dentro do `CREATE TABLE "posts"` por:

```sql
    "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese'::regconfig, coalesce("title", '')),   'A') ||
        setweight(to_tsvector('portuguese'::regconfig, coalesce("excerpt", '')), 'B') ||
        setweight(to_tsvector('portuguese'::regconfig, coalesce("content", '')), 'C')
    ) STORED,
```

e conferir que ficou:

```sql
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");
```

Detalhes que quebram se forem ignorados:
- **O cast `::regconfig` é obrigatório.** `to_tsvector(text)` de um argumento é `STABLE`, não `IMMUTABLE`, e o Postgres recusa em coluna gerada. A forma de dois argumentos é imutável.
- `portuguese` é configuração nativa do Postgres — **nenhuma extensão necessária**.
- `setweight` A/B/C faz título pesar mais que corpo no `ts_rank`.
- **`--create-only` é indispensável.** O `migrate dev` replica `prisma/migrations/*` num shadow database e compara com o `schema.prisma`. Se a coluna simples for aplicada primeiro e o arquivo editado depois, o banco de dev (coluna simples) e o replay (coluna gerada) divergem → o Prisma acusa drift e oferece reset destrutivo.
- `prisma migrate deploy` aplica o SQL literalmente e não compara nada, então o banco de teste (`test/global-setup.ts`) recebe a coluna gerada e o índice GIN corretos. Ele também **não roda o seed**, o que mantém os e2e com banco vazio e preserva os asserts de `id: 1`.
- Comentário no topo do arquivo de migration explicando a edição manual, para ninguém regerar.

**Se o validador do Prisma recusar `@@index([searchVector], type: Gin)`** (verificar no `--create-only`): tirar o `@@index` do schema, manter o `CREATE INDEX` só no SQL, e documentar que todo `migrate dev` futuro vai emitir um `DROP INDEX "posts_search_vector_idx"` espúrio que precisa ser apagado à mão. A versão declarada no schema é fortemente preferível.

---

## 2. Guards e utilitários compartilhados (`apps/api/src/`)

### `src/auth/bearer.ts` (novo)
`extractBearerToken(request)`, extraído do método privado `extractTokenFromHeader` de `auth.guard.ts`. Os dois guards passam a usar a mesma implementação.

### `src/auth/optional-auth.guard.ts` (novo)
Sempre retorna `true`. Preenche `request.user` quando há um Bearer válido e ignora em silêncio token ausente, malformado ou expirado:

```ts
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    const token = extractBearerToken(request);
    if (!token) return true;
    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: getJwtSecret(),
      });
    } catch {
      // Em rota pública, token inválido ou expirado só significa "não logado".
    }
    return true;
  }
}
```

- Fica ao lado do `AuthGuard` e **não é registrado como provider em lugar nenhum** — exatamente como o `AuthGuard` hoje. Funciona porque `JwtModule.register({ global: true })` no `AuthModule` deixa `JwtService` disponível globalmente (verificado em `auth.module.ts`).
- `auth.types.ts` ganha `export type OptionalAuthRequest = Request & { user?: JwtPayload }`. `AuthenticatedRequest` não muda.
- No controller: `@Req() req: OptionalAuthRequest` → `req.user?.sub`.

**Consequência a desenhar em volta:** com token velho, o feed responde `200` com `likedByMe: false`, então o interceptor de 401 do axios não dispara. A UI parece logada até a primeira curtida, que devolve `401` → o interceptor limpa o token e o handler da página chama `session.signOut()`. O hook `useSession` (passo 8) torna essa transição visível na hora.

### `src/common/` (novos)
- `transforms.ts` → `trim`. O helper hoje local em `dto/create-user.dto.ts` sobe para cá e passa a ser usado por três DTOs; `create-user.dto.ts` é atualizado para importá-lo.
- `dto/pagination-query.dto.ts` → `PaginationQueryDto { page? = 1; perPage? = 9 }`, com `@Type(() => Number) @IsInt() @Min(1)`, `@Max(50)` no `perPage`, `@IsOptional()` e `@ApiPropertyOptional`.
- `dto/paginated.dto.ts` → `PaginationDto { page, perPage, total, totalPages }` e `CollectionLinksDto { self, next, prev }`. As coleções são **classes concretas por recurso** (`PostCollectionDto`, `CommentCollectionDto`), não genéricos do Swagger: o projeto não tem helper de `getSchemaPath` e classes concretas mantêm o `/api/docs-json` legível.
- `pagination.ts` → `buildPagination({ page, perPage, total })` (`totalPages = Math.max(1, Math.ceil(total / perPage))`) e `buildCollectionLinks(basePath, params, page, totalPages)`, que remonta a query com `URLSearchParams` (preserva e codifica o `q`), devolvendo `prev: null` na página 1 e `next: null` na última.
- `throttle.constants.ts` ganha `CREATE_POST_THROTTLE { limit: 10, ttl: 60_000 }` e `CREATE_COMMENT_THROTTLE { limit: 20, ttl: 60_000 }`.

---

## 3. Endpoints REST (`apps/api/src/posts/`)

Módulo novo `src/posts/` com dois controllers (`posts.controller.ts` → `@ApiTags('posts')`, `comments.controller.ts` → `@ApiTags('comments')`) e dois services. Nenhum import de módulo necessário (`PrismaModule` é `@Global`, `JwtModule` é global). Registrar `PostsModule` no `AppModule` depois do `AuthModule`.

| # | Método | Rota | Auth | Sucesso | Request | Response | Erros documentados |
|---|---|---|---|---|---|---|---|
| 1 | GET | `/posts` | `OptionalAuthGuard` | 200 | `ListPostsQueryDto` (`q?`, `page?`, `perPage?`) | `PostCollectionDto` | 400 |
| 2 | POST | `/posts` | `AuthGuard` + `ThrottlerGuard` | 201 + `Location: /posts/<slug>` | `CreatePostDto` | `PostEntity` | 400, 401, 409, 429 |
| 3 | GET | `/posts/:slug` | `OptionalAuthGuard` | 200 | — | `PostEntity` | 404 |
| 4 | GET | `/posts/:slug/comments` | pública | 200 | `PaginationQueryDto` | `CommentCollectionDto` | 400, 404 |
| 5 | POST | `/posts/:slug/comments` | `AuthGuard` + `ThrottlerGuard` | 201 + `Location: /posts/<slug>/comments/<id>` | `CreateCommentDto` | `CommentEntity` | 400, 401, 404, 429 |
| 6 | GET | `/posts/:slug/comments/:commentId` | pública | 200 | — | `CommentEntity` | 404 |
| 7 | PUT | `/posts/:slug/like` | `AuthGuard` | **204** | — | — | 401, 404 |
| 8 | DELETE | `/posts/:slug/like` | `AuthGuard` | **204** | — | — | 401, 404 |

Os `201` seguem o padrão do `UsersController`: `@Res({ passthrough: true }) res` + `res.location(entity.links.self)`. O endpoint 6 existe para o `Location` do 5 ser dereferenciável.

### Formato da curtida, justificado contra as regras REST

Alternativas descartadas:
- **Toggle (`POST /posts/:slug/likes/toggle`)** — é RPC, não recurso, e não é idempotente. Clique duplo inverte o estado de forma imprevisível.
- **`POST` + `DELETE` em `/posts/:slug/likes`** — `POST` não é idempotente. Com a PK composta, clique duplo vira violação de unicidade → `409`, e a UI mostra erro para um duplo-clique inofensivo.

Escolhido: a curtida é um **sub-recurso singleton do visitante autenticado**, então os verbos idempotentes são `PUT` (cria ou não faz nada) e `DELETE` (remove ou não faz nada). Rota `/posts/:slug/like`, **singular porque é singleton** — a regra de "substantivos no plural" governa coleções. Fica em um nível de aninhamento (ao contrário de `/posts/:slug/likes/me`).

Implementação: `PUT` → `like.createMany({ data, skipDuplicates: true })`; `DELETE` → `like.deleteMany({ where: { postId, userId } })`. Os dois devolvem **204 sempre**; `404` só quando o slug não existe. A exceção do singleton fica documentada no comentário do controller e na descrição do `@ApiOperation`.

Sem corpo na resposta (em vez de devolver a contagem nova) porque o front sabe que o delta é exatamente ±1 e a operação é idempotente: a atualização otimista local é provadamente correta e não precisa de refetch. Em caso de erro, desfaz.

### DTOs e entidades
- `dto/create-post.dto.ts` — `title` (trim, 3–120), `excerpt` (trim, **50–160**), `content` (trim, 20–10000), `thumbnailUrl?` (`@MaxLength(500)` + `@Matches(/^(https?:\/\/|\/)/)`, para aceitar URL absoluta e caminho relativo ao site; `@IsUrl` recusaria `/posts/x.webp`).
- `dto/list-posts-query.dto.ts` — `extends PaginationQueryDto`, acrescenta `q?: string` com `@Transform(trim) @IsOptional() @IsString() @MaxLength(120)`. **Sem `@MinLength`**: string vazia tem que chegar no service, que a trata como ausente.
- `dto/create-comment.dto.ts` — `body` (trim, 1–1000).
- `entities/post.entity.ts` — `PostAuthorDto { id, name, links: { self } }`; `PostLinksDto { self, comments, like, author }`; **`PostSummaryEntity`** (slug, title, excerpt, thumbnailUrl, createdAt ISO, author, likeCount, commentCount, likedByMe, links) e **`PostEntity extends PostSummaryEntity`** acrescentando `content`. Duas classes porque mandar `content` de 9 posts no feed engorda justamente o payload crítico para o LCP. Construtores recebem o registro do Prisma (+ `viewerId` opcional), espelhando `UserEntity`. Também `export type StoredPost = Post`.
- `entities/comment.entity.ts` — `CommentEntity { id, body, createdAt, author, links: { self, post } }`.
- `slug.ts` — geração a partir do título (minúsculas, sem acentos, hífens), clamp em 160, sufixo numérico em colisão, e **`RESERVED_SLUGS`** contendo `novo` (senão um post intitulado "Novo" fica inacessível atrás de `/posts/novo`).
- `src/swagger.ts` — `setDescription('Cadastro, login, dados do usuário logado e feed de posts.')`.

Ordem dos comentários: **mais antigo primeiro** (`createdAt asc, id asc`), que é como uma conversa se lê. Ordem do feed: mais recente primeiro.

---

## 4. Busca full-text (requisito 4.6)

`GET /posts?q=<termo>&page=<n>&perPage=<n>`. Um método de service, dois ramos.

**Projeção compartilhada** — um `select` estático só, com sentinela para não ter spread condicional (que destrói a inferência de tipos do Prisma):

```ts
const feedSelect = (viewerId: number) => ({
  id: true, slug: true, title: true, excerpt: true, thumbnailUrl: true, createdAt: true,
  author: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
  // viewerId 0 nunca casa com um serial, então visitante anônimo recebe array vazio.
  likes: { where: { userId: viewerId }, select: { userId: true } },
})
```

`PostSummaryEntity` define `likedByMe = post.likes.length > 0`.

**Ramo 1 — sem `q` (ou só espaços):** Prisma tipado, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `skip`/`take`, com `post.count()` em paralelo via `Promise.all`.

**Ramo 2 — com `q`:** uma query crua devolve *ids em ordem de relevância mais o total*, e a mesma query tipada hidrata:

```ts
const ranked = await this.prisma.$queryRaw<{ id: number; total: bigint }[]>`
  WITH search AS (
    SELECT websearch_to_tsquery('portuguese', ${term}) AS query
  )
  SELECT p."id", count(*) OVER () AS total
  FROM "posts" p, search s
  WHERE p."search_vector" @@ s.query
  ORDER BY ts_rank(p."search_vector", s.query) DESC,
           p."created_at" DESC,
           p."id" DESC
  LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
`
```

Depois: `total = ranked.length > 0 ? Number(ranked[0].total) : 0`, `findMany({ where: { id: { in: ids } }, select: feedSelect(viewerId) })` e **reordenar pelo array de ids** com um `Map` — `IN` não preserva ordem.

Decisões e armadilhas:
- **Só parametrização.** O template tagueado transforma `${term}`, `${perPage}` e `${offset}` em `$1/$2/$3`. **Nunca `Prisma.raw`, nunca concatenação de string.** `'portuguese'` é literal SQL, não parâmetro (um `regconfig` não é entrada de usuário).
- **`count(*) OVER ()` dá o total na mesma query**: uma ida ao banco, e o total nunca discorda da página porque sai do mesmo filtro.
- **Armadilha de BigInt:** `count(*)` é `int8` → `BigInt` em JS, e `JSON.stringify` lança `TypeError: Do not know how to serialize a BigInt`, o que apareceria como 500. Converter com `Number(...)` dentro do service, imediatamente.
- **Por que duas queries e não uma crua:** os agregados de relação e o `likedByMe` são muito mais simples e tipados pelo Prisma. A query crua fica sendo só "quais ids, em que ordem, e quantos no total".
- **`q` vazio ou só espaços:** `q?.trim() ?? ''` cai no ramo 1. `?q=` é idêntico a omitir `q`.
- **Pontuação:** `websearch_to_tsquery` foi escolhido justamente porque, ao contrário de `to_tsquery`, nunca lança com aspas desbalanceadas ou operadores soltos. `?q=!!!` gera tsquery vazia, `@@` é falso em toda linha → `200` com `data: []` e `total: 0`. É o comportamento certo (resultado vazio, não erro), e o front mostra "Nenhum post encontrado para «!!!»".
- **`forbidNonWhitelisted` forçado (explícito):** com `@Query() query: ListPostsQueryDto`, qualquer parâmetro desconhecido devolve **400**. `GET /posts?q=react&utm_source=x` é 400. O cliente web está a salvo porque monta a query só com `q`/`page`/`perPage`, mas isso fica documentado e **fixado por um teste e2e** para ninguém "corrigir" depois.

---

## 5. Seed (`apps/api/prisma/seed.ts`)

### Como roda — bloqueio verificado

`node --experimental-strip-types prisma/seed.ts` **não funciona**. O Node 22 não remapeia especificadores `.js` para arquivos `.ts`, e o client gerado é TypeScript com `importFileExtension = "js"`:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/generated/prisma/enums.js
  imported from .../src/generated/prisma/client.ts
```

Funciona sob `nest build`, é fatal sob type-stripping puro. Então: **`tsx` como devDependency da API**. Resolve `.js`→`.ts`, mantém o seed tipado, deixa reusar `hashPassword` de `src/users/password.ts`, e é a forma padrão de rodar seed de Prisma em projeto TS ESM. (Alternativas: compilar para `dist/` exige `nest build` antes de todo `db:seed`; seed em SQL cru com `pg` perde a tipagem e duplica o hashing.)

### Ligação
- `apps/api/package.json` devDeps: `"tsx": "^4"`.
- `pnpm-workspace.yaml` → `allowBuilds`: **liberar `esbuild`** (hoje está `false`). O `tsx` depende dele, o `esbuild` tem script de instalação, e sem isso o pnpm pula a build em silêncio e o `tsx` falha em runtime. Fácil de não perceber.
- `apps/api/prisma.config.ts` → `migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' }`. Chave confirmada para o Prisma 7 (`MigrationsConfigShape = { path?, initShadowDb?, seed? }` em `@prisma/config`, sem gate de experimental). Faz `prisma migrate reset` e `prisma db seed` rodarem o seed.
- `package.json` da raiz → `"db:seed": "pnpm --filter api exec prisma db seed"`, ao lado de `db:migrate` e `db:studio`.

### Guarda de segurança — primeira coisa que o seed faz
```ts
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL must be set to seed the database')
if (url === process.env.TEST_DATABASE_URL) throw new Error('refusing to seed the test database')
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== '1')
  throw new Error('refusing to seed a production database')
const host = new URL(url).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_REMOTE_SEED !== '1')
  throw new Error(`refusing to seed a non-local database (${host})`)
```
Espelha (invertida) a guarda que já existe em `test/global-setup.ts`. O caminho e2e já é seguro por conta própria: `migrate deploy` nunca dispara o seed.

### Conteúdo (~12 posts, 3 usuários, pt-BR)
- Usuários `ana.souza@example.com`, `bruno.lima@example.com`, `carla.mendes@example.com`, todos com a senha de desenvolvimento `CodeConnect123` passada pelo `hashPassword` real — contas semeadas realmente logam.
- 12 posts com **títulos únicos** (obrigatório, ver passo 10) e slugs determinísticos escritos à mão. Todo `excerpt` entre 50 e 160 caracteres, para ser meta description válida. `createdAt` calculado como `agora − N dias` no momento do seed, não data fixa, para os tempos relativos nunca parecerem velhos.
- **Thumbnails, cobrindo os três estados de propósito:** 6 posts com `thumbnailUrl: null`, 4 posts apontando para `/posts/<slug>.webp` (arquivos que **não existem ainda** — decisão "só placeholder"), 2 posts apontando para `/posts/capa-indisponivel.webp`. Hoje todos caem no placeholder, por caminhos diferentes (null no banco vs. `onError` em runtime), o que é exatamente o que precisa estar testado. Quando houver imagens reais, basta soltá-las em `apps/web/public/posts/` com os nomes dos slugs: `pnpm dlx sharp-cli -i <arquivo> -o apps/web/public/posts -f webp -q 75`, 640×360, ≤ ~60 KB.
- ~20 comentários distribuídos de forma desigual (alguns posts com zero) e curtidas espalhadas (alguns posts com 0, outros com 1–3).

### Idempotência (re-executável, nunca truncando)
- usuários: `upsert` por `email`.
- posts: `upsert` por `slug`, com o ramo `update` omitindo `createdAt` para não reordenar o feed a cada execução.
- comentários: por post semeado, `deleteMany({ where: { postId } })` e `createMany` — escopo só nos posts do seed, então comentários que o desenvolvedor escreveu nos posts dele sobrevivem.
- curtidas: `createMany({ skipDuplicates: true })` — a PK composta torna isso naturalmente idempotente.

---

## 6. Placeholder de thumbnail (requisito 3)

Dois componentes, porque a arte e a lógica de fallback são responsabilidades diferentes e as regras de nível do projeto são estritas.

### atom `ThumbnailPlaceholder`
Sem props. SVG inline — nenhuma requisição de rede, nenhum estado.
```tsx
<svg viewBox="0 0 640 360" aria-hidden="true"
     className="aspect-video w-full rounded-2xl bg-surface text-muted">
  {/* glifo de imagem, centralizado, stroke-current, opacity-40 */}
</svg>
```
- **Decorativo, então `aria-hidden="true"`**, não `role="img"` com rótulo: o título do post está do lado, e anunciar "imagem não disponível" seis vezes por página é só ruído — além de poluir o espaço de nomes acessíveis (passo 10).
- **CLS zero:** o `viewBox` dá proporção intrínseca 16:9 e `aspect-video w-full` reserva a caixa antes da pintura.
- **Tokens:** `bg-surface`, `text-muted` + `opacity-40`, `rounded-2xl`. **Nenhum token novo necessário.** Se o Figma mostrar uma cor própria de placeholder, acrescentar exatamente um token com nome de papel (`--color-placeholder`) no `@theme`, nunca valor arbitrário.

### molecule `PostThumbnail`
```ts
type PostThumbnailProps = {
  src: string | null   // o thumbnailUrl da API
  alt: string          // '' no feed (decorativo ao lado de um link intitulado); descritivo no hero do detalhe
  priority?: boolean   // candidato a LCP: fetchPriority="high", sem lazy
  eager?: boolean      // acima da dobra mas não o LCP: sem lazy, prioridade normal
}
```
Cobre os **dois** casos de "thumbnail inexistente":
- **(a) `thumbnailUrl` null no banco** → renderiza `ThumbnailPlaceholder` direto. Nenhum `<img>`, nenhuma requisição, nenhum 404 no painel de rede.
- **(b) a URL existe mas falha em runtime** → `onError` no `<img>` guarda o src que falhou e troca pelo placeholder.

```tsx
const [failedSrc, setFailedSrc] = useState<string | null>(null)
if (src === null || failedSrc === src) return <ThumbnailPlaceholder />
return (
  <img src={src} alt={alt} width={640} height={360} decoding="async"
       className="aspect-video w-full rounded-2xl object-cover"
       loading={priority || eager ? undefined : 'lazy'}
       fetchPriority={priority ? 'high' : undefined}
       onError={() => setFailedSrc(src)} />
)
```
Guardar o *valor* do src que falhou (em vez de um booleano + `useEffect`) faz o estado se autoinvalidar quando `src` muda — sem efeito, sem bug de fallback preso. Os dois ramos renderizam a mesma caixa `aspect-video w-full`, então a troca não desloca nada. `alt` é obrigatório para cada chamador decidir explicitamente entre decorativo e informativo.

---

## 7. Tema e medidas (`apps/web/src/index.css`)

**Nenhum token novo de cor, fonte ou tipografia.** O feed se monta com a paleta existente: `bg-page` (fundo), `bg-surface` (cards e rail), `text-offwhite`/`text-muted` (texto), `text-primary` (destaques e curtida ativa), `text-ink` (texto sobre o verde), `text-danger` (erros). Os tamanhos de texto saem de `text-subtitle` (h1), `text-paragraph-lg` (h2 dos cards), `text-lg`, `text-paragraph-sm` e `text-label`.

Medidas do layout → token (**conferidas contra o Figma `155-3100` em 2026-10-16**; ver `plan/ComparacaoLayoutFigma.md` para tabela completa):

| Elemento | Valor de layout | Token | Status vs. Figma (2026-10-16) |
|---|---|---|---|
| Largura do rail lateral (desktop) | ~256px | `w-64` | ACEITAR — Figma 177px, mas nav horizontal×vertical é decisão de a11y |
| Largura máxima da coluna de conteúdo | ~1024px | `max-w-5xl` | ACEITAR — Figma 996px; sem token para 996px |
| Grid de cards | 1 / 2 / 3 colunas | `grid gap-6 md:grid-cols-2 xl:grid-cols-3` | ACEITAR — Figma mostra 2 colunas; 3 colunas em xl é melhoria |
| Gap entre cards | 24px | `gap-6` | ACEITAR ✅ — Figma `gap-[24px]` = 24px |
| Proporção da thumbnail | 16:9 | `aspect-video` | ACEITAR ✅ |
| Raio do card e da thumbnail | ~16px | `rounded-2xl` | ACEITAR — Figma 8px; delta = 8px (no threshold) |
| Espaçamento interno do card (body) | ~16px | `p-4` no content wrapper | CORRIGIDO 2026-10-16 — thumbnail agora flush ao topo; `p-4` aplicado apenas no content div abaixo da thumbnail |
| Gap interno card body | 16px | `gap-4` no content wrapper | CORRIGIDO 2026-10-16 — era `gap-3` (12px); agora `gap-4` (16px) = Figma `gap-[16px]` |
| Gap content column (busca ↔ cards) | 56px | `gap-14` | CORRIGIDO 2026-10-16 — era `gap-8` (32px); Figma `gap-[56px]` |
| Padding vertical `<main>` (desktop) | 56px | `md:py-14` | CORRIGIDO 2026-10-16 — era `md:py-10` (40px); Figma frame `py-[56px]` |
| Padding vertical sidebar (desktop) | 40px | `md:py-10` | CORRIGIDO 2026-10-16 — era `py-6` (24px) em todos os breakpoints |
| Gap logo → nav sidebar (desktop) | 80px | `md:gap-20` | CORRIGIDO 2026-10-16 — era `gap-6` (24px); Figma `gap-[80px]` |
| Alvo mínimo de botão de ícone | ≥ 40px | `px-4 py-3` no Button ghost (≈ 55px altura) | ACEITAR ✅ — WCAG 2.5.8 cumprido |
| Clamp de título / resumo | sem clamp | — | ACEITAR ✅ — WCAG 1.4.12 (remoção documentada na atualização de 2026-10-05) |

---

## 8. Frontend: componentes (`apps/web/src/`)

### Onde vive o estado de sessão — decisão

**Um hook `src/pages/useSession.ts`**, ao lado do `usePageMeta.ts`. Não um context.

```ts
export type Session = { isAuthenticated: boolean; signOut: () => void }
export function useSession(): Session
```
Implementação: `useState(() => getToken())`; `signOut()` → `clearToken()` + `setToken(null)`; listener de `storage` no `window` para duas abas não divergirem.

Justificativa:
- `src/components/` **não pode** importar `src/api/`, e `getToken` mora lá. Então a sessão é lida no nível de página e descida por props. O hook fica em `src/pages/`, que já é dono do `usePageMeta` e tem permissão de importar `src/api/`.
- Preserva o modelo atual ("ler `getToken()` por página") e dá um lugar só para a *transição* (`signOut`), que é a parte nova: antes nada podia deslogar no meio da página; agora um `401` de curtida ou comentário pode.
- Context é desnecessário porque os dois consumidores (`Sidebar` e os controles de curtir/comentar) estão na mesma subárvore de uma única página, e as páginas nunca coexistem. Promover a context só se um header global for içado para fora de `<Routes>` — anotar isso no comentário do hook.

A lógica de dados sai das páginas para **`src/pages/useFeed.ts`** e **`src/pages/usePostDetail.ts`** (também em `src/pages/`, então importar `src/api/` é legal). São donos do efeito com `AbortController`, do estado de loading/erro, da curtida otimista com rollback e do `isUnauthorized → session.signOut()`.

### Alterações em componentes existentes
- **`Icon`** — estender a união `IconName` e o `Record<IconName, ReactNode>` com `'heart'`, `'heart-filled'`, `'comment'`, `'search'`, `'logout'`, `'plus'`. Mesmo `viewBox="0 0 24 24"`, mesmo `aria-hidden`.
- **`Button`** — `variant?: 'primary' | 'ghost'`. Variante nova em vez de escape por `className`, respeitando a API atual. `aria-pressed` já passa pelas props nativas.
- **`Heading`** — **sem mudança.** O feed é `h1` + nove `h2` irmãos, o que é válido e limpo no axe. Nenhum `h3` necessário.

### Atoms novos
| Componente | Props | Compõe |
|---|---|---|
| `ThumbnailPlaceholder` | — | — |
| `Avatar` | `{ name: string; size?: 'sm' \| 'md' }` — iniciais num círculo `rounded-full bg-ink`, `aria-hidden` (o nome está ao lado) | — |
| `Textarea` | `{ invalid?: boolean }` + props nativas — espelha `Input` | — |

### Molecules novos
| Componente | Props | Compõe |
|---|---|---|
| `PostThumbnail` | ver passo 6 | `ThumbnailPlaceholder` |
| `PostMeta` | `{ authorName; createdAt; now? }` — `<time dateTime title={dataLonga}>há 2 dias</time>` | `Avatar` |
| `NavItem` | `{ to; icon; label; current? }` — define `aria-current="page"` | `TextLink`, `Icon` |
| `SessionLink` | `{ authenticated: boolean; onSignOut: () => void }` | `NavItem`, `Button`, `Icon` |
| `SearchField` | `{ id; label; defaultValue?; onSubmit: (q: string) => void }` | `Label`, `Input`, `Button`, `Icon` |
| `TextareaField` | `{ id; label; error?; hint? }` + props nativas — espelha `FormField` | `Label`, `Textarea`, `FormError` |
| `LikeButton` | `{ count; postTitle } & ({ authenticated: true; liked; pending?; onToggle } \| { authenticated: false })` | `Button`, `Icon`, `TextLink` |
| `CommentItem` | `{ authorName; createdAt; body }` | `PostMeta` |

**Requisito 4.5 — a troca Login/Sair** é o `SessionLink`:
- `authenticated === false` → `<NavItem to="/login" icon="login" label="Login" />`.
- `authenticated === true` → `Button variant="ghost"` com `Icon('logout')` e o texto "Sair", chamando `onSignOut`. **Botão, não link**, porque sair é ação com efeito, não navegação. O handler da página faz `session.signOut()` e `navigate('/')` — fica no feed já deslogado em vez de pular para `/login`, porque o feed é público (requisito 4.2).

**Requisito 4.2 — estados deslogados.** `LikeButton` com `authenticated: false` renderiza um **`TextLink` para `/login`** com `aria-label={`Entre para curtir o post ${postTitle}`}`, **não** um botão `disabled`. Dois motivos: botão desabilitado quebra o teste de Tab (passo 10) e um link é CTA muito melhor que um controle morto. `CommentForm` faz o mesmo: deslogado renderiza um parágrafo mais um `TextLink` para `/login` ("Entre para comentar."), sem `<textarea>` nenhum.

**Requisito 4.6 — o campo de busca.** `SearchField` é um `<form role="search">` de verdade, com `<Label htmlFor>`, `<Input type="search" name="q">` e botão de submit **rotulado por texto** ("Buscar"). **Dirigido por submit, sem debounce** — justificativa: a FTS roda no backend, submit evita tempestade de requisições e uma dependência nova de debounce, produz exatamente um anúncio previsível para leitor de tela, e deixa o termo viver na URL (`?q=`), então resultados são compartilháveis e Voltar/Avançar funcionam. Busca enquanto digita fica explicitamente descartada.

### Organisms novos
| Componente | Props | Compõe |
|---|---|---|
| `Sidebar` | `{ authenticated; onSignOut }` | `Logo`, `NavItem`, `SessionLink` |
| `PostCard` | `{ post; authenticated; priority?; eager?; onToggleLike; pending? }` | `PostThumbnail`, `Heading`, `PostMeta`, `LikeButton`, `TextLink`, `Icon` |
| `PostList` | `{ posts; authenticated; onToggleLike; pendingSlug? }` | `PostCard` |
| `PostArticle` | `{ post; authenticated; onToggleLike; pending? }` | `PostThumbnail`, `Heading`, `PostMeta`, `LikeButton` |
| `CommentList` | `{ comments }` | `CommentItem` |
| `CommentForm` | `{ authenticated; pending?; error?; onSubmit }` | `TextareaField`, `Button`, `FormError`, `TextLink` |
| `CreatePostForm` | `{ pending?; error?; onSubmit }` | `FormField`×2, `TextareaField`, `Button`, `FormError` |
| `Pagination` | `{ page; totalPages; buildHref }` | `TextLink` |

- **`Sidebar` é responsivo só por CSS — sem hambúrguer, sem disclosure.** `<nav aria-label="Menu principal">`: barra horizontal abaixo de `md`, rail vertical de `md` para cima. Evita de propósito botão de toggle, `aria-expanded`, tratamento de Esc e armadilha de foco — superfície de acessibilidade e paradas de Tab a mais sem ganho funcional. **Se o Figma exigir um drawer, isso muda.** Esconde "Perfil" e "Novo post" quando deslogado (ambas rotas privadas).
- **`PostCard` tem exatamente duas paradas de Tab** logado: o link do título (`Heading level={2}` envolvendo um `TextLink` para `/posts/<slug>`) e o controle de curtida. A **contagem de comentários é texto não interativo** (`Icon` + número num `<span>`), não link — escolha deliberada para manter sob controle a contagem de Tab e o espaço de nomes acessíveis (passo 10). Não existe link do card inteiro.
- **`PostArticle` renderiza `content` quebrando em linhas vazias para `<p>`.** Sem renderizador de markdown: nenhuma dependência nova, nenhum `dangerouslySetInnerHTML`, nenhuma superfície de XSS.
- **`Pagination` renderiza links, não botões**, para a página viver na URL; não renderiza nada quando `totalPages <= 1`.

### Template novo — requisito 4.4
`src/components/templates/FeedTemplate/`
```ts
type FeedTemplateProps = {
  title?: string          // o h1; omitido pela página do post
  authenticated: boolean
  onSignOut: () => void
  children: ReactNode
}
```
Compõe `Sidebar` + `Heading`. A estrutura espelha a forma do `CenteredTemplate`: casca flex, `<Sidebar>`, `<main>` com a coluna de conteúdo e `<Heading level={1}>{title}</Heading>` **só quando `title` é passado**.

- **O que o template tem:** a casca e o layout, a sidebar (e portanto a troca Login/Sair), o landmark `<main>` e o `h1` opcional.
- **O que cada página tem:** busca de dados, `usePageMeta`, estados de loading/erro/vazio e o próprio conteúdo. O feed tem `SearchField` + a região de anúncio + `PostList` + `Pagination`; o detalhe tem `PostArticle` + `CommentList` + `CommentForm`.

`title` é opcional justamente para o **`h1` da página de detalhe ser o título do post** (exigência de SEO) em vez de um cabeçalho genérico; nesse caso o `PostArticle` renderiza `Heading level={1}`. Assim as duas páginas satisfazem o `beforeEach` do `a11y.e2e.ts`, que espera um heading de nível 1.

**Descartado:** layout route do react-router. O projeto não tem layout routes, `AuthTemplate`/`CenteredTemplate` são componentes comuns que as páginas renderizam, e um layout route tornaria o `usePageMeta` por página e a descida de `authenticated` desconfortáveis. Mantém a convenção existente.

### Helper puro novo
`src/lib/formatRelativeTime.ts` — `formatRelativeTime(iso: string, now?: Date): string` com `new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })`: escolhe a maior unidade que serve (ano → mês → semana → dia → hora → minuto → segundo) e devolve `rtf.format(-n, unit)` → "há 2 dias". Zero dependências. `now` injetável para teste determinístico. **Pasta nova `src/lib/`** para funções puras que qualquer nível pode importar porque ela não importa nada — não é componente, então `atoms/` seria errado. Convenção pequena e nova, sinalizada aqui.

Consequência: o texto do `<time>` muda com o tempo real, então **o Playwright nunca deve asserir sobre o texto relativo visível**. O `PostMeta` também define `title` com a data absoluta (`Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })`), igual ao `ProfileCard`.

### Camada de API nova
- `src/api/posts.ts` — `listPosts({ q, page, perPage, signal })`, `getPost(slug, signal)`, `createPost(body)`, `likePost(slug)`, `unlikePost(slug)`.
- `src/api/comments.ts` — `listComments(slug, { page, signal })`, `createComment(slug, body)`.
- `src/api/types.ts` — `+ PostAuthor, FeedPost, PostDetail, Comment, Pagination, CollectionLinks, PostCollection, CommentCollection, CreatePostBody, CreateCommentBody`.
- `src/api/errors.ts` — caso **404** no `getErrorMessage` ("Conteúdo não encontrado.") e `isNotFound(error)` exportado.

### Páginas novas
- `src/pages/FeedPage/` — `useSearchParams()` para `q`/`page`, `useSession()`, `useFeed()`. Renderiza `FeedTemplate title="Feed"` + `SearchField` + região de anúncio + `PostList` + `Pagination`. Loading: `<p role="status" className="text-paragraph-sm text-muted">Carregando...</p>` (padrão do `ProfilePage`). Erro: `<FormError message={getErrorMessage(error)} />`. Vazio: "Nenhum post encontrado para «q»." / "Ainda não há posts."
- `src/pages/PostPage/` — `useParams()`, `usePostDetail()`, duas requisições (post e comentários, mantidas ortogonais para os comentários paginarem sozinhos). 404 renderiza um estado "Post não encontrado" com `TextLink` para `/`, **sem redirecionar**.
- `src/pages/NewPostPage/` — privada, seguindo o `ProfilePage` à risca: `if (!session.isAuthenticated) return <Navigate to="/login" replace />`. No sucesso, `navigate('/posts/' + created.slug)`.

---

## 9. Rotas, meta e SEO

### `src/App.tsx`
| Rota | Elemento | Pública? |
|---|---|---|
| `/` | `FeedPage` | sim — **substitui `LoginPage`** |
| `/posts/novo` | `NewPostPage` | não |
| `/posts/:slug` | `PostPage` | sim |
| `/login`, `/cadastro`, `/perfil` | sem mudança | |

Declarar `/posts/novo` antes de `/posts/:slug` por legibilidade (o react-router v8 já prefere o segmento estático). Sem rota `*` de 404 — fora de escopo, mas vale registrar. A proteção de slug reservado (`novo`) está no passo 3.

### `e2e/routes.ts`
Acrescentar **`{ name: 'Feed', path: '/' }`** apenas.

**A página de detalhe deliberadamente não entra.** O `a11y.e2e.ts` compara `document.title` com `^<Name>\b.*Code Connect`, e o título do detalhe é o título *do post* (`usePageMeta(post.title, ...)`). Colocá-la ali forçaria o `name` da rota a ser um título de post semeado — frágil, e prenderia um orçamento de Lighthouse a uma linha do seed. Ela ganha a suíte dedicada `e2e/post.e2e.ts` (passo 11).

### `playwright.config.ts` — API como segundo `webServer`
Decisão confirmada. Acrescentar uma segunda entrada em `webServer` subindo a API (`pnpm start:api` sobre um build, ou `pnpm dev:api`) com `VITE_API_URL` apontando para ela, e documentar `pnpm db:up && pnpm db:seed` como pré-requisito de `pnpm test:web:a11y`. O `lighthouserc.cjs` **não precisa de edição**: a regex dele pega `/` do `routes.ts` automaticamente, e passa a medir a página real.

### `public/llms.txt`
Sob `## Páginas`:
```
- [Feed](/): posts da comunidade, com busca por texto, curtidas e comentários.
```
mais uma linha de prosa dizendo que cada post tem página própria em `/posts/<slug>`. **Não** linkar um post semeado específico (é instância, não tipo de página).

### `public/robots.txt`
Manter `Disallow: /perfil`; acrescentar `Disallow: /posts/novo` (formulário privado, sem conteúdo indexável). `/` e `/posts/*` seguem permitidos.

### `usePageMeta` por página (pt-BR, 50–160 caracteres)
- **Feed** — `usePageMeta('Feed', 'Veja os posts da comunidade Code Connect, busque por tema e acompanhe os projetos compartilhados por pessoas desenvolvedoras.')`
- **Novo post** — `usePageMeta('Novo post', 'Publique um post no Code Connect com título, resumo, conteúdo e imagem de capa para compartilhar seu projeto com a comunidade.')`
- **Detalhe** — `usePageMeta(post?.title ?? 'Post', post?.excerpt ?? 'Leia o post completo no Code Connect, curta o conteúdo e participe da conversa com outras pessoas desenvolvedoras.')`. O `excerpt` é travado em 50–160 pelo DTO, então é sempre descrição válida; ainda assim aplicar `.slice(0, 160)` por segurança. `<title>`/`<meta>` do React 19 continuam proibidos.

---

## 10. Acessibilidade e performance

### A restrição decisiva: o teste de Tab

`apps/web/e2e/a11y.e2e.ts` (linhas 71–100) conta os controles com `a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])`, pressiona Tab essa quantidade de vezes, monta um **`Set` de *nomes acessíveis*** e asseta `reached.size === controls`. Daí saem três regras rígidas:

1. **Nomes acessíveis duplicados colapsam o `Set` e reprovam o teste.** Nove cards com um controle chamado "Curtir" = 1 entrada no `Set` para 9 controles. Todo controle por card **precisa** levar o título do post no `aria-label`.
2. **Botão `disabled` é contado pelo seletor mas não é focável**, então o laço cai em `document.body`, dá `break`, e `reached.size` nunca alcança `controls` → falha garantida. Por isso o estado deslogado de curtir e comentar usa **link**, não botão desabilitado.
3. Os títulos semeados precisam ser únicos, e nenhum controle da página pode dividir nome com outro (atenção ao "Login" da sidebar).

Escala não é problema: ~26 paradas × 3 viewports × 1 worker.

### Demais pontos de acessibilidade
- **Busca** — `<Label htmlFor="feed-search">Buscar posts</Label>` visível (`sr-only` só se o Figma for placeholder-only), `<form role="search">`, botão de submit rotulado por texto, não por ícone.
- **Anúncio de resultados** — `<p role="status" aria-live="polite">` renderizado na `FeedPage` **desde a primeira pintura, com texto vazio**, e preenchido depois com `"{n} posts encontrados para “{q}”"` / `"Nenhum post encontrado para “{q}”."`. Região `aria-live` inserida no DOM junto com o conteúdo frequentemente não anuncia. A região fica na página, não no `SearchField`, porque a semântica de resultado é de página.
- **Botão de curtir** — `aria-pressed={liked}` e `aria-label` com verbo, título do post e contagem: `"Curtir o post React Hooks na prática. 4 curtidas."` O `<span>` da contagem visível é `aria-hidden`. O título no rótulo é **obrigatório**, não enfeite (regra 1 acima).
- **Tamanho de alvo (WCAG 2.5.8, no conjunto AA das duas suítes)** — `Icon` `md` é `size-6` (24px); todo controle de ícone é `Button variant="ghost"` com padding até pelo menos `size-10` (40px).
- **Ordem de headings** — feed: `h1` "Feed" → nove `h2` irmãos, com a lista como `<ul aria-label="Posts do feed">` + `<li><article>`. Detalhe: `h1` título do post → `h2` "Comentários".
- **Nenhum controle `disabled` na renderização inicial.** `pending` desabilitado durante requisição em voo é aceitável; a suíte só exercita a página ociosa.

### Performance (metas: performance ≥ 0.9, LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms)
- **`perPage` padrão 9**, máximo 50. Um grid 3×3 limita o payload da página.
- **Escada de prioridade no `PostList`:** índice 0 → `priority` (`fetchPriority="high"`, sem `loading`); índices 1 e 2 → `eager` (sem `loading="lazy"`, prioridade normal, porque `lazy` acima da dobra atrasa o LCP); índice ≥ 3 → `loading="lazy"` + `decoding="async"`. Exatamente uma imagem por página recebe `fetchPriority="high"`, conforme a regra do projeto.
- **Com a decisão "só placeholder", o feed hoje não baixa imagem nenhuma** — os placeholders são SVG inline. O LCP passa a ser texto, o que torna as metas folgadas. A escada acima existe implementada e testada para quando as imagens reais entrarem; **é nesse momento que o risco de performance aparece de verdade**, e o próximo recurso seria `srcset`/`sizes`, que exige múltiplas renderizações por thumbnail. Não é de graça.
- **CLS:** toda thumbnail reserva `aspect-video w-full` com `width={640} height={360}` explícitos, o placeholder reserva caixa idêntica, e o texto do card é limitado por `line-clamp-2` (título) e `line-clamp-3` (resumo), então os cards ficam uniformes e nada reflui depois de a fonte Prompt carregar.
- **Reflow:** grid de coluna única em 320px.

---

## 11. Testes

### Specs unitárias da API (`src/**/*.spec.ts`)
- `posts.service.spec.ts` — ramo cronológico sem `q`; ramo com `q` chamando `$queryRaw` e **preservando a ordem de relevância depois do `IN`**; total `bigint` convertido para `number`; `q` só com espaços caindo no ramo cronológico; aritmética de paginação; `likedByMe` com e sem viewer; `P2002` → `ConflictException`; slug inexistente → `NotFoundException`; `PUT` curtir duas vezes → uma linha; `DELETE` sem curtida → não lança.
- `comments.service.spec.ts` — criar em post inexistente → 404; ordem e paginação da lista.
- `slug.spec.ts` — `'Olá, Mundo! 2026'` → `ola-mundo-2026`; acentos removidos; clamp em 160; **slug reservado `novo`**; sufixo em colisão.
- `entities/post.entity.spec.ts` — `createdAt.toISOString()`; os quatro `links`; `likeCount`/`commentCount` do `_count`; `likedByMe` do `likes.length`; `PostSummaryEntity` sem `content`.
- `auth/optional-auth.guard.spec.ts` — sem header → `true` e `user` undefined; Bearer válido → `user` preenchido; expirado / malformado / esquema não-Bearer → `true`, `user` undefined, **nunca lança**.
- `auth/bearer.spec.ts` — o helper extraído (e `auth.guard.spec.ts` segue verde).
- `common/pagination.spec.ts` — `self`/`next`/`prev`; `q` preservado e codificado; `prev: null` na página 1; `next: null` na última; `total: 0` → `totalPages: 1`.

### E2E da API (`test/*.e2e-spec.ts`)
`test/posts.e2e-spec.ts` e `test/comments.e2e-spec.ts`, com o padrão `createApp()` de `test/auth.e2e-spec.ts` (`AppModule` + `configureApp` + `setupSwagger` + `app.init()`), app novo por `beforeEach` e `resetDatabase`. Os usuários são criados via `POST /users`, então nenhuma spec depende de ordenação de id entre arquivos.

- `GET /posts` sem token → **200**, `data: []`, bloco de paginação presente, `links.self === '/posts?page=1&perPage=9'`.
- `POST /posts` sem token → **401**; com token → **201** e `res.headers.location === '/posts/<slug>'`.
- `GET /posts` com dois posts → mais novo primeiro; `likedByMe: false` anônimo; `true` para quem curtiu depois do `PUT`.
- `GET /posts?q=<termo>` → só os que casam; `?q=%20%20` → todos; `?q=!!!` → 200 e vazio; **`?q=react&foo=1` → 400** (fixa o comportamento do `forbidNonWhitelisted`).
- `PUT /posts/:slug/like` duas vezes → **204** nas duas e `likeCount === 1`.
- `DELETE /posts/:slug/like` sem ter curtido → **204**.
- curtir/descurtir slug inexistente → **404**; sem token → **401**.
- `POST /posts/:slug/comments` sem token → **401**; com token → **201** + `Location`; `body` acima de 1000 → **400** no formato do `ErrorResponseDto`; slug inexistente → **404**.
- `GET /posts/:slug/comments` pública → **200**, mais antigo primeiro.
- `GET /posts/:slug` inexistente → **404**.
- **Teste de fechamento**, espelhando o `auth.e2e-spec.ts`: `GET /api/docs-json` → `Object.keys(res.body.paths)` contém `/posts`, `/posts/{slug}`, `/posts/{slug}/like`, `/posts/{slug}/comments`, `/posts/{slug}/comments/{commentId}`.

**`test/db.ts` precisa ser atualizado**, senão os ids de post/comentário vazam entre arquivos:
```ts
await prisma.$executeRaw`TRUNCATE TABLE likes, comments, posts, users RESTART IDENTITY CASCADE`
```
(Listar as quatro explicitamente para toda sequência de identidade reiniciar, mesmo que o `CASCADE` as alcance.)

### Testes de componente web
Todo arquivo inclui o caso obrigatório `has no WCAG 2.2 AA violations` chamando `expectNoA11yViolations(container)`; o que renderiza `TextLink` usa `renderWithRouter`.

- `ThumbnailPlaceholder` — renderiza `svg`, é `aria-hidden`.
- `Avatar` — "Ana Souza" → "AS"; nome de uma palavra; `aria-hidden`.
- `Textarea` — `invalid` → `aria-invalid`; props repassadas.
- `Icon` / `Button` — **estendidos** para os nomes novos, para `variant="ghost"` e para o repasse de `aria-pressed`.
- `PostThumbnail` — `src=null` → placeholder e **nenhum `img` no DOM**; src válido → `img` com `width`/`height`/`loading="lazy"`; `priority` → `fetchpriority="high"` e sem `loading`; `fireEvent.error(img)` → troca para placeholder; mudar `src` limpa a falha.
- `PostMeta` — `dateTime` exato; rótulo relativo com `now` injetado.
- `NavItem` — `aria-current="page"` quando `current`.
- `SessionLink` — deslogado → link "Login" para `/login`; logado → botão "Sair" chamando `onSignOut`.
- `SearchField` — label ligado ao input; Enter submete; botão submete; termo vai aparado.
- `TextareaField` — espelha `FormField.test.tsx`: `aria-describedby`, `aria-invalid`, erro com `role="alert"`.
- `LikeButton` — autenticado: `aria-pressed` false→true, `onToggle` dispara, o nome acessível contém o título **e** a contagem; não autenticado: renderiza link para `/login` e **asseta que não existe botão desabilitado**.
- `CommentItem`, `CommentList` (estado vazio), `Pagination` (nada quando `totalPages <= 1`, label do `nav`, hrefs).
- `Sidebar` — nome acessível do `nav`; Perfil/Novo post escondidos deslogado.
- `PostCard` — título é `h2` linkando `/posts/<slug>`; contagem de comentários é texto, **não** link; exatamente dois controles focáveis quando autenticado.
- `PostList` — estrutura `ul`/`li`; só o primeiro card recebe `fetchpriority="high"`; índices 0–2 não são lazy, 3+ são.
- `PostArticle` — `h1` é o título; conteúdo quebrado em `<p>` por linha vazia.
- `CommentForm` — não autenticado → link CTA e **nenhum textarea**; autenticado → submete corpo aparado, bloqueia vazio, renderiza `error`.
- `CreatePostForm` — erros de campo obrigatório; payload do submit.
- `FeedTemplate` — renderiza o `h1` com `title` e nenhum sem; renderiza a sidebar; um único landmark `main`.
- `lib/formatRelativeTime.test.ts` — fronteiras (30s, 59s, 90min, 25h, 8 dias, 40 dias, 400 dias) com `now` injetado.

### Testes de página web (`vi.mock` em `src/api/posts` e `src/api/comments`)
- `useSession.test.ts` — lê o token armazenado; `signOut` limpa e inverte `isAuthenticated`; reage a evento `storage`.
- `useFeed.test.ts` / `usePostDetail.test.ts` — aborta no unmount; curtida otimista e rollback na falha; `isUnauthorized` → `signOut`.
- `FeedPage.test.tsx` — loading → lista; submit de busca atualiza a URL e refaz a busca; mensagem de vazio cita o termo; estado de erro; curtida otimista; **`401` na curtida desloga e a sidebar vira "Login"**; título e descrição definidos.
- `PostPage.test.tsx` — renderiza post e comentários; estado 404; submit de comentário insere na lista; deslogado mostra CTA em vez do formulário.
- `NewPostPage.test.tsx` — redireciona para `/login` sem token; submete e navega para o slug novo.

### Playwright
- `e2e/routes.ts` += `{ name: 'Feed', path: '/' }` → entra automaticamente em `a11y.e2e.ts`, `seo.e2e.ts` e `lighthouserc.cjs`, agora contra a API real (passo 9).
- **`e2e/post.e2e.ts`** (nova, dedicada por causa do conflito da regex de título) — mocks `page.route` para `**/posts/*` e `**/posts/*/comments` (OPTIONS 204 com headers de CORS + GET 200 JSON, exatamente o padrão do `profile.e2e.ts`). Asseta axe AA, reflow em 320px, título igual ao do post mockado, e com `sessionStorage` falso o `aria-pressed` da curtida alterna e o formulário de comentário existe; sem token, o link CTA substitui o formulário. **Nunca asseta sobre texto de tempo relativo.**
- **`e2e/feed-session.e2e.ts`** (nova) — requisito 4.5 de ponta a ponta: sem token a sidebar mostra "Login"; com token falso mostra "Sair"; clicar em "Sair" volta ao estado "Login" e **permanece em `/`**.

---

## 12. Commits (Conventional Commits)

**API**
1. `feat(api): add post, comment and like models with portuguese full-text search`
2. `refactor(api): extract bearer token parsing from AuthGuard`
3. `feat(api): add OptionalAuthGuard for public routes with viewer context`
4. `refactor(api): share the trim transform and add pagination helpers`
5. `feat(api): add posts endpoints with full-text search and pagination`
6. `feat(api): add idempotent post like endpoints`
7. `feat(api): add post comments endpoints`
8. `test(api): cover the posts and comments endpoints end to end` (inclui o `TRUNCATE` do `test/db.ts`)
9. `chore(root): allow esbuild builds and add the db:seed script`
10. `feat(api): seed the database with mock posts, comments and likes`

**Web**
11. `feat(web): add post and comment API clients`
12. `feat(web): add the useSession hook`
13. `feat(web): add relative time formatting`
14. `feat(web): add feed icons and a ghost button variant`
15. `feat(web): add the Avatar, Textarea and ThumbnailPlaceholder atoms`
16. `feat(web): add the PostThumbnail molecule with a placeholder fallback`
17. `feat(web): add the PostMeta, NavItem and SessionLink molecules`
18. `feat(web): add the SearchField and TextareaField molecules`
19. `feat(web): add the LikeButton and CommentItem molecules`
20. `feat(web): add the Sidebar organism with the login and logout switch`
21. `feat(web): add the PostCard and PostList organisms`
22. `feat(web): add the PostArticle and Pagination organisms`
23. `feat(web): add the CommentList and CommentForm organisms`
24. `feat(web): add the CreatePostForm organism`
25. `feat(web): add the FeedTemplate shared by the feed and post pages`
26. `feat(web): add the feed page with backend full-text search`
27. `feat(web): add the post detail page with likes and comments`
28. `feat(web): add the new post page`
29. `test(web): run the api in the browser suites and cover the feed and post pages`
30. `docs(web): list the feed in llms.txt and block the new post page in robots.txt`

Cada commit de componente inclui o teste dele.

---

## Verificação

### Automática
1. `pnpm db:up` → container `healthy`.
2. `pnpm db:migrate` → migration `create_posts_comments_likes` aplicada. Conferir no `pnpm db:studio` ou no `psql` que `posts.search_vector` é `GENERATED ALWAYS AS ... STORED` e que `posts_search_vector_idx` é GIN.
3. `pnpm db:seed` → 3 usuários, 12 posts, ~20 comentários e as curtidas. Rodar **duas vezes** e confirmar que não duplica nem reordena.
4. `pnpm test:api` e `pnpm test:api:e2e` → tudo passando.
5. `pnpm test:web` → todos os componentes, inclusive os casos de axe.
6. `pnpm lint` e `pnpm build` (o `tsc -b` tem que passar).
7. `pnpm test:web:a11y` → **exige `pnpm db:up && pnpm db:seed` antes**, agora que a API sobe junto. 3 larguras × as rotas de `routes.ts`, mais `post.e2e.ts` e `feed-session.e2e.ts`.

### Manual no navegador (`pnpm dev`)
8. Deslogado em `/`: os posts aparecem, a busca funciona, o card com `thumbnailUrl` null mostra o placeholder e o com URL quebrada **também** (conferir no painel de rede: um 404 de imagem no segundo caso, nenhuma requisição no primeiro). A sidebar mostra **"Login"**. Curtir e comentar aparecem como CTA para `/login`, não como controles mortos.
9. Entrar com `ana.souza@example.com` / `CodeConnect123`: a sidebar vira **"Sair"**, curtir alterna com resposta imediata, recarregar mantém o estado, comentar insere na lista, publicar um post leva para `/posts/<slug>`.
10. Clicar em "Sair": volta ao estado deslogado **sem sair de `/`**.
11. Busca: um termo com acento e stemming (ex.: "componentes" achando "componente"), um termo sem resultado, `?q=!!!`, e um termo com paginação. Conferir que o termo e a página vivem na URL e que Voltar/Avançar funcionam.
12. Comparar `/` e `/posts/<slug>` em 1440px, 768px e 360px com o frame do Figma `155-3100` (**depois de autorizar o conector**) e corrigir a tabela de medidas do passo 7 se divergir.

### Acessibilidade manual (exigida pelo CLAUDE.md)
13. Navegar o feed e o detalhe **só pelo teclado**: toda parada tem foco visível, o `aria-pressed` da curtida é anunciado, o link do título do card leva ao post.
14. **NVDA**: conferir o anúncio da região de resultados depois de buscar, o nome acessível do botão de curtir (com título do post e contagem) e a ordem de leitura dos cards.
15. **Zoom 200%** no feed e no detalhe: nada cortado, nenhuma rolagem horizontal.

### Lighthouse
16. Rodar o workflow (`gh workflow run lighthouse.yml`) e registrar neste arquivo a tabela por rota, no formato do `IntegracaoFrontBack.md`:

| Rota | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` | | | | | | | |
| `/login` | | | | | | | |
| `/cadastro` | | | | | | | |

---

## Regras do projeto que este plano força (explícito)

1. **O teste de Tab é sensível a nome e hostil a `disabled`.** Nomes acessíveis únicos em todo controle são obrigatórios, e nenhum controle desabilitado pode existir na renderização inicial. Isso ditou duas decisões de componente: o *link* de curtir deslogado e a contagem de comentários não interativa.
2. **`forbidNonWhitelisted` em DTO de query transforma qualquer parâmetro desconhecido em 400.** Documentado e fixado por teste e2e.
3. **O Prisma não modela `tsvector` gerado.** Exige uma migration editada à mão permanentemente, o fluxo `--create-only` escrito na documentação, e um campo `Unsupported` que existe só para evitar drift.
4. **"Componentes nunca importam `src/api/`" + "páginas buscam dados"** empurra sessão, curtida e comentário para handlers de página. Mitigado por `useFeed`/`usePostDetail`/`useSession` em `src/pages/`.
5. **Lighthouse num feed de imagens.** Hoje folgado porque não há thumbnail real (decisão "só placeholder"); o risco volta quando as imagens entrarem, e o recurso seguinte (`srcset`) não é de graça.
6. **`pnpm test:web:a11y` passa a exigir Postgres**, local e no CI, por causa da decisão de subir a API no Playwright.
7. **Convenção nova: `src/lib/`** para helpers puros sem dependência.
8. **Figma não lido.** As medidas do passo 7 vêm do layout canônico e precisam de conferência; o Sidebar foi desenhado como barra→rail só com CSS, e **se o Figma exigir um drawer com hambúrguer isso muda** (toggle, `aria-expanded`, Esc, armadilha de foco e paradas de Tab a mais).
