# Backend Architecture (apps/api)

## Role: You are acting as a Senior Backend Engineer. Adhere strictly to the following constraints.

`apps/api` is a NestJS 12 backend (Express platform), tested with Vitest, linted with oxlint (type-aware). Listens on `process.env.PORT ?? 3000`. This file covers module layout, REST conventions, Swagger documentation and test colocation. See the root `CLAUDE.md` for commands and the full guideline index; see `security-standards.md` for auth/CSRF/rate-limiting rules and `database-persistence.md` for Prisma/PostgreSQL.

## Module layout

One NestJS feature module per resource, in `src/<resource>/` (plural, kebab-case):

```
src/posts/
  posts.module.ts
  posts.controller.ts        # HTTP only: routing, status codes, headers, DTO binding
  posts.service.ts           # business logic; knows nothing about HTTP
  posts.controller.spec.ts
  posts.service.spec.ts
  dto/create-post.dto.ts     # request bodies
  dto/update-post.dto.ts
  entities/post.entity.ts    # resource representation
```

Controllers stay thin and delegate to services. Services throw Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...) or domain errors that a filter maps to them. Register every feature module in `AppModule`. Generate with `pnpm api exec nest g resource <name>`, then fix imports to use `.js` extensions (see gotchas in `development-workflow.md`).

## REST rules

Every endpoint must follow REST principles:

- **Resources, not actions.** URLs are plural nouns: `/posts`, `/posts/:id`, `/posts/:postId/comments`. No verbs in paths (`/createPost`, `/posts/:id/delete` are wrong). Nest at most one level deep; beyond that, use top-level resources with filters.
- **HTTP methods by semantics:**
  - `GET` reads and never changes state.
  - `POST` on a collection creates.
  - `PUT` replaces the whole resource (idempotent).
  - `PATCH` updates part of it.
  - `DELETE` removes it (idempotent).
- **Status codes:**
  - `200` for reads and updates that return a body.
  - `201 Created` with a `Location` header and the created resource for `POST`.
  - `204 No Content` for `DELETE` and updates without a body.
  - `400` for malformed input, `422` for validation that fails on well-formed input (pick one convention and use it everywhere).
  - `401`/`403` for authentication/authorization, `404` for a missing resource, `409` for conflicts (duplicates, state clashes).
  - Never return `200` with an error in the body.
  - Set codes explicitly with `@HttpCode()` when Nest's default is wrong, for example `@HttpCode(204)` on `DELETE`.
- **Stateless.** Each request carries everything needed (the session cookie, the CSRF header on an unsafe method). No server-side session store between requests — the API keeps no session state of its own; see `security-standards.md` for what that trades away (a token can't be revoked server-side before it expires).
- **Representations.** JSON in and out, `camelCase` fields. Responses return resource representations (entities/response DTOs), never raw persistence objects or internal fields.
- **Collections.** Filtering, sorting and pagination go in query params (`?page=1&limit=20&sort=-createdAt&authorId=1`). Paginated responses include the data plus pagination metadata and links (`self`, `next`, `prev`).
- **Hypermedia.** Resources include links to themselves and to related resources where useful (for example a post links to its comments).
- **Consistent errors.** Keep Nest's default error shape (`statusCode`, `message`, `error`) across the whole API. Don't invent per-endpoint formats.
- **Validation.** Validate every body, param and query with DTOs and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`). Use `ParseIntPipe`/`ParseUUIDPipe` for ids. The pipe is set up in `configureApp` (`src/app.setup.ts`), which `main.ts` and the e2e tests both call, so tests run with the same validation as production.
- **Caching and concurrency.** `GET` responses may use `ETag`/`Cache-Control`. Don't make `GET` responses uncacheable by mixing in side effects.

## Tests

Each controller and service gets a colocated `*.spec.ts` (see the existing `app.controller.spec.ts` for the pattern with `Test.createTestingModule`). Each endpoint also gets an e2e test in `apps/api/test/` with supertest that asserts the status code, the important headers (such as `Location`) and the response body.

## API documentation: Swagger (OpenAPI)

The Swagger setup is in `src/swagger.ts` (`setupSwagger`, called from `main.ts` and the e2e tests): UI at `/api/docs`, JSON at `/api/docs-json`. Every endpoint must be documented, and a change to an endpoint isn't done until its Swagger is updated.

- **No CLI plugin.** Vitest doesn't go through `nest build`, so document explicitly. Every DTO and entity field has `@ApiProperty({ example, description })`, with `minLength`/`maxLength`/`enum`/`format` when they apply, matching the `class-validator` rules.
- Each controller has `@ApiTags('<resource>')`. Each handler has `@ApiOperation({ summary })` (in pt-BR, short) and one response decorator for the success code (`@ApiOkResponse`, `@ApiCreatedResponse`, ...), with `type` set to a response class (arrays use `type: [X]`).
- Document every error the endpoint can return (`@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiConflictResponse`, `@ApiNotFoundResponse`, ...) with `type: ErrorResponseDto` (`common/dto/error-response.dto.ts`), which mirrors Nest's default error shape.
- Protected routes carry `@ApiCookieAuth('cookie')` (the session cookie) and, where relevant, `@ApiSecurity('csrf')` for the `X-CSRF-Token` header — both schemes are registered in `src/swagger.ts`. Public routes carry neither.
- Document inputs through DTO classes (`@Body`, `@Query`, `@Param`), not inline types, because only classes reach the OpenAPI document. Response types must be classes too.
- Swagger examples never contain real data or real secrets. Use obvious fakes (`maria@exemplo.com`, `senha-segura-123`).
- Each feature's e2e test asserts that its paths appear in `GET /api/docs-json` (see `test/auth.e2e-spec.ts`). `SWAGGER_ENABLED` (see `env.ts`, documented in `security-standards.md`) gates whether it's served at all — defaults off in production. No guard can do this instead: `SwaggerModule` registers its routes directly on the Express instance, bypassing Nest's router (and every `APP_GUARD`) entirely.
