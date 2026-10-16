# Arquitetura Backend: Monorepo, Modulos e Bootstrap

> **Publico-alvo:** analistas juniores / trainees.

## Conceito Teorico

### O que e um monorepo?

Imagine que voce trabalha num projeto onde o frontend (a tela que o usuario ve) e o backend (o servidor que responde as requisicoes) vivem em repositorios Git separados. A cada nova funcionalidade voce precisa:

1. Abrir o repositorio do backend, criar a branch, subir as alteracoes.
2. Abrir o repositorio do frontend, criar outra branch, referenciar a mudanca.
3. Coordenar as duas Pull Requests para que nao entrem em producao em ordens erradas.

Um **monorepo** (repositorio unico) elimina essa friccao ao colocar tudo num so lugar. Ferramentas como o **pnpm workspaces** entendem que ha varios "pacotes" (ou _apps_) dentro do mesmo repositorio e gerenciam as dependencias de cada um de forma independente, sem que um interfira no outro.

O beneficio nao e apenas organizacional: num monorepo e possivel compartilhar tipos TypeScript, utilitarios ou regras de lint entre os pacotes sem precisar publicar um pacote npm separado.

### Sistema de modulos do NestJS e Injecao de Dependencia

NestJS organiza a aplicacao em **modulos**. Pense num modulo como uma "caixa" que declara:

- **O que ela fabrica** (`providers`): servicos, guards, filtros.
- **O que ela expoe para fora** (`exports`): o que outras caixas podem pedir.
- **O que ela precisa de fora** (`imports`): outras caixas de quem ela depende.
- **Quais rotas ela registra** (`controllers`): os controladores HTTP.

A **Injecao de Dependencia (DI)** e o mecanismo que faz essa troca acontecer automaticamente. Em vez de um servico criar suas proprias dependencias com `new`, ele as _declara_ no construtor e o Nest se encarrega de instanciar e entregar o objeto correto.

```ts
// Sem DI — o servico cria sua propria dependencia (acoplamento forte):
class PostsService {
  private prisma = new PrismaService(); // ruim: dificulta testes e substituicao
}

// Com DI — o Nest injeta a dependencia (acoplamento fraco):
class PostsService {
  constructor(private readonly prisma: PrismaService) {} // o Nest entrega o PrismaService
}
```

A convencao no Code Connect e **controller fino, service com a logica**: o controller cuida apenas de receber a requisicao HTTP, delegar ao service, e devolver a resposta. Toda regra de negocio fica no service, que pode ser testado sem precisar subir um servidor HTTP.

### ESM no Node.js e a extensao `.js`

O Node.js moderno suporta dois sistemas de modulos:

- **CommonJS (CJS)**: o classico `require()`. Resolve modulos sem extensao.
- **ECMAScript Modules (ESM)**: o padrao da linguagem, com `import`/`export`. Exige que o caminho do import seja exato, incluindo a extensao.

Quando o TypeScript compila para ESM, ele nao altera os caminhos dos imports — ele os copia como estao. Por isso o projeto usa `.js` nos imports de arquivos TypeScript: o TypeScript entende que `.ts` e `.js` sao o mesmo arquivo, mas o Node.js em modo ESM precisa da extensao `.js` no artefato compilado.

```ts
// CORRETO para ESM — o .js existe no artefato compilado:
import { AppModule } from './app.module.js';

// ERRADO — o Node.js nao consegue resolver sem extensao em modo ESM:
import { AppModule } from './app.module';
```

---

## Aplicacao no Code Connect

### Estrutura do monorepo

```
Code-Conect/
├── apps/
│   ├── api/   — NestJS (backend)
│   └── web/   — React + Vite (frontend)
├── pnpm-workspace.yaml
└── package.json   (scripts raiz que delegam para cada app)
```

