# Banco de Dados e Persistencia (Prisma + PostgreSQL)

> **Publico-alvo:** analistas juniores / trainees.

## Conceito Teorico

### Por que um banco de dados relacional?

Imagine uma planilha enorme que guarda todas as informacoes do seu sistema: usuarios, posts, comentarios, curtidas. Com o tempo essa planilha fica impossivel de gerenciar: linhas duplicadas, dados inconsistentes, dificuldade de buscar com eficiencia. Um banco de dados relacional resolve isso organizando os dados em **tabelas** separadas com **relacionamentos** formais entre elas — como uma rede de planilhas que conversam entre si de forma segura.

O **PostgreSQL** foi escolhido porque:
- E gratuito, open-source e usado em producao por empresas de todos os portes.
- Tem suporte nativo a **full-text search** em portugues — sem instalar extensao extra.
- Suporta colunas **geradas** (`GENERATED ALWAYS AS`), que automaticamente calculam e atualizam um valor derivado de outras colunas.
- E robusto, maduro (35+ anos) e tem tipagem rigorosa.

### O que e um ORM e por que o Prisma?

ORM (Object-Relational Mapper) e uma camada de codigo que traduz operacoes em objetos JavaScript/TypeScript em consultas SQL. Em vez de escrever `SELECT * FROM posts WHERE slug = 'meu-post'`, voce escreve `prisma.post.findUnique({ where: { slug: 'meu-post' } })`.

O **Prisma** foi escolhido porque:
- O **schema.prisma** e a fonte unica de verdade: define os modelos, os tipos TypeScript gerados e as migracoes SQL a partir de um unico arquivo.
- Gera tipos TypeScript automaticamente, o que significa que o compilador detecta erros de consulta antes de o codigo chegar ao banco.
- O cliente Prisma 7 usa um **driver externo** (`@prisma/adapter-pg`) em vez de um binario nativo, o que simplifica deploy em containers.

### Migracoes: versionando o schema como codigo

Uma **migration** e um arquivo SQL que descreve como o banco muda de uma versao para a proxima. O Prisma gera esse arquivo automaticamente ao rodar `pnpm db:migrate`. A regra de ouro e simples: **nunca edite uma migration depois que ela foi aplicada** em qualquer ambiente fora da sua maquina. Se algo precisa mudar, cria-se uma nova migration.

### Full-text search: busca inteligente por texto

Busca por `LIKE '%componente%'` e ineficiente e burra: ela nao conhece sinonimos, nao aplica stemming (buscar "componente" e encontrar "componentes") e nao ranqueia resultados por relevancia.

O PostgreSQL resolve isso com **`tsvector`**: um vetor de lexemas (palavras na forma raiz) que o banco indexa com um indice GIN. A busca usa `websearch_to_tsquery`, que converte texto livre do usuario em uma consulta segura. Configurando `'portuguese'` como lingua, o banco usa as regras morfologicas do portugues.

---

## Aplicacao no Code Connect

### Design do Schema: PascalCase no Prisma, snake_case no banco

O Prisma usa convencoes do JavaScript (camelCase/PascalCase) nos modelos, mas o PostgreSQL usa snake_case por convencao. O projeto reconcilia as duas com as diretivas `@@map` (para o nome da tabela) e `@map` (para o nome da coluna):

```prisma
// apps/api/prisma/schema.prisma

model User {
  passwordHash String?  @map("password_hash")   // coluna: password_hash
  createdAt    DateTime @map("created_at")       // coluna: created_at

  @@map("users")  // tabela: users (nao "User")
}
```

Isso significa que o codigo TypeScript acessa `user.passwordHash` mas o SQL resultante usa `password_hash`. Nao e necessario escrever SQL para fazer isso: o Prisma cuida da traducao.

### Os 5 modelos e seus relacionamentos

O schema define 5 modelos principais com as seguintes responsabilidades:

**`User`** — conta de usuario do sistema.
- `id`: chave primaria autoincrementada (`SERIAL`).
- `email`: unico no banco (`@unique`), limitado a 254 caracteres (maximo valido de um e-mail RFC 5321).
- `passwordHash`: campo **opcional** (`String?`). Um usuario criado via login social (Google) nao tem senha local — o campo fica `null`.
- Relacionamentos: um usuario tem muitos posts, comentarios, curtidas e identidades OIDC.

