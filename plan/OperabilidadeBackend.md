# Plano: Operabilidade do Backend — Health Check e Exception Filter (apps/api)

## Contexto

Três lacunas de operabilidade sobreviveram a todas as fases anteriores, porque nenhuma suíte cobre "o que acontece quando algo imprevisto quebra em produção".

1. **A rota raiz ainda é o scaffold do Nest.** `AppService.getHello()` devolve `'Hello World!'` e `AppController` a expõe como `@Public() @Get()`. O mais revelador é que os próprios e2e **já a chamam de health route**: `test/guard.e2e-spec.ts:31` diz *"keeps the health route public"* e `test/security.e2e-spec.ts:171` diz *"GET / (health)"* — enquanto a asserção continua sendo a string do template. A intenção existe desde o início; falta a implementação. Esta fase termina isso em vez de inventar um conceito novo.

2. **Nenhum healthcheck de container.** Nem os dois `Dockerfile` nem os serviços `api`/`web` do `docker-compose.yml` têm healthcheck. O `web` usa `depends_on: - api` na forma de lista simples, sem condição: o nginx sobe assim que o container da API **existe**, não quando ela responde. Num start a frio isso serve a SPA contra uma API que ainda está conectando no Prisma.

3. **Nenhum exception filter e nenhum log.** O `ErrorResponseDto` documenta o formato de erro no Swagger, mas **nada o garante** — é documentação sem contrato. E não existe `Logger`, interceptor nem filter em `apps/api/src`: um 500 inesperado em produção não deixa rastro nenhum.

## 1. `GET /` passa a ser a checagem oficial de saúde

A rota **não muda de endereço**. Respeitar o design implícito que os testes já expressam é mais limpo que mover para `/health` e migrar call sites por conformidade nominal — e mantém o probe do `lighthouse.yml` funcionando sem alteração.

### Controller

`src/app.controller.ts` mantém `@Public()` e `@NoCsrf()`. O `@NoCsrf()` é tecnicamente redundante — `CsrfGuard` já isenta métodos seguros — mas é exatamente o precedente de `GET /auth/csrf`, cujo comentário diz que o decorator está ali *"only as documentation"*. Ferramenta de infraestrutura consome esta rota; declarar a intenção vale as duas linhas.

- `200` com o corpo de saúde quando o banco responde.
- `503` via `ServiceUnavailableException` quando não.

### `HealthService` fino, não injeção direta

O controller injeta um `HealthService`, que injeta o `PrismaService`. A regra do projeto é explícita (`.github/ai-guidelines/database-persistence.md`: *"inject `PrismaService` into services only, never into controllers"*), e o prompt do gate de revisão manda checar aderência a esses spokes — injetar direto no controller viraria apontamento na PR. Custa ~10 linhas e um arquivo, mantém a regra absoluta e deixa o módulo com o mesmo formato de todos os outros da API.

### O probe

No `HealthService`:

```ts
// Tagged template, nunca interpolação de string — ver a regra de SQL cru.
// $connect() já aconteceu no boot (PrismaService.onModuleInit) e pode ter
// ficado obsoleto desde então; só uma query prova ida e volta ao banco.
async isDatabaseReachable(): Promise<boolean> {
  try {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
```

**Sem `@nestjs/terminus`**: é uma dependência e um modelo mental inteiro para o que aqui são ~20 linhas, e o Docker só precisa de um 200. Separar liveness de readiness fica registrado como **não-objetivo**, não como dívida — revisitar se algum dia houver um orquestrador que distinga os dois.

### Swagger

`HealthResponseDto` com `@ApiProperty` em cada campo, `@ApiOkResponse` e `@ApiServiceUnavailableResponse` (`type: ErrorResponseDto`) no handler. Rota pública, então **sem** `@ApiCookieAuth` nem `@ApiSecurity('csrf')`.

### Remoções e call sites

Apagar `AppService` (o arquivo, o `getHello` e a entrada no array de `providers` do `app.module.ts`).

| Arquivo | Hoje | Depois |
|---|---|---|
| `src/app.controller.spec.ts` | espera `'Hello World!'` | health com `HealthService` mockado, nos dois caminhos |
| `test/app.e2e-spec.ts` | `get('/')` esperando `'Hello World!'` | `get('/')` esperando `200` e o corpo de saúde |
| `test/guard.e2e-spec.ts:31` | `get('/')` esperando `'Hello World!'` | `get('/')` esperando `200` |
| `test/security.e2e-spec.ts:171` e `:189` | `get('/')` esperando `200` | **sem alteração** — já são válidos |
| `.github/workflows/lighthouse.yml:100` | `curl -sf http://localhost:3000` | **sem alteração** — parte do ganho desta escolha |

Conferir também `postman/` — se houver request para `/` com asserção do corpo antigo, atualizar.

O caminho de `503` é coberto no unitário do service com o `PrismaService` mockado lançando; simular banco caído no e2e exigiria derrubar o container no meio da suíte.

→ `feat(api): replace the scaffold root route with a health check`

## 2. Global Exception Filter com Logger