O arquivo `pnpm-workspace.yaml` diz ao pnpm que tudo dentro de `apps/*` e um pacote gerenciado. O `package.json` raiz expoe scripts de conveniencia como `pnpm dev` (sobe os dois ao mesmo tempo) e `pnpm lint` (roda o linter em todos os pacotes).

### A sequencia de boot: passo a passo

A funcao `bootstrap()` em `apps/api/src/main.ts` inicia a API. A ordem das operacoes nao e arbitraria:

```
1. import './load-env.js'     — carrega o .env no process.env
2. import { env } from './env.js'  — valida tudo de uma vez e lanca erro agregado
3. NestFactory.create(AppModule)   — instancia o grafo de DI
4. app.enableShutdownHooks()       — garante desconexao limpa do banco
5. configureApp(app)               — pipes, helmet, CORS, body limit, trust proxy
6. setupSwagger(app)               — documentacao (apenas se habilitada)
7. app.listen(env.port)            — comeca a aceitar conexoes
```

#### Passo 1: `load-env.ts` — carregando o arquivo `.env`

```ts
// apps/api/src/load-env.ts
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}
```

`process.loadEnvFile()` e a funcao nativa do Node.js (disponivel a partir da versao 20.12) que le o arquivo `.env` e popula `process.env`. O tratamento de erro e intencional: em producao nao existe `.env` (as variaveis sao definidas pelo host), entao `ENOENT` (arquivo nao encontrado) e esperado e silenciado. Qualquer outro erro — como permissao negada — e relancado, pois representa um problema real.

#### Passo 2: `env.ts` — validacao agregada das variaveis de ambiente

```ts
// apps/api/src/env.ts (trecho)
const errors: string[] = [];

function readDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    errors.push('DATABASE_URL must be set (see apps/api/.env.example)');
    return '';
  }
  // ...
}

// ... outras funcoes de leitura ...

if (errors.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n- ${errors.join('\n- ')}\n\nSee apps/api/.env.example.`,
  );
}