**`OidcIdentity`** — vinculo entre um usuario e uma conta Google/Microsoft.
- `provider`: `"google"` ou `"microsoft"`.
- `providerSub`: o identificador estavel da conta no provedor (campo `sub` do JWT de identidade).
- Restricao `@@unique([provider, providerSub])`: uma mesma conta Google so pode estar vinculada a **um** usuario. Se um segundo usuario tentar vincular a mesma conta, o banco rejeita com erro de unicidade.
- `onDelete: Cascade`: se o usuario for deletado, suas identidades OIDC sao deletadas automaticamente.

**`Post`** — artigo do blog.
- `slug`: identificador URL amigavel, unico (`@unique`). Gerado automaticamente a partir do titulo pela funcao `uniqueSlug`.
- `thumbnailUrl`: opcional (`String?`). O frontend trata os casos de `null` e de URL invalida separadamente.
- `searchVector`: coluna do tipo `Unsupported("tsvector")`. O Prisma nao sabe gerar essa coluna, entao ela e declarada apenas para evitar que o `migrate dev` a trate como "drift" e tente remover. O DDL real e escrito a mao na migration (veja a secao FTS abaixo).
- Indice composto: `@@index([createdAt(sort: Desc), id(sort: Desc)])` garante paginacao eficiente do feed mais recente.

**`Comment`** — comentario em um post.
- Chave primaria sintetica (`id SERIAL`): comentarios tem identidade propria — um comentario pode ser editado, moderado, respondido no futuro.
- `onDelete: Cascade` em ambas as FK (`postId` e `authorId`): se o post ou o usuario forem deletados, os comentarios somem junto.

**`Like`** — curtida de um usuario em um post.
- **Sem `id` sintetico**: a chave primaria e composta por `(postId, userId)`.

```prisma
// apps/api/prisma/schema.prisma — linhas 108-110

  @@id([postId, userId])
  @@index([userId])
  @@map("likes")
```

### Por que a chave primaria composta no Like?

Um "like" nao tem identidade propria: ele e definido *exatamente* pela combinacao de quem curtiu e o que foi curtido. Usar um `id SERIAL` criaria uma coluna que nao representa nada semantico — seria so ruido no schema.

A chave composta da dois beneficios de graca:
1. **Restricao de unicidade**: o banco rejeita automaticamente um segundo like do mesmo usuario no mesmo post — sem precisar de `UNIQUE INDEX` separado.
2. **Indice de lookup gratuito**: buscar `WHERE post_id = X AND user_id = Y` usa a primary key diretamente, sem indice extra.

Na pratica, o `PostsService` usa `createMany({ skipDuplicates: true })` para tornar o "curtir" idempotente — um duplo clique nunca gera erro 409:

```typescript
// apps/api/src/posts/posts.service.ts — linha 184

await this.prisma.like.createMany({
  data: [{ postId, userId }],
  skipDuplicates: true,
});
```

### Full-text search: a migration editada a mao

O Prisma nao consegue expressar colunas `GENERATED ALWAYS AS` no schema. O fluxo foi:
1. Adicionar `searchVector Unsupported("tsvector")?` no schema (so para o Prisma nao remover a coluna como drift).
2. Rodar `pnpm db:migrate --create-only` para gerar o arquivo SQL sem aplica-lo.
3. Editar o SQL manualmente para substituir a coluna simples pela expressao gerada.
4. Aplicar com `pnpm db:migrate`.

O SQL final na migration:

```sql
-- apps/api/prisma/migrations/20261005193414_create_posts_comments_likes/migration.sql — linhas 22-26

"search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese'::regconfig, coalesce("title", '')),   'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce("content", '')), 'C')
) STORED,
```

Detalhes tecnicos:
- **`setweight('A'/'B'/'C')`**: da pesos diferentes a cada campo. Uma correspondencia no titulo ranqueia mais alto que uma no corpo do texto.
- **`'portuguese'::regconfig`**: o cast `::regconfig` e obrigatorio porque `to_tsvector(text)` e `STABLE`, nao `IMMUTABLE`, e o Postgres rejeita funcoes `STABLE` em colunas geradas.
- **`STORED`**: o vetor e calculado e armazenado fisicamente no disco a cada `INSERT`/`UPDATE`. Nao ha trigger.
- O indice GIN na migration: `CREATE INDEX posts_search_vector_idx ON "posts" USING GIN ("search_vector")` — necessario para que a busca `@@` seja eficiente.

