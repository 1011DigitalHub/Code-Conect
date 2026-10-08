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

No `HealthService` — versão atual, depois dos achados da 4ª e 5ª rodadas de revisão (ver seções próprias abaixo):

```ts
const PROBE_TIMEOUT_MS = 3_000; // menor que o --timeout=5s do Docker
const PROBE_CACHE_MS = 1_500;   // coalescing + cache, ver a seção da 5ª rodada

isDatabaseReachable(): Promise<boolean> {
  const now = Date.now();
  if (!this.cached || this.cached.expiresAt <= now) {
    this.cached = { expiresAt: now + PROBE_CACHE_MS, result: this.probe() };
  }
  return this.cached.result;
}

private async probe(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      this.prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (error) {
    this.logger.error('database health probe failed', error instanceof Error ? error.stack : String(error));
    return false;
  } finally {
    clearTimeout(timer);
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

### "`HttpException` passa intacta" tinha duas pegadinhas, achadas só ao rodar o e2e inteiro

O desenho original assumia que `exception.getResponse()` sempre devolve o objeto `{ statusCode, message, error }`. Dois casos reais quebraram essa suposição, e os dois só apareceram rodando a suíte completa — nenhum unitário do primeiro rascunho cobria:

1. **`ThrottlerException` (e qualquer `HttpException` construída com uma string simples).** `getResponse()` devolve a string crua, não um objeto. O `BaseExceptionFilter` padrão do Nest embrulha isso em `{ statusCode, message }`; sem replicar esse passo, a string virava o corpo inteiro da resposta e derrubava as três asserções de `429` em `throttle.e2e-spec.ts`.
2. **`PayloadTooLargeError` do `body-parser`.** Lançado pelo middleware antes do router do Nest ver a requisição, então nunca é uma `HttpException` — mas carrega o mesmo formato do pacote `http-errors` (`expose`/`statusCode`/`status`) que o filtro padrão do Nest também trata como caso especial. Sem replicar isso, um payload 10kb acima do limite virava um `500` mascarado em vez do `413` que `security.e2e-spec.ts` já esperava.

`AllExceptionsFilter` replica os dois casos do `BaseExceptionFilter` original do Nest (não são invenção própria), com um teste unitário para cada um provado por reversão deliberada antes de ficar confiado nele.

### Um terceiro caso, esse sim um bug de segurança: `isHttpError` aceitava `expose: false`

Achado pela revisão da PR #16 (`isHttpError` só checava `typeof err.expose === 'boolean'`, nunca o valor). O pacote `http-errors` usa `expose = status < 500` por padrão — ou seja, `expose: false` é exatamente o sinal de "isto é um 5xx interno, não devolva esta mensagem ao cliente". A versão original do `isHttpError` deixava passar um erro nesse formato com `expose: false` do mesmo jeito que o `PayloadTooLargeError` (`expose: true`) — vazando a mensagem interna sem máscara e, pior, sem logar (o branch retorna antes da chamada ao `logger.error`). O próprio comentário que eu tinha escrito no código já afirmava que só `expose: true` era seguro; o código não checava isso. Corrigido para `err.expose === true`, com um caso unitário dedicado (`expose: false` deve mascarar e logar, igual a qualquer erro desconhecido), verificado por reversão deliberada antes de confiar nele.

### Mais dois casos reais, achados na 3ª rodada de revisão

1. **Sem checagem de `headersSent`.** Regressão em relação ao `BaseExceptionFilter` original do Nest, que o substitui: se algo já começou a escrever a resposta antes da exceção (um handler que faz streaming, por exemplo), chamar `response.status()` lança `ERR_HTTP_HEADERS_SENT` — sem rede de proteção própria, esse throw escapa do próprio filtro. Corrigido separando "decidir status+corpo" (`resolve`, que já loga quando é um erro desconhecido) de "escrever a resposta": se `response.headersSent`, só `response.end()`, sem tentar re-setar status. O log do branch desconhecido continua acontecendo de qualquer forma, porque roda dentro do `resolve`, antes dessa checagem. Testado com um caso dedicado, verificado por reversão deliberada.
2. **Os ramos embrulhados (string-`HttpException` e `http-errors`) não tinham `error`.** Batem com o que o próprio `BaseExceptionFilter` do Nest faz (confirmado lendo o source), mas a regra deste projeto (`backend-architecture.md`: *"Keep Nest's default error shape (statusCode, message, error) across the whole API"*) e o próprio `ErrorResponseDto` tratam `error` como sempre presente — "espelhar o Nest" não bastava para cumprir a própria regra. Corrigido computando `error` a partir do status via `node:http`'s `STATUS_CODES` nos dois ramos, em vez de só nos dois que já tinham (o `HttpException` com corpo-objeto e o `500` mascarado).

### 4ª rodada: dois achados reais no `HealthService`, e uma decisão de produto sobre o throttle

1. **Falha do banco não era logada.** O `503` que `AppController` lança é uma `HttpException` (`ServiceUnavailableException`), e `AllExceptionsFilter` deliberadamente nunca loga essas — um `401` por senha errada não é bug. Mas um banco fora do ar não é "operação normal" do mesmo jeito, e o `catch` original do `HealthService` descartava o erro real (`catch { return false }`) sem deixar rastro nenhum. Resultado: uma queda de banco virava `503` sem uma única linha de log explicando o motivo — exatamente a lacuna que esta fase inteira existe para fechar, só que escondida num 503 em vez de um 500. Corrigido logando dentro do próprio `HealthService` (onde o erro real do Postgres está disponível), não no filter: mudar a política global do filter para logar `HttpException`s selecionadas seria uma mudança maior e mais arriscada para um caso só.
2. **Probe sem timeout.** O pool do `pg` não tem timeout de query por padrão. Com o pool esgotado ou o host descartando pacotes sem fechar o socket, `GET /` ficaria pendurado para sempre em vez de responder `503` — o `--timeout=5s` do `HEALTHCHECK` do Docker esconde isso por fora, mas qualquer outro consumidor direto da rota (um load balancer, por exemplo) não tem essa proteção. Corrigido com `Promise.race` contra um timeout de 3s (menor que os 5s do Docker, para que o probe sempre perca a corrida antes do Docker matar o processo). Verificado com um teste que nunca resolve a chamada ao banco (`new Promise(() => {})`) e `vi.useFakeTimers()`, confirmando que o `HealthService` responde `false` mesmo assim — sem esse teste, o `Promise.race` poderia estar presente só na aparência (ex.: o timeout nunca realmente disparando) e nada acusaria.
3. **`GET /` estava sob o rate limit global (100/min por IP).** Um probe de infraestrutura mais agressivo, ou que compartilhe IP com tráfego real por trás do mesmo proxy, poderia receber `429` e ser lido por engano como "unhealthy" — a própria checagem de saúde se tornando o motivo da checagem falhar. Era uma decisão de produto, não um bug: levada ao usuário, que escolheu isentar a rota com `@SkipThrottle()` (de `@nestjs/throttler`) em vez de documentar o `429` como possível. `GET /` não lê nada sensível nem muda estado, então a isenção não abre superfície de abuso real. Testado em `test/throttle.e2e-spec.ts` (não em `app.e2e-spec.ts`/`security.e2e-spec.ts` — esse já é o arquivo dedicado às asserções de `DEFAULT_THROTTLE`/`LOGIN_THROTTLE`/`SIGN_UP_THROTTLE`): mais de 100 requisições seguidas contra `/`, todas `200`. Verificado por reversão deliberada: removendo o `@SkipThrottle()`, a 101ª requisição vira `429` e o teste falha como esperado.

### 5ª rodada: o `@SkipThrottle()` da 4ª rodada reabriu um problema diferente

A decisão da 4ª rodada (isentar `GET /` do rate limit) resolveu o risco de infraestrutura ler um `429` como "unhealthy", mas trocou isso por outro: sem limite nenhum, cada chamada anônima a `GET /` ocupa uma conexão do pool do `pg`, e um flood nessa rota passa a disputar o pool com o resto da API — o timeout de 3s da seção anterior só para de esperar a query, não cancela nem libera a conexão mais rápido.

De novo uma decisão de produto, não um bug — levada ao usuário com duas opções: um `@Throttle()` dedicado e generoso (mais simples, mas reabre parcialmente o risco da 4ª rodada e não limita o pool tão bem) ou cache + coalescing das chamadas concorrentes no próprio `HealthService` (resolve as duas rodadas ao mesmo tempo, sem reverter o `@SkipThrottle()`). Escolhido: **cache + coalescing**.

`HealthService.isDatabaseReachable()` guarda a `Promise` em andamento (não só o resultado) numa janela de **1500ms** (`PROBE_CACHE_MS`):

```ts
// Versão desta rodada — a 7ª achou um bug nela (ver seção própria abaixo).
// O código final não é este; fica aqui só para registrar o que mudou e por quê.
isDatabaseReachable(): Promise<boolean> {
  const now = Date.now();
  if (!this.cached || this.cached.expiresAt <= now) {
    this.cached = { expiresAt: now + PROBE_CACHE_MS, result: this.probe() };
  }
  return this.cached.result;
}
```

Guardar a `Promise`, não o `boolean` resolvido, é o que faz o *coalescing* funcionar: chamadas concorrentes que chegam enquanto o probe ainda está em andamento recebem a mesma `Promise` e esperam pelo mesmo resultado, em vez de cada uma disparar sua própria `$queryRaw`. Um flood de milhares de requisições na mesma janela custa no máximo **uma** consulta real ao banco.

Efeito colateral que precisou de correção: o `setTimeout` do timeout (seção anterior) nunca era limpo quando a query vencia a corrida — o caso comum, já que ela normalmente responde em milissegundos. Sem `clearTimeout` num `finally`, esse timer ficava pendurado mantendo o event loop vivo pelos 3s inteiros a cada chamada. Achado pela mesma rodada de revisão, corrigido junto.

Três casos novos em `health.service.spec.ts`, cada um verificado por reversão deliberada (voltando à versão sem cache/coalescing e sem `clearTimeout`, confirmando que os testes certos falham, depois restaurando):
- chamadas concorrentes (`Promise.all` de duas chamadas) resultam em **uma só** chamada a `$queryRaw`;
- depois que a janela de 1500ms passa, uma nova chamada dispara um novo probe (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(1_501)`);
- o timer do timeout é limpo quando a query resolve primeiro (`vi.getTimerCount()` deve ser `0`).