export const env = Object.freeze(parsed);
```

O projeto faz X porque Y: em vez de lancar erro na primeira variavel invalida, o `env.ts` **acumula** todos os erros num array e os exibe de uma so vez. Isso evita o ciclo frustrante de "corrigir uma variavel, reiniciar, descobrir a proxima".

O `Object.freeze(parsed)` impede que qualquer codigo altere `env` apos a validacao — o objeto e somente-leitura por design.

#### Passo 3: `app.module.ts` — o modulo raiz e a ordem dos guards

```ts
// apps/api/src/app.module.ts (trecho)
providers: [
  { provide: APP_GUARD, useClass: LoginThrottlerGuard },
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_GUARD, useClass: CsrfGuard },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
],
```

`APP_GUARD` e um token especial do NestJS para guards **globais**: eles rodam em toda requisicao, sem precisar de decorator em cada controller. A **ordem do array importa** — os guards sao executados na sequencia em que aparecem:

| Posicao | Guard | Por que primeiro? |
|---------|-------|-------------------|
| 1o | `LoginThrottlerGuard` | Deve contar a requisicao **antes** de qualquer rejeicao. Se `AuthGuard` rodasse primeiro e recusasse a requisicao, o rate limiter nunca chegaria a contar — um flood nao autenticado nao seria limitado. |
| 2o | `AuthGuard` | Verifica se o usuario tem sessao valida. Roda antes do CSRF para que uma requisicao sem sessao receba `401` (nao autenticado) em vez de `403` (CSRF invalido). |
| 3o | `CsrfGuard` | Verifica o token CSRF. Ja sabe que a requisicao passou pelo rate limiter e tem sessao valida. |

#### Passo 4: `app.setup.ts` — configurando middlewares e pipes globais

```ts
// apps/api/src/app.setup.ts (trecho)
export function configureApp(app: NestExpressApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.use(helmet({ /* ... */ }));
  app.enableCors(getCorsOptions());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT }); // 10 KB
  if (env.trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', env.trustProxy);
  }
}
```

`configureApp` e exportada e usada tanto por `main.ts` quanto pelos testes e2e — assim ambos rodam com exatamente a mesma configuracao de validacao, CORS, cabecalhos e limite de body.

**`whitelist: true`**: remove automaticamente qualquer campo do body que nao esteja declarado no DTO. Impede que dados extras "vazem" para a camada de servico.

**`forbidNonWhitelisted: true`**: se um campo extra chegar, lanca `400` em vez de silenciosamente ignora-lo — ajuda a detectar erros de integracao mais cedo.

**`helmet` antes de `enableCors`**: o middleware `cors` faz curto-circuito no preflight OPTIONS e nunca chama `next()`. Se o `helmet` fosse registrado depois, ele nunca rodaria para requisicoes OPTIONS e o cabecalho `X-Powered-By` nao seria removido nessas respostas.

#### O controller fino: `app.controller.ts`

```ts
// apps/api/src/app.controller.ts (trecho)
@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @NoCsrf()
  @SkipThrottle()
  @Get()
  async getHealth(): Promise<HealthResponseDto> {
    const reachable = await this.healthService.isDatabaseReachable();
    if (!reachable) throw new ServiceUnavailableException('Database unreachable');
    return { status: 'ok' };
  }
}
```

O controller nao tem logica de negocio: ele chama `healthService.isDatabaseReachable()` e decide qual resposta HTTP retornar. A logica de "como checar o banco" fica no `HealthService`.

`@SkipThrottle()` esta aqui de proposito: probes de infraestrutura (Docker HEALTHCHECK, monitores de uptime) consultam esse endpoint com frequencia. Se ficasse sob o limite de 100 req/min, uma sonda agressiva poderia receber `429` e reportar o servidor como "nao saudavel" — o proprio health check se tornando o motivo da falha.

### O padrao `@Global()`: `PrismaModule`

```ts
// apps/api/src/prisma/prisma.module.ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Normalmente, para usar `PrismaService` em `PostsModule` voce precisaria importar `PrismaModule` dentro de `PostsModule`. Com `@Global()`, basta registrar o modulo uma unica vez no modulo raiz (`AppModule`) e o `PrismaService` fica disponivel em toda a aplicacao sem imports repetitivos.

Use `@Global()` com moderacao: e util para dependencias de infraestrutura (banco de dados, cache, logger) que realmente precisam estar em todo lugar. Para modulos de dominio (posts, users), prefira imports explicitos — eles tornam as dependencias rastreiaveis.

```ts
// apps/api/src/prisma/prisma.service.ts (trecho)
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
```

- **`OnModuleInit`**: o Nest chama `onModuleInit` durante a inicializacao. Conectar ao banco aqui garante que a API falha imediatamente se o banco nao estiver acessivel, em vez de falhar na primeira requisicao real.
- **`OnModuleDestroy`**: o Nest chama `onModuleDestroy` quando recebe SIGTERM/SIGINT (graceful shutdown). A conexao e fechada de forma limpa, sem deixar conexoes abertas no pool.
- **`omit: { user: { passwordHash: true } }`**: defesa em profundidade — o campo `passwordHash` nunca retorna em nenhuma query, a menos que o ponto de chamada explicitamente opte por isso. Sem isso, o hash poderia vazar em logs, dumps de erro ou endpoints futuros por descuido.

### `RequestIdInterceptor` — rastreabilidade de requisicoes

Registrado globalmente via `APP_INTERCEPTOR` no `AppModule` (antes dos guards, pois interceptores executam na ordem inversa à de saída):

```ts
// app.module.ts
{ provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor }
```

**Fluxo de execucao:**

1. O interceptor le o header `X-Request-ID` da requisicao de entrada.
2. Se ausente, gera um UUID v4 com `randomUUID()` do modulo nativo `node:crypto`.
3. Injeta o valor final no header de resposta (`X-Request-ID`) e loga `[<id>] METHOD /path`.

