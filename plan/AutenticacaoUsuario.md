# Plano: Autenticação de Usuário (apps/api)

## Contexto
O `apps/api` hoje só tem o `AppController` de exemplo ("Hello World!"). As páginas de Login e Cadastro do `apps/web` já existem, mas os handlers são stubs com `console.info` porque não há endpoints de auth. Este plano cria os três endpoints que faltam, documentados no Swagger:

| # | Endpoint | O que faz | Sucesso | Erros |
|---|---|---|---|---|
| 1 | `POST /users` | Cadastro (nome, email, senha) | `201` + `Location: /users/:id` + usuário sem senha | `400` validação, `409` email já cadastrado |
| 2 | `POST /auth/login` | Login, devolve o JWT | `200` + `{ accessToken, tokenType, expiresIn }` | `400` validação, `401` credenciais inválidas |
| 3 | `GET /auth/me` | Dados do usuário logado (AuthGuard) | `200` + usuário sem senha | `401` sem token / token inválido |

Decisões:
- **Armazenamento em memória**: um array simples dentro do `UsersService` (provider singleton). Sem banco nem ORM por enquanto; os dados somem ao reiniciar a API. A troca futura por um repositório fica isolada no service.
- **Rotas no estilo da documentação do Nest**, por escolha do usuário: `POST /auth/login` igual à doc e `GET /auth/me` para o perfil (a doc usa `/auth/profile`). É uma exceção registrada à regra "resources, not actions" do CLAUDE.md. `POST /auth/login` responde `200` (`@HttpCode(HttpStatus.OK)`), como na doc: o token não é um recurso persistido, então não há `Location`.
- **AuthGuard no padrão da doc do Nest** ("Authentication" → "Implementing the authentication guard"): `CanActivate` que lê `Authorization: Bearer <token>`, valida com `JwtService.verifyAsync` e grava o payload em `request.user`; sem Passport. O `GET /auth/me` usa `request.user.sub` para buscar o usuário no `UsersService` e devolve a representação completa (não só o payload).
- **Validação**: convenção `400` para qualquer erro de validação (padrão do `ValidationPipe` do Nest), aplicada em todo o projeto.
- **Senha**: hash com `scrypt` + salt aleatório de `node:crypto` e comparação com `timingSafeEqual`. Zero dependências e sem build nativo no Windows (o `bcrypt` da doc precisa de node-gyp). A senha nunca sai na resposta.
- **Segredo do JWT**: `process.env.JWT_SECRET`; fallback fixo de desenvolvimento só quando `NODE_ENV !== 'production'` (em produção, sem a variável, a API não sobe). Expiração `1h` (`JWT_EXPIRES_IN`, opcional).

## 1. Dependências (`apps/api`)
- `pnpm api add @nestjs/jwt @nestjs/swagger class-validator class-transformer`
- Conferir que as versões instaladas aceitam `@nestjs/common`/`core` 12 nos peer deps (se o `@nestjs/swagger` ainda não tiver release para o 12, avisar antes de seguir).
- **Sem o plugin CLI do Swagger**: o Vitest não passa pelo `nest build`, então todos os campos levam `@ApiProperty` explícito.

## 2. Setup compartilhado da aplicação
- Novo `src/app.setup.ts` com `configureApp(app: INestApplication)`:
  - `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`.
- Novo `src/swagger.ts` com `setupSwagger(app)`: `DocumentBuilder` (título "Code Connect API", versão, `addBearerAuth()`), `SwaggerModule.setup('docs', app, document)` → UI em `/docs`, JSON em `/docs-json`.
- `src/main.ts`: chama `configureApp(app)` e `setupSwagger(app)` antes do `listen` (e remove o comentário de debug das variáveis de ambiente).
- Os testes e2e chamam o mesmo `configureApp`, assim validação e status codes batem com a produção.

## 3. Módulo `users` (`src/users/`)
```
users.module.ts          # exporta UsersService
users.controller.ts      # POST /users
users.service.ts         # array em memória + regras
users.controller.spec.ts
users.service.spec.ts
dto/create-user.dto.ts
entities/user.entity.ts
password.ts              # hashPassword / verifyPassword (scrypt)
password.spec.ts
```
- `CreateUserDto`: `name` (`@IsString @IsNotEmpty @MaxLength(100)`, trim via `@Transform`), `email` (`@IsEmail`, normalizado para minúsculas), `password` (`@IsString @MinLength(8) @MaxLength(72)`). Cada campo com `@ApiProperty({ example, description })`.
- `UserEntity` (representação de resposta, com `@ApiProperty`): `id` (number), `name`, `email`, `createdAt` (ISO string), `links: { self: '/users/:id' }` (hypermedia). Construído por uma função/construtor que recebe o registro interno, para nunca vazar `passwordHash`.
- Registro interno (tipo não exportado para fora do módulo): `{ id, name, email, passwordHash, createdAt }`.
- `UsersService`:
  - `private readonly users: StoredUser[] = []`, `private nextId = 1`.
  - `create(dto)`: lança `ConflictException('Email já cadastrado')` se o email existir; gera o hash; salva; devolve `UserEntity`.
  - `findByEmail(email)` (registro interno, usado pelo AuthService) e `findById(id)` (`UserEntity` ou `NotFoundException`).