### Como a busca funciona no PostsService

A busca e dividida em duas etapas para manter type safety:

```typescript
// apps/api/src/posts/posts.service.ts — linhas 100-111

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
`;
```

**Etapa 1 (raw SQL)**: descobre quais IDs correspondem a busca e em que ordem, incluindo o total de resultados via `count(*) OVER ()` (window function — nao precisa de query separada para contar).

**Etapa 2 (Prisma ORM)**: hidrata os IDs com todos os campos e relacionamentos de forma type-safe:

```typescript
// apps/api/src/posts/posts.service.ts — linhas 122-124

const found = await this.prisma.post.findMany({
  where: { id: { in: ids } },
  select: feedSelect(viewerId),
});
```

**Por que `websearch_to_tsquery` e nao `to_tsquery`?** Porque `to_tsquery` levanta um erro de sintaxe se o usuario digitar pontuacao solta como `!!!`. O `websearch_to_tsquery` simplesmente devolve uma consulta vazia, que nao casa com nada — sem 500.

**Cuidado com BigInt**: `count(*)` retorna `int8` no Postgres, que o driver converte para `BigInt` no JavaScript. `JSON.stringify` nao consegue serializar `BigInt`, entao o campo `total` e convertido explicitamente com `Number(firstRanked.total)`.

### PrismaService: modulo global e ciclo de vida

```typescript
// apps/api/src/prisma/prisma.service.ts

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- **`extends PrismaClient`**: o service herda todos os metodos do cliente (`prisma.post.findMany`, etc.). Qualquer service que injeta `PrismaService` tem acesso direto.
- **`OnModuleInit`**: conecta ao banco quando o modulo e inicializado. Se o banco estiver fora do ar, a API falha imediatamente na subida em vez de na primeira requisicao.
- **`OnModuleDestroy`**: desconecta graciosamente quando o NestJS encerra o processo. Evita conexoes "penduradas" no pool.
- **`omit: { user: { passwordHash: true } }`**: **defesa em profundidade**. Por padrao, toda consulta que retorna um `User` omite o campo `passwordHash`. O unico lugar que precisa desse campo (`UsersService.findByEmail` para verificar login) passa um `omit: { passwordHash: false }` explicito. Sem isso, uma funcao que logasse ou serializasse um usuario poderia vazar o hash acidentalmente.

```typescript
// apps/api/src/prisma/prisma.module.ts

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

O `@Global()` faz com que o `PrismaModule` seja importado uma so vez (no `AppModule`) e o `PrismaService` fique disponivel para **todos os outros modulos** sem precisar re-importar.

### Seed: populando o banco de desenvolvimento com seguranca

O `seed.ts` tem guardas para evitar acidentes:

```typescript
// apps/api/prisma/seed.ts — linhas 17-41

function assertSafeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set to seed the database');

  if (url === process.env.TEST_DATABASE_URL)
    throw new Error('refusing to seed the test database: ...');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== '1')
    throw new Error('refusing to seed a production database');

  const { hostname } = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname) && process.env.ALLOW_REMOTE_SEED !== '1')
    throw new Error(`refusing to seed a non-local database (${hostname})`);

  return url;
}
```

Tres verificacoes:
1. **Recusa o banco de testes**: o suite e2e trunca tabelas e reinicia sequencias a partir de 1. Semear dados ali quebraria os testes.
2. **Recusa producao**: qualquer ambiente com `NODE_ENV=production` exige a variavel `ALLOW_PRODUCTION_SEED=1` explicitamente. Isso impede que um `pnpm db:seed` acidental apague dados reais.
3. **Recusa banco remoto**: so aceita `localhost`, `127.0.0.1` ou `::1` por padrao. Um banco em um servidor remoto exige `ALLOW_REMOTE_SEED=1`.

O seed usa `upsert` em vez de `create` para ser **idempotente**: rodar duas vezes nao duplica dados. A excecao sao os comentarios, que sao deletados e recriados para o subset de posts gerenciados pelo seed (comentarios criados manualmente pelo desenvolvedor em outros posts sobrevivem).

### Isolamento do banco de testes

O suite e2e nao pode tocar o banco de desenvolvimento porque trunca todas as tabelas entre testes. A estrategia usa uma segunda URL de banco:

```typescript
// apps/api/test/global-setup.ts