```ts
// request-id.interceptor.ts
const requestId =
  (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

res.setHeader('x-request-id', requestId);
this.logger.log(`[${requestId}] ${req.method} ${req.path}`);
```

**Por que propagar o ID enviado pelo cliente?**
Quando um servico externo (API Gateway, frontend) ja atribuiu um ID a uma transacao, repassar o mesmo valor permite correlacionar logs de varios sistemas sem ter que mapear IDs diferentes — o ID atravessa toda a cadeia de chamadas.

### `HealthController` — liveness e readiness probes

```
GET /health/live   — liveness probe
GET /health/ready  — readiness probe
```

Ambos sao publicos (`@Public()`), sem CSRF (`@NoCsrf()`) e sem rate limit (`@SkipThrottle()`), pelos mesmos motivos do `AppController.getHealth()`.

#### Diferenca entre liveness e readiness

| Probe       | O que verifica                     | Resposta tipica              | Quem usa                         |
|-------------|-----------------------------------|------------------------------|----------------------------------|
| **liveness**  | O processo esta rodando           | `200 { status: 'ok' }` (sincrono) | Docker HEALTHCHECK, monitors de uptime |
| **readiness** | O processo **e** o banco estao prontos | `200` (DB ok) / `503` (DB inalcancavel) | Orquestradores (K8s) para roteamento de trafego |

A separacao importa para evitar reinicializacoes desnecessarias: se o banco tiver uma falha transitoria, o container nao esta "morto" (liveness ok) mas nao deve receber trafego novo (readiness falha).

```ts
// health.controller.ts
@Get('live')
live(): HealthResponseDto {
  return { status: 'ok' }; // sincrono, sem I/O
}

@Get('ready')
@HealthCheck()
ready() {
  return this.health.check([() => this.dbIndicator.isHealthy()]);
}
```

O `DatabaseHealthIndicator` delega para `HealthService.isDatabaseReachable()` (com cache e coalescing) e usa a API do `@nestjs/terminus` para retornar o `HealthCheckResult` padronizado:

```ts
// database.health-indicator.ts
async isHealthy(): Promise<HealthIndicatorResult<'database'>> {
  const reachable = await this.healthService.isDatabaseReachable();
  const session = this.healthIndicatorService.check('database');
  return reachable ? session.up() : session.down('Database unreachable');
}
```

O Dockerfile usa `GET /health/live` no `HEALTHCHECK` (e nao `/health/ready`) porque o Docker nao tem acesso ao banco em tempo de build — a probe de liveness e suficiente para verificar se o container esta respondendo.

---

## Erros Comuns e Armadilhas

### 1. Importar sem `.js` em um projeto ESM

```ts
// ERRADO — Node.js nao resolve em modo ESM:
import { AppModule } from './app.module';

// CORRETO — extensao obrigatoria:
import { AppModule } from './app.module.js';
```

O TypeScript aceita as duas formas, mas o artefato compilado so funciona com `.js`. O erro em runtime e `ERR_MODULE_NOT_FOUND`, que pode ser confuso porque o arquivo `.ts` existe.

### 2. Trocar a ordem dos guards e quebrar o rate limiting

Se `AuthGuard` vier antes de `LoginThrottlerGuard`, uma requisicao sem sessao valida sera rejeitada pelo `AuthGuard` (que lanca `UnauthorizedException`) antes de o throttler ter a chance de contar. Um atacante fazendo flood em uma rota protegida nunca seria limitado, porque o guard que limita nunca chegaria a executar.

### 3. Registrar `helmet` depois de `enableCors`

O middleware `cors` intercepta requisicoes OPTIONS e nao chama `next()`. Se `helmet` for registrado depois, ele nunca roda para preflights, e cabecalhos de seguranca como `X-Powered-By: Express` vazam nessas respostas.

### 4. Usar `trust proxy: true` em vez de um numero

