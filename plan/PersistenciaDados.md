# Plano: Persistência de Dados com PostgreSQL (apps/api)

## Contexto
O `UsersService` (`apps/api/src/users/users.service.ts`) guarda os usuários num array em memória (`private readonly users: StoredUser[]`, `nextId`). Tudo some quando a API reinicia: no teste com o Postman, cada restart apagava os cadastros. O `plan/AutenticacaoUsuario.md` já previa trocar o array por um banco, e isolou o armazenamento no service para isso.

Objetivo: persistir os usuários num **PostgreSQL** rodando em **Docker** (na raiz do monorepo, com volume), acessado por um **ORM**, sem mudar o contrato HTTP. Rotas, status codes, Swagger e o formato das respostas continuam iguais.

## Decisão: ORM → **Prisma (v7)**

| Ferramenta | Avaliação |
|---|---|
| **Prisma** ✅ | Receita oficial na doc do NestJS. O schema fica num arquivo único e legível (`schema.prisma`). Migrações SQL são geradas e versionadas no git. O client é gerado e tipado de ponta a ponta. Tem o **Prisma Studio** para ver os dados, que resolve a dúvida de "verificar se o usuário foi criado". A v7 não tem engine Rust (é TS puro), e o gerador `prisma-client` produz ESM com extensão `.js` configurável, o que encaixa no `module: nodenext` da API. **Não usa decorators**, então não depende de `emitDecoratorMetadata` no transformador do Vitest. |
| Drizzle | Segunda opção, bem próxima. Leve, sem codegen, API parecida com SQL. Perdeu porque não tem integração oficial com o Nest, o `drizzle-kit` é mais manual para migrações, e a API exige saber SQL desde o início. |
| TypeORM | Escolha clássica do Nest (`@nestjs/typeorm`). Perdeu porque depende de decorators e de `reflect-metadata` para inferir colunas (frágil sob o Vitest sem `nest build`), tem tipagem fraca em `find`/relations, histórico de problemas com ESM (carregamento de entidades por glob) e manutenção mais lenta. |
| MikroORM | Unit of Work e Identity Map são bons, mas também depende de decorators e é complexo demais para um CRUD de usuários. |
| Sequelize | Suporte a TypeScript fraco (tipos manuais). |
| Kysely | É query builder, não ORM: não tem schema nem migrações próprias. |

Custos aceitos: o client precisa ser gerado (`prisma generate`, no `postinstall` e no `build`), e o erro de duplicidade vem como `PrismaClientKnownRequestError` com código `P2002`, que é mapeado para `409`.

## 1. Docker: PostgreSQL na raiz
- **`docker-compose.yml`** (raiz):
  - serviço `postgres` com `image: postgres:18-alpine` e `container_name: code-connect-postgres`;
  - `environment`: `POSTGRES_USER: ${POSTGRES_USER:-codeconnect}`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env}`, `POSTGRES_DB: ${POSTGRES_DB:-codeconnect}`;
  - `ports: "127.0.0.1:5432:5432"`, para ficar acessível só na máquina e não na rede;
  - **volume nomeado** `pgdata:/var/lib/postgresql`. No Postgres 18 o volume deve ser montado em `/var/lib/postgresql`, não em `.../data`. O volume é nomeado, e não bind mount numa pasta do Windows, para evitar problemas de permissão e desempenho do NTFS;
  - `./docker/postgres/init:/docker-entrypoint-initdb.d:ro`;
  - `healthcheck` com `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` e `restart: unless-stopped`.
- **`docker/postgres/init/01-create-test-db.sql`**: `CREATE DATABASE codeconnect_test;`, o banco isolado dos testes e2e. Esse script só roda quando o volume é criado vazio.
- **`.env.example`** (raiz): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` com valores fictícios. O `.env` real da raiz já existe e está ignorado; basta acrescentar `POSTGRES_PASSWORD` nele.
- **Scripts no `package.json` da raiz:**
  - `db:up` (`docker compose up -d`) e `db:down` (`docker compose down`);
  - `db:migrate` (`pnpm --filter api exec prisma migrate dev`);
  - `db:studio` (`pnpm --filter api exec prisma studio`).

## 2. Prisma no `apps/api`
- Dependências:
  - `pnpm api add @prisma/client @prisma/adapter-pg pg`
  - `pnpm api add -D prisma @types/pg`
  - Conferir os peer deps (TypeScript 6, Node 22). Se o pnpm 12 bloquear os build scripts do `prisma`/`@prisma/engines`, liberar em `allowBuilds` no `pnpm-workspace.yaml`.
  - Rodar `pnpm audit`.
- **`apps/api/prisma/schema.prisma`**:
  ```prisma
  generator client {
    provider            = "prisma-client"
    output              = "../src/generated/prisma"
    moduleFormat        = "esm"
    importFileExtension = "js"
  }
  datasource db { provider = "postgresql" }

  model User {
    id           Int      @id @default(autoincrement())
    name         String   @db.VarChar(100)
    email        String   @unique @db.VarChar(254)
    passwordHash String   @map("password_hash")
    createdAt    DateTime @default(now()) @map("created_at")
    @@map("users")
  }
  ```