A exceção ao rate limit global ficou documentada em `.github/ai-guidelines/security-standards.md`, como a revisão pediu: a seção de **Rate limiting** agora registra que `GET /` é a única rota isenta, e por quê — e que qualquer rota futura que precise da mesma isenção precisa da mesma proteção ao recurso que ela de fato toca, não só do decorator sozinho.

### 6ª rodada: a lacuna de teste do 503 limpo, dois nits de documentação, e uma sugestão repetida

1. **O caminho `503` "limpo" (banco reportando indisponível, sem lançar) não tinha e2e.** Havia unitário no `AppController` e um e2e para o caminho de falha *inesperada* (banco lançando, mascarado pelo filter em `500`), mas nenhum para o `HealthService` simplesmente respondendo `false` — o caminho documentado no Swagger (`@ApiServiceUnavailableResponse`) e o que a convenção de `backend-architecture.md` pede por endpoint (status **e** corpo). Adicionado em `security.e2e-spec.ts`: `HealthService` sobrescrito para resolver `false` (não lançar), `GET /` esperando `503` com o corpo exato que `ServiceUnavailableException('Database unreachable')` produz — `{ statusCode: 503, message: 'Database unreachable', error: 'Service Unavailable' }`.
2. **`HealthResponseDto.status` sem `enum`.** Adicionado `enum: ['ok']` junto do `example` já existente — primeiro uso de `enum` no projeto, mas a convenção de Swagger (`backend-architecture.md`) já pede `enum` "quando se aplica", e um campo de tipo literal é exatamente esse caso.
3. **`--start-interval` exige Docker Engine 25+ (API 1.44+), sem documentação disso.** Adicionado um comentário no `Dockerfile` da API registrando o requisito e que só foi testado na engine local (29.8) — confirmar a versão do ambiente de deploy antes de depender do cold start rápido.
4. **(Fora do diff) `development-workflow.md:63` ainda usava `./app.service.js` como exemplo da regra de extensão `.js`.** `AppService` foi removido na 1ª parte desta fase (commit `bcf81b9`); o exemplo ficou apontando para um arquivo que não existe mais. Troquei por `./health/health.service.js`.
5. **Mover a rota de `AppController` para `src/health/health.controller.ts`, de novo.** Mesma sugestão da 3ª rodada, mesma decisão: já tomada e aprovada antes desta fase começar (ver Contexto) — `GET /` mantém o endereço raiz que os e2e já tratavam como "a health route", e o controller raiz do Nest é exatamente onde esse endereço já vivia.