```ts
// PERIGOSO — confia em toda a cadeia X-Forwarded-For:
app.set('trust proxy', true);

// CORRETO — confia em exatamente N hops:
app.set('trust proxy', 1); // um reverse proxy na frente
```

Com `true`, qualquer cliente pode forjar o header `X-Forwarded-For` e se passar por outro IP, contornando o rate limiter.

### 5. Esquecer `enableShutdownHooks()`

Sem esse metodo, um SIGTERM mata o processo imediatamente. `OnModuleDestroy` nunca e chamado, e o `PrismaService` nao desconecta do banco — conexoes ficam abertas no pool ate o timeout do PostgreSQL.

### 6. Lancar o primeiro erro de validacao de env

```ts
// RUIM — usuario descobre um problema por vez:
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');

// BOM — todos os erros de uma vez:
const errors: string[] = [];
if (!process.env.DATABASE_URL) errors.push('DATABASE_URL missing');
if (!process.env.JWT_SECRET) errors.push('JWT_SECRET missing');
if (errors.length > 0) throw new Error(errors.join('\n'));
```

O padrao de acumulacao e especialmente util em ambientes de CI/CD, onde cada reinicializacao custa tempo.

### 7. Declarar `APP_GUARD` em modulos diferentes

Antes do refactoring, o `AuthGuard` era declarado no `AuthModule` e o `ThrottlerGuard` no `AppModule`. O NestJS nao garante a ordem de resolucao de `APP_GUARD` entre modulos distintos, entao a ordem de execucao podia variar conforme a ordem de imports. Hoje todos os guards globais vivem no array de `providers` do `AppModule`, onde a ordem e explicita e deterministica.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Ponto de entrada — funcao `bootstrap` | [apps/api/src/main.ts](../../apps/api/src/main.ts) | L9–L25 |
| Carregamento do `.env` com `process.loadEnvFile()` | [apps/api/src/load-env.ts](../../apps/api/src/load-env.ts) | L3–L13 |
| Validacao agregada das variaveis de ambiente | [apps/api/src/env.ts](../../apps/api/src/env.ts) | L10–L217 |
| Modulo raiz e ordem dos guards globais | [apps/api/src/app.module.ts](../../apps/api/src/app.module.ts) | L27–L46 |
| Configuracao de middlewares, pipes e CORS | [apps/api/src/app.setup.ts](../../apps/api/src/app.setup.ts) | L17–L60 |
| Controller fino com health check | [apps/api/src/app.controller.ts](../../apps/api/src/app.controller.ts) | L17–L44 |
| `@Global()` e ciclo de vida do PrismaModule | [apps/api/src/prisma/prisma.module.ts](../../apps/api/src/prisma/prisma.module.ts) | L1–L9 |
| `OnModuleInit`/`OnModuleDestroy` e `omit` | [apps/api/src/prisma/prisma.service.ts](../../apps/api/src/prisma/prisma.service.ts) | L7–L32 |
| Constantes de throttle (default 100/min) | [apps/api/src/common/throttle.constants.ts](../../apps/api/src/common/throttle.constants.ts) | L7 |
| `RequestIdInterceptor` — propagacao e geracao de UUID | [apps/api/src/common/interceptors/request-id.interceptor.ts](../../apps/api/src/common/interceptors/request-id.interceptor.ts) | L10–L26 |
| Registro global do interceptor via `APP_INTERCEPTOR` | [apps/api/src/app.module.ts](../../apps/api/src/app.module.ts) | L28 |
| `HealthController` — liveness e readiness | [apps/api/src/health/health.controller.ts](../../apps/api/src/health/health.controller.ts) | L21–L42 |
| `DatabaseHealthIndicator` — adaptador terminus | [apps/api/src/health/database.health-indicator.ts](../../apps/api/src/health/database.health-indicator.ts) | L6–L17 |

---

_Ultima atualizacao: 2026-10-15 | Gerado a partir do codigo-fonte._