- **`apps/api/prisma.config.ts`**: carrega o `.env` com `process.loadEnvFile()` (nativo do Node, sem `dotenv`) e define `schema`, `migrations.path` e `datasource.url: env('DATABASE_URL')`.
- **Migração inicial**: `prisma migrate dev --name create_users`, que gera `prisma/migrations/<ts>_create_users/migration.sql` (commitado).
- **`apps/api/.env.example`**: `DATABASE_URL=postgresql://codeconnect:<senha>@localhost:5432/codeconnect`, `TEST_DATABASE_URL=.../codeconnect_test`, `JWT_SECRET=`. O `apps/api/.env` real fica fora do git, porque o `.gitignore` já cobre `.env`.
- **Scripts do `apps/api/package.json`**: `"postinstall": "prisma generate"` e `"build": "prisma generate && nest build"`.
- **Ignorar o client gerado:**
  - `apps/api/src/generated/` no `.gitignore`;
  - em `ignorePatterns` do `.oxlintrc.json`;
  - num `.prettierignore` novo.
  - Excluir `prisma.config.ts` do `tsconfig.build.json`.

## 3. Carregar variáveis de ambiente na API
- Em `src/main.ts`, antes do bootstrap, chamar `process.loadEnvFile()` dentro de `try/catch`. Sem arquivo, segue com as variáveis do host, como em produção. Não adiciona dependência.
- Novo `src/prisma/database.constants.ts` com `getDatabaseUrl()`, no mesmo padrão do `getJwtSecret()` em `auth/auth.constants.ts`. Sem `DATABASE_URL`, lança um erro claro, porque não há fallback razoável para o banco.

## 4. Módulo Prisma (`src/prisma/`)
- `prisma.service.ts`: `PrismaService extends PrismaClient` (importado de `../generated/prisma/client.js`), com `super({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) })`. Implementa `OnModuleInit` (`$connect`, para falhar cedo se o banco estiver fora do ar) e `OnModuleDestroy` (`$disconnect`).
- `prisma.module.ts`: `@Global()`, exporta `PrismaService`. Registrado no `AppModule`.

## 5. Trocar o array no `UsersService`
`src/users/users.service.ts`:
- Remover `users[]` e `nextId`, e injetar `PrismaService`.
- `create(dto)`: `prisma.user.create({ data: { name, email: email.toLowerCase(), passwordHash: await hashPassword(...) } })`. A duplicidade é garantida pelo índice `@unique`: `catch` de `PrismaClientKnownRequestError` com `code === 'P2002'` vira `ConflictException('Email já cadastrado')`. Isso evita a corrida entre "checar e inserir".
- `findByEmail(email)` passa a ser **async**, com `findUnique({ where: { email: normalizado } })`, e devolve `StoredUser | null`.
- `findById(id)` passa a ser **async**, com `findUnique`, e lança `NotFoundException` se não achar.
- `entities/user.entity.ts`: `StoredUser` vira `type StoredUser = User` (tipo gerado pelo Prisma, mesmo formato). O `UserEntity` continua igual e nunca expõe `passwordHash`.

Chamadores que precisam de `await`:
- `src/auth/auth.service.ts`: `await this.usersService.findByEmail(email)`.
- `src/auth/auth.controller.ts`: `me()` vira `async` e devolve `Promise<UserEntity>`, com `await` dentro do `try`, para o `NotFoundException` continuar virando `401`.
- `src/users/users.controller.ts`: já usa `await create`, sem mudança.

## 6. Testes
**Unitários (sem banco, `pnpm test:api`):**
- `users.service.spec.ts`: `PrismaService` falso (`{ user: { create: vi.fn(), findUnique: vi.fn() } }`). Casos:
  - cria e devolve a entidade sem senha;
  - salva o email normalizado e um hash, não a senha;
  - `P2002` vira `ConflictException`;
  - `findById` inexistente lança `NotFoundException`;
  - `findByEmail` normaliza o email.
- `users.controller.spec.ts`, `auth.service.spec.ts` e `auth.controller.spec.ts`: trocam o `new UsersService()` real por um mock de `UsersService` com `vi.fn()`, porque hoje dependem do array. Mantêm os mesmos casos, e o `me()` passa a usar `await`/`rejects`.
- Novo `prisma.service.spec.ts`: chama `$connect` no `onModuleInit` e `$disconnect` no `onModuleDestroy`, com spies.

**E2E (banco real `codeconnect_test`, `pnpm test:api:e2e`):**
- `vitest.config.e2e.ts`:
  - carrega o `.env`;
  - define `test.env.DATABASE_URL = TEST_DATABASE_URL`;
  - `fileParallelism: false`, porque os arquivos compartilham o banco;
  - `globalSetup: './test/global-setup.ts'`.
- `test/global-setup.ts`:
  - **recusa rodar** se `TEST_DATABASE_URL` faltar ou for igual a `DATABASE_URL`, para nunca apagar dados de desenvolvimento;
  - roda `prisma migrate deploy` no banco de teste.