`src/common/filters/all-exceptions.filter.ts`, registrado em `app.module.ts` como `{ provide: APP_FILTER, useClass: AllExceptionsFilter }` — junto dos três `APP_GUARD`, mantendo ordem e lugar de registro explícitos num arquivo só.

### Comportamento

- **`HttpException` passa intacta.** É o requisito mais importante do desenho. Existem mais de 25 asserções de formato de erro espalhadas pelos e2e: array de mensagens do `ValidationPipe` no `400`, mensagem genérica idêntica no `401`, `409` de conflito, e o `429` que depende do header `Retry-After` posto pelo `ThrottlerGuard` antes de lançar. Um filter que remonta a resposta derruba todas elas e, pior, pode comer headers já definidos.
- **Qualquer outra coisa vira `500` normalizado** no formato do `ErrorResponseDto`: `{ statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' }`. Nada de stack trace, mensagem do Prisma ou fragmento de SQL na resposta — é o que a regra *"errors don't leak stack traces, SQL or internal messages"* pede e que hoje nada garante.
- **Stack trace completo no terminal da API.** `Logger` do `@nestjs/common` com escopo próprio: `logger.error(mensagem, error.stack)`, mais método e rota. A saída HTTP fica mascarada; o diagnóstico fica no log.
- **`HttpException` não é logada.** Um `401` por senha errada é operação normal, e logar 4xx transforma o log em ruído que ninguém lê.

### Por que fecha uma lacuna real

O `ErrorResponseDto` existe desde o início como *documentação* do formato padrão do Nest. Com o filter, o formato passa a ser garantido inclusive no caminho hoje menos previsível — a exceção que ninguém escreveu. E o log é a única diferença entre "deu 500 em produção" e "deu 500 em produção por isto, nesta rota".

### Testes

- `all-exceptions.filter.spec.ts`: `HttpException` sai idêntica; `Error` cru sai como o 500 mascarado; o logger é chamado no segundo caso e **não** no primeiro.
- `test/security.e2e-spec.ts` ganha um caso provando que uma falha inesperada não vaza stack trace nem detalhe interno no corpo.
- A suíte de e2e **inteira** é a rede de proteção: se o filter quebrar o formato de alguma exceção documentada, são aquelas 25+ asserções que acusam.

→ `feat(api): enforce the documented error shape with a global exception filter`

## 3. Healthchecks de container

Depende da etapa 1: o healthcheck precisa de um endpoint real para consultar, não de um probe TCP que seria reescrito em seguida.

### `apps/api/Dockerfile`

A imagem runtime é `node:22-alpine` e instala **apenas** `dumb-init` — não tem `curl`. Em vez de adicionar um pacote só para isso, usar o `fetch` global do Node 22:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

`start-period` generoso porque `PrismaService.onModuleInit` conecta no boot: antes disso a API legitimamente não responde, e sem essa janela o container seria marcado unhealthy durante a própria partida.

### `apps/web/Dockerfile`

`nginx:alpine` tem o `wget` do busybox, então não precisa de pacote novo:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
```

### `docker-compose.yml`

O Compose **herda o `HEALTHCHECK` da imagem**, então não há bloco `healthcheck:` duplicado nos serviços — definir num lugar só evita os dois divergirem, que é exatamente o problema que o CSP de `vite.config.ts` e do nginx já tem.

A única mudança no compose é a dependência do `web`:

```yaml
    depends_on:
      api:
        condition: service_healthy
```

→ `build(root): add container healthchecks and gate web on api health`

## Fora de escopo, deliberadamente

- **Interceptor de request-id / correlação:** instância única, um stream de log, nada com que correlacionar. É construir para futuro hipotético, o que o `CLAUDE.md` proíbe. Revisitar quando houver mais de um serviço ou ingestão estruturada de log.
- **Log por requisição:** `Logger` no filter e no bootstrap cobre o que alguém realmente leria. Uma linha por request neste projeto é ruído.
- **`@nestjs/terminus`** e a separação liveness/readiness: ver a etapa 1.

## Commits

- `docs(root): add the backend operability plan` — este arquivo
- `feat(api): replace the scaffold root route with a health check`
- `feat(api): enforce the documented error shape with a global exception filter`
- `build(root): add container healthchecks and gate web on api health`

## Verificação

```bash
pnpm typecheck
pnpm lint                              # type-aware, depois do typecheck
pnpm test:api                          # unitários do health e do filter
pnpm db:up && pnpm test:api:e2e        # os call sites e as 25+ asserções de formato
pnpm build
```

`pnpm test:web` e `test:web:a11y` não são necessários: esta fase não toca `apps/web`. O `lighthouse.yml` não muda, mas vale conferir que o job segue verde — é ele que exercita o probe de readiness contra a rota nova.

Manual, sem cobertura automatizada possível:

- `docker compose up --build api web` → confirmar que o `web` só sai de `created` depois de o `api` ficar `healthy`. Exige `JWT_SECRET`, `CORS_ORIGINS` e `VITE_API_URL` no `.env` da raiz, que hoje só tem as chaves `POSTGRES_*` — preencher a partir do `.env.example` antes do teste.
- `docker stop` no container da API: o shutdown deve seguir em ~0,6–0,7s, sem regressão no `enableShutdownHooks` que o `main.ts` já garante.