### 7ª rodada: o cache da 5ª rodada tinha um bug real, e um vazamento de query string no log

1. **O cache acumulava sondagens travadas em vez de limitá-las a uma.** `expiresAt` era calculado a partir do *início* do probe, não do seu término. Com o banco travado (pool esgotado, conexão semi-aberta) e tráfego contínuo em `GET /` — sem rate limit, pela decisão da 4ª rodada — cada chamador que chegasse depois de 1500ms via o cache como "expirado" e disparava **outra** sondagem real, mesmo com a anterior ainda pendente. Era exatamente o esgotamento do pool que o cache existe para evitar, só que espalhado em várias consultas presas em vez de uma — a garantia descrita em `security-standards.md` não se sustentava nesse cenário específico (o mesmo que o timeout da 4ª rodada existe para cobrir).

   Corrigido trocando o desenho: em vez de guardar `{ expiresAt, result }` a partir da chamada, agora há um campo `pending` (a sondagem em andamento, verificado **primeiro**, sem depender de tempo decorrido) e um `cached` separado (o resultado já resolvido, com sua janela de 1500ms contada a partir do **término** da sondagem, não do início). Enquanto `pending` existir, toda chamada nova recebe a mesma `Promise`, não importa quanto tempo já tenha passado — o que torna a garantia mais forte do que a original: nunca mais de uma sondagem em andamento, período, não só "no máximo uma por janela de 1500ms".

   Novo caso em `health.service.spec.ts`, verificado por reversão deliberada (voltando à versão com `expiresAt` contado da chamada, confirmando que o teste acusa `$queryRaw` chamado 2 vezes em vez de 1, depois restaurando): sondagem nunca resolve (travada), avança 1600ms (passou a janela de 1500ms), uma segunda chamada não dispara uma segunda consulta real.