- `test/db.ts`: `resetDatabase(app)` executa `TRUNCATE TABLE users RESTART IDENTITY CASCADE`. É chamado no `beforeEach` do `auth.e2e-spec.ts`, no lugar do comentário "in-memory users array". Assim os asserts atuais (`id: 1`, `Location: /users/1`) continuam válidos.
- Novo caso e2e **"persiste entre instâncias"**: cria o usuário, fecha o app, sobe outro app e faz login com sucesso. Prova que o dado sobreviveu ao restart, que era o problema original.

## 7. Documentação
- `CLAUDE.md`:
  - em Commands, `pnpm db:up`, `pnpm db:migrate` e `pnpm db:studio`, e que `test:api:e2e` exige o container de pé;
  - em Security, trocar "The first version keeps users in an in-memory array" por Prisma + Postgres;
  - acrescentar a seção "Database" (Prisma 7, schema/migrações, client gerado fora do git, banco de teste separado e `docker compose down -v` apagando os dados).
- `plan/AutenticacaoUsuario.md`: nota datada (2026-10-02) dizendo que o armazenamento em memória foi substituído, com link para `plan/PersistenciaDados.md`.

## 8. Commits (Conventional Commits)
1. `docs(root): add data persistence plan`
2. `build(root): add postgres docker compose with persistent volume`
3. `build(api): add prisma with postgres adapter and users migration`
4. `feat(api): persist users with prisma`, com o `PrismaModule`, o `UsersService`, os chamadores async e as specs unitárias
5. `test(api): run e2e tests against a postgres test database`
6. `docs(root): document database setup`

## Verificação
1. Preencher `POSTGRES_PASSWORD` no `.env` da raiz e criar `apps/api/.env` a partir do `.env.example`.
2. `pnpm db:up` e depois `docker compose ps`: o container deve estar `healthy`.
3. `pnpm db:migrate` cria a tabela `users`.
4. `pnpm test:api`, `pnpm test:api:e2e`, `pnpm lint` e `pnpm build` devem passar.
5. Teste de persistência com o Postman:
   - `pnpm dev:api`, depois rodar a coleção (Cadastrar → Login → Perfil);
   - **parar e subir a API de novo**: Login e Perfil devem continuar funcionando, e o Cadastrar deve voltar `409`.
6. `pnpm db:down` seguido de `pnpm db:up`: os dados continuam lá, porque estão no volume `pgdata`. `docker compose down -v` apagaria tudo e só deve ser usado de propósito.
7. `pnpm db:studio` abre o Prisma Studio, onde os usuários aparecem com `password_hash` e nunca com a senha em texto.
8. `http://localhost:3000/api/docs`: o Swagger continua igual.

## Notas de implementação (2026-10-02)
O que mudou em relação ao plano acima durante a implementação, e por quê:
- **Versão do Prisma fixada em `^7.10.0`:** a tag `latest` do `prisma` no npm aponta para uma pré-versão (`8.0.0-rc.19`), que veio com dependências desnecessárias (`workerd`, `alchemy`) e não batia com o `@prisma/client` 7.10.0. CLI e client ficam na mesma versão.
- **`allowBuilds` no `pnpm-workspace.yaml`:** `prisma` e `@prisma/engines` liberados (baixam o schema engine das migrações). `esbuild` fica bloqueado, porque não é necessário.
- **`.env` carregado em `src/load-env.ts`, não no corpo do `main.ts`:** em ESM os imports rodam antes do corpo do módulo, e `auth.constants.ts` lê `JWT_EXPIRES_IN` no carregamento. O `load-env.ts` é o primeiro import do `main.ts`.
- **`.gitignore`:** a regra `.env.*` também ignorava os `.env.example`; ganhou a exceção `!.env.example`.
- **`prisma.config.ts`:** usa `process.env.DATABASE_URL ?? ''` em vez de `env('DATABASE_URL')`, para o `prisma generate` do `postinstall` funcionar sem `.env` (gerar o client não precisa de banco).
- **`tsconfig.build.json` não precisou mudar:** ele já inclui só `src/`, então o `prisma.config.ts` fica fora do build.
- **Senha local do Postgres:** gerada aleatoriamente e gravada no `.env` da raiz e no `apps/api/.env`, ambos fora do git.

## Resultados da verificação (2026-10-02)
| Verificação | Resultado |
|---|---|
| `pnpm db:up` | container `code-connect-postgres` `healthy`; bancos `codeconnect` e `codeconnect_test` criados |
| `pnpm db:migrate` | migração `20261002184701_create_users` aplicada |
| `pnpm test:api` | 8 arquivos, 22 testes passando |
| `pnpm test:api:e2e` | 2 arquivos, 11 testes passando (inclui "keeps users after the app restarts") |
| `pnpm lint:api` / `pnpm build:api` | sem erros |
| API real (porta 3001): cadastrar → reiniciar a API → login e `/auth/me` | `201` → `200` → `200`; cadastro repetido após o restart → `409` |
| `docker compose down` + `up` | registro continua no volume `code-connect-pgdata` |

Pendente (manual): rodar a coleção do Postman com `pnpm dev:api` e abrir o `pnpm db:studio`.