- `UsersController`: `@ApiTags('users')`; `@Post()` com `@Res({ passthrough: true })` para setar `Location: /users/${id}`; `@ApiCreatedResponse({ type: UserEntity })`, `@ApiBadRequestResponse`, `@ApiConflictResponse` (todas com `type: ErrorResponseDto`).

## 4. Módulo `auth` (`src/auth/`)
```
auth.module.ts           # imports UsersModule, JwtModule.register({ global: true, ... })
auth.controller.ts       # POST /auth/login, GET /auth/me
auth.service.ts          # signIn(email, password)
auth.guard.ts            # AuthGuard (padrão da doc do Nest)
auth.constants.ts        # jwtSecret / jwtExpiresIn lidos do ambiente
auth.controller.spec.ts
auth.service.spec.ts
auth.guard.spec.ts
dto/login.dto.ts
dto/token-response.dto.ts
```
- `LoginDto`: `email` (`@IsEmail`), `password` (`@IsString @IsNotEmpty`), com `@ApiProperty`.
- `TokenResponseDto`: `accessToken`, `tokenType: 'Bearer'`, `expiresIn` (segundos).
- `AuthService.signIn`: busca por email, `verifyPassword`; em qualquer falha lança `UnauthorizedException('Email ou senha inválidos')` (mesma mensagem para email inexistente e senha errada). Assina `{ sub: user.id, email }` com `jwtService.signAsync`.
- `AuthGuard`: como na doc — `extractTokenFromHeader` (`type === 'Bearer'`), `verifyAsync(token, { secret })`, `request['user'] = payload`, `UnauthorizedException` se faltar ou falhar. Tipar o payload (`JwtPayload { sub: number; email: string }`) e o request.
- `AuthController` (`@ApiTags('auth')`):
  - `@HttpCode(HttpStatus.OK) @Post('login')` → `@ApiOkResponse({ type: TokenResponseDto })`, `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`.
  - `@UseGuards(AuthGuard) @Get('me')` → `@ApiBearerAuth()`, `@ApiOkResponse({ type: UserEntity })`, `@ApiUnauthorizedResponse`; chama `usersService.findById(req.user.sub)` (usuário removido → 401, já que o token não vale mais).
- Registrar `UsersModule` e `AuthModule` no `AppModule`.

## 5. Swagger compartilhado
- `src/common/dto/error-response.dto.ts`: `ErrorResponseDto { statusCode, message (string | string[]), error }`, espelhando o formato padrão de erro do Nest, usado em todas as respostas de erro documentadas.
- Imports relativos com extensão `.js` em tudo (API em ESM nativo).

## 6. Testes
**Unitários (`*.spec.ts`, colocalizados, padrão do `app.controller.spec.ts`):**
- `password.spec.ts`: hash diferente da senha e com salt (dois hashes da mesma senha diferem); `verifyPassword` aceita a certa e recusa a errada.
- `users.service.spec.ts`: `create` devolve entidade sem `passwordHash` e com `links.self`; email duplicado (inclusive com maiúsculas) → `ConflictException`; `findById` inexistente → `NotFoundException`.
- `users.controller.spec.ts`: delega ao service e seta o `Location`.
- `auth.service.spec.ts`: credenciais certas → token verificável com `sub`; email inexistente e senha errada → `UnauthorizedException`.
- `auth.guard.spec.ts`: sem header, esquema diferente de Bearer e token inválido → `UnauthorizedException`; token válido → `true` e `request.user` preenchido.
- `auth.controller.spec.ts`: `login` delega ao `AuthService`; `me` busca o usuário pelo `sub`.

**E2E (`test/auth.e2e-spec.ts`, supertest, app com `configureApp`):**
- `POST /users` → `201`, header `Location: /users/1`, body com `id/name/email/createdAt/links` e sem senha.
- `POST /users` com email repetido → `409`; com body inválido ou campo extra → `400` no formato `{ statusCode, message, error }`.
- `POST /auth/login` correto → `200` com `accessToken` e `tokenType: 'Bearer'`; senha errada → `401`.
- `GET /auth/me` sem token → `401`; com token inválido → `401`; com o token do login → `200` com os dados do usuário cadastrado.
- `GET /docs-json` → `200` e o documento contém `/users`, `/auth/login`, `/auth/me` e o esquema `bearer`.

## 7. Commits (Conventional Commits)
1. `docs(root): add user authentication plan`
2. `build(api): add jwt, swagger and class-validator`
3. `feat(api): add global validation pipe and swagger docs`
4. `feat(api): add users resource with in-memory storage`
5. `feat(api): add jwt login and auth guard`
6. `test(api): cover auth flow end to end`

## Verificação
- `pnpm test:api` e `pnpm test:api:e2e`: todos passam.
- `pnpm lint` (oxlint type-aware, sem `no-floating-promises`) e `pnpm build`.
- `pnpm dev:api` e abrir `http://localhost:3000/docs`: conferir inputs e outputs dos três endpoints, cadastrar um usuário, fazer login, clicar em "Authorize" com o token e chamar `GET /auth/me`.
- Fora do escopo (próximo plano): ligar o `LoginForm`/`SignUpForm` do web nestes endpoints (vai exigir `app.enableCors` para a origem do Vite) e trocar o array por um banco.