export default function setup(): void {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set...');
  if (testUrl === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
```

O `global-setup` roda **uma vez antes de todos os testes**: aplica as migrations no banco de teste (garantindo que o schema esteja atualizado) e verifica que as duas URLs sao diferentes.

Entre cada arquivo de teste, `resetDatabase` trunca tudo e reinicia as sequencias:

```typescript
// apps/api/test/db.ts

await prisma.$executeRaw`
  TRUNCATE TABLE likes, comments, posts, oidc_identities, users RESTART IDENTITY CASCADE
`;
```

- **`RESTART IDENTITY`**: reinicia os contadores `SERIAL` para 1. Sem isso, um teste que espera `id = 1` falharia a partir da segunda execucao.
- **`CASCADE`**: deleta registros dependentes em cascata.
- **Ordem explicita das tabelas**: `likes, comments, posts, oidc_identities, users` — da mais dependente para a menos dependente — evita erros de FK durante o truncate.

### Raw SQL: apenas via tagged template

O Prisma expoe `$queryRaw` e `$executeRaw` para SQL manual. A regra e: **sempre use a sintaxe de tagged template** (template literal com crase), nunca concatenacao de strings:

```typescript
// CORRETO — cada ${...} vira um parametro vinculado ($1, $2, ...)
const result = await prisma.$queryRaw`SELECT * FROM posts WHERE id = ${id}`;

// ERRADO — SQL injection!
const result = await prisma.$queryRaw(`SELECT * FROM posts WHERE id = ${id}`);
```

Quando o template literal e usado, o Prisma converte cada interpolacao em um parametro `$N` enviado separadamente ao Postgres. O banco nunca interpreta os dados do usuario como SQL. A versao com string comum concatena diretamente, abrindo espaco para SQL injection.

A unica excecao no projeto e o literal `'portuguese'` na query de busca: um `regconfig` nao pode ser parametrizado pelo Postgres, portanto e um literal SQL, nao dados do usuario — e e documentado no codigo.

---

## Erros Comuns e Armadilhas

### 1. Editar uma migration ja aplicada

**Problema**: voce edita o arquivo SQL de uma migration que ja foi aplicada em outro ambiente (colega de equipe, CI, staging). O Prisma detecta que o hash do arquivo mudou e recusa-se a aplicar novas migrations com o erro `Drift detected`.

**Solucao**: nunca edite migrations apos aplica-las. Para corrigir algo, crie uma nova migration com `pnpm db:migrate`.

### 2. Esquecer o RESTART IDENTITY no truncate de testes

**Problema**: o primeiro arquivo de teste insere um usuario e o `id` fica em `1`. O segundo arquivo trunca sem `RESTART IDENTITY`, insere outro usuario e o `id` fica em `2`. Um teste que espera `userId = 1` quebra.

**Solucao**: sempre use `TRUNCATE ... RESTART IDENTITY CASCADE` na funcao `resetDatabase`.

### 3. Usar `$queryRaw` com string interpolada

**Problema**: `prisma.$queryRaw(`SELECT ... WHERE id = ${req.params.id}`)` concatena diretamente, abrindo SQL injection.

**Solucao**: use a sintaxe de tagged template: `` prisma.$queryRaw`SELECT ... WHERE id = ${id}` ``.

### 4. Esquecer de converter BigInt do count(*)

**Problema**: `count(*) OVER ()` retorna `bigint` no Postgres, que o driver JavaScript representa como `BigInt`. `JSON.stringify` lanca `TypeError: Do not know how to serialize a BigInt` quando um `BigInt` chega no corpo da resposta HTTP.

**Solucao**: converta explicitamente: `const total = Number(firstRanked.total)`.

### 5. Omit global do passwordHash nao ativo no contexto de teste

**Problema**: um teste instancia um `PrismaClient` diretamente (sem passar pelo `PrismaService`) e o `omit` global nao esta configurado. Uma query de usuario retorna o `passwordHash` inesperadamente.

**Solucao**: em testes e2e, sempre acesse o banco via `app.get(PrismaService)`, nunca crie um `PrismaClient` avulso.

### 6. Semear o banco de testes acidentalmente

**Problema**: rodar `pnpm db:seed` com `DATABASE_URL` apontando para o banco de testes trunca o estado que os testes esperam.

**Solucao**: o `seed.ts` ja verifica `url === process.env.TEST_DATABASE_URL` e lanca um erro. Mantenha sempre as duas variaveis configuradas corretamente no `.env`.

### 7. Usar `to_tsquery` em vez de `websearch_to_tsquery`

**Problema**: um usuario digita `!!!` ou `react &&` na busca. `to_tsquery` lanca um erro de sintaxe SQL que sobe como HTTP 500.

**Solucao**: `websearch_to_tsquery` aceita qualquer entrada do usuario: pontuacao solta e ignorada e a funcao devolve uma consulta vazia que simplesmente nao casa com nada.

### 8. Omitir a ordem explicita apos `findMany` com `IN`

**Problema**: `prisma.post.findMany({ where: { id: { in: ids } } })` nao garante que os resultados seguem a ordem de `ids`. O banco pode devolver em qualquer ordem.

**Solucao**: apos o `findMany`, restaure manualmente a ordem usando um `Map`:

```typescript
// apps/api/src/posts/posts.service.ts — linhas 128-132

const byId = new Map(found.map((post) => [post.id, post]));
const rows = ids
  .map((id) => byId.get(id))
  .filter((post): post is PostRecord => post !== undefined);
```

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Definicao dos 5 modelos | [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) | Linhas 1-111 |
| Chave primaria composta do Like | [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) | Linha 108 — `@@id([postId, userId])` |
| Campo `searchVector` declarado como Unsupported | [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) | Linha 70 |
| Mapeamento snake_case com `@@map` / `@map` | [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) | Exemplos em todos os modelos |
| DDL da coluna gerada `search_vector` | [apps/api/prisma/migrations/20261005193414_create_posts_comments_likes/migration.sql](../../apps/api/prisma/migrations/20261005193414_create_posts_comments_likes/migration.sql) | Linhas 22-28 |
| Indice GIN para full-text search | [apps/api/prisma/migrations/20261005193414_create_posts_comments_likes/migration.sql](../../apps/api/prisma/migrations/20261005193414_create_posts_comments_likes/migration.sql) | Linha 62 |
| PrismaService: connect/disconnect + omit global | [apps/api/src/prisma/prisma.service.ts](../../apps/api/src/prisma/prisma.service.ts) | Linhas 1-32 |
| PrismaModule como modulo global | [apps/api/src/prisma/prisma.module.ts](../../apps/api/src/prisma/prisma.module.ts) | Linhas 1-9 |
| Busca FTS com raw SQL + hidracao ORM | [apps/api/src/posts/posts.service.ts](../../apps/api/src/posts/posts.service.ts) | Linhas 87-133 |
| Like idempotente com `skipDuplicates` | [apps/api/src/posts/posts.service.ts](../../apps/api/src/posts/posts.service.ts) | Linhas 182-188 |
| Restauracao de ordem apos `IN` | [apps/api/src/posts/posts.service.ts](../../apps/api/src/posts/posts.service.ts) | Linhas 128-132 |
| Guardas de seguranca do seed | [apps/api/prisma/seed.ts](../../apps/api/prisma/seed.ts) | Linhas 17-41 |
| Seed idempotente com `upsert` | [apps/api/prisma/seed.ts](../../apps/api/prisma/seed.ts) | Linhas 365-406 |
| Global setup: migracao e verificacao de URLs | [apps/api/test/global-setup.ts](../../apps/api/test/global-setup.ts) | Linhas 1-19 |
| resetDatabase: TRUNCATE RESTART IDENTITY | [apps/api/test/db.ts](../../apps/api/test/db.ts) | Linhas 5-11 |

---

_Ultima atualizacao: 2026-10-09 | Gerado a partir do codigo-fonte._