2. **O log do filtro usava `request.url`, que inclui a query string.** Nenhuma rota atual passa segredo na query string, mas nada impede uma futura de receber um token ou e-mail ali — e esse log roda em **todo** `500` mascarado. Trocado para `request.path` (sem a query string). Novo caso em `all-exceptions.filter.spec.ts` com `url` e `path` deliberadamente diferentes no mock, provando que o log usa o segundo. Verificado por reversão deliberada.

### Outra sugestão da revisão, verificada e **não aplicada**

- **Documentar `@ApiTooManyRequestsResponse` em `GET /`.** Verificado contra o próprio código: em todo o projeto, esse decorator só aparece em handlers com um `@Throttle()` explícito que sobrescreve o limite padrão (`CREATE_POST_THROTTLE`, `CREATE_COMMENT_THROTTLE`, `SIGN_UP_THROTTLE`, `LOGIN_THROTTLE`) — nunca numa rota sob o limite global padrão, como o próprio `GET /posts` (`posts.controller.ts`, handler `list`) já demonstra. `GET /` agora nem está sob o limite padrão (`@SkipThrottle()`, 4ª rodada), o que torna a sugestão ainda menos aplicável do que antes.

### Por que fecha uma lacuna real

O `ErrorResponseDto` existe desde o início como *documentação* do formato padrão do Nest. Com o filter, o formato passa a ser garantido inclusive no caminho hoje menos previsível — a exceção que ninguém escreveu. E o log é a única diferença entre "deu 500 em produção" e "deu 500 em produção por isto, nesta rota".

### Testes

- `all-exceptions.filter.spec.ts` (8 casos): `HttpException` com corpo-objeto sai idêntica; `response.headersSent` termina a conexão com `end()` em vez de tentar re-setar status; erro `http-errors` com `expose: true` (tipo `PayloadTooLargeError`) sai com o próprio status e com `error` computado do status, sem máscara; erro `http-errors` com `expose: false` sai mascarado e logado, igual a um erro desconhecido; `HttpException` com corpo-string (tipo `ThrottlerException`) sai embrulhada em `{ statusCode, message, error }`; `Error` cru sai como `500` mascarado com o logger chamado só nesse caso; o log usa `request.path`, não `request.url` (mock com os dois valores deliberadamente diferentes); um valor lançado que não é `Error` (`throw { code: 'P2002' }`) cai no mesmo caminho mascarado/logado, sem crashar.
- `health.service.spec.ts` (7 casos): reachable quando o banco responde (e confirma que `$queryRaw` foi chamado); chamadas concorrentes coalescem numa única chamada a `$queryRaw`; uma nova chamada após a janela de 1500ms dispara um novo probe; **uma sondagem travada além da janela de 1500ms não dispara uma segunda consulta real** (o bug da 7ª rodada); not reachable e loga quando o banco lança; not reachable quando o probe nunca resolve (com `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`, provando o timeout sem esperar 3s reais); o timer do timeout é limpo quando a query resolve primeiro (`vi.getTimerCount()`).
- `test/security.e2e-spec.ts`: o caso de falha inesperada (banco fora do ar, via `HealthService` sobrescrito) não vaza stack trace nem detalhe interno no corpo; o caso de `413` verifica o corpo inteiro, incluindo `error: 'Payload Too Large'`.
- `test/app.e2e-spec.ts` ganha o caso que todo outro módulo já tinha: `GET /` aparece em `GET /api/docs-json`.
- `test/throttle.e2e-spec.ts` ganha o caso do `@SkipThrottle()`: mais de 100 requisições a `/`, todas `200`.
- A suíte de e2e **inteira** é a rede de proteção: foi exatamente rodá-la por completo, não só os testes novos, que achou os dois primeiros casos (`throttle.e2e-spec.ts` e o `413` em `security.e2e-spec.ts` acusaram na hora); o terceiro (`expose: false`) só a revisão achou, porque nenhum middleware real do projeto produz esse formato hoje.

→ `feat(api): enforce the documented error shape with a global exception filter`

## 3. Healthchecks de container

Depende da etapa 1: o healthcheck precisa de um endpoint real para consultar, não de um probe TCP que seria reescrito em seguida.

### `apps/api/Dockerfile`

A imagem runtime é `node:22-alpine` e instala **apenas** `dumb-init` — não tem `curl`. Em vez de adicionar um pacote só para isso, usar o `fetch` global do Node 22:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Lê `process.env.PORT` em vez de fixar `3000`: `EXPOSE` é só documentação e não muda a porta real que o processo escuta, então um container iniciado com outro `PORT` checaria a porta errada e ficaria `unhealthy` para sempre. Achado na revisão da PR #16. O `||` (em vez de `??`) só cai no fallback quando `PORT` está ausente ou vazio — os dois casos que `src/env.ts`'s `readPositiveInt` também trata como "não definido" — e é o lado certo: `??` manteria um `PORT=""` explícito como string vazia na URL em vez de cair para `3000`.

`start-period` generoso porque `PrismaService.onModuleInit` conecta no boot: antes disso a API legitimamente não responde, e sem essa janela o container seria marcado unhealthy durante a própria partida. `start-interval` (também achado na revisão) existe porque, sem ele, a primeira checagem só roda em T+`interval` (30s) — o `web`, agora com `condition: service_healthy`, esperaria os 30s inteiros em todo cold start mesmo com a API pronta em poucos segundos. Com `start-interval=2s`, medido localmente: `healthy` em 3s.

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

Todos os comandos acima rodaram verdes: `pnpm typecheck` e `pnpm lint` sem erros nos dois apps, `pnpm test:api` com 166 testes (22 arquivos), `pnpm test:api:e2e` com 98 testes (8 arquivos) contra o Postgres real, `pnpm build` compilando `apps/api` e `apps/web`.

Manuais — **executados em 2026-10-08**, resultado abaixo:

- [x] `docker compose up --build api web` → confirmado pelo próprio log de startup do compose: `api` passa por `Starting → Started → Waiting → Healthy` antes de `web` saber de `Created` para `Starting`. `docker compose ps` reporta os dois como `(healthy)`, `curl http://127.0.0.1:3000/` devolve `{"status":"ok"}` e `curl http://127.0.0.1:8080/` devolve `200`. Precisou preencher `CORS_ORIGINS` e `VITE_API_URL` no `.env` da raiz (que só tinha `JWT_SECRET` e as chaves `POSTGRES_*`) a partir do `.env.example`, como previsto.
- [x] `docker stop` no container da API → `real 0m0.681s`, dentro da faixa esperada de ~0,6–0,7s. Sem regressão no `enableShutdownHooks` do `main.ts`.
