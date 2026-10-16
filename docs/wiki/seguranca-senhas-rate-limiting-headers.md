# Segurança: Senhas, Rate Limiting e Headers

> **Público-alvo:** analistas juniores / trainees.

## Conceito Teórico

Segurança em aplicações web não é uma feature isolada — é uma camada que permeia senha, tráfego e resposta HTTP. Este artigo cobre três grandes áreas:

1. **Hashing de senhas** — como armazenar credenciais de forma que, mesmo com o banco de dados vazado, as senhas dos usuários permaneçam seguras.
2. **Rate limiting** — como controlar o volume de requisições para dificultar ataques de força bruta e spam.
3. **Headers de segurança e mascaramento de erros** — como o servidor se apresenta ao mundo e o que revela (ou não revela) quando algo dá errado.

### Por que não usar MD5 ou SHA para senhas?

MD5 e SHA-256 são algoritmos de *hashing rápido*: um computador moderno consegue testar bilhões de candidatos por segundo. Isso os torna ótimos para checksums de arquivo, mas péssimos para senhas. Um atacante com o banco de dados pode usar uma GPU para testar dicionários inteiros em minutos.

A solução é o **key stretching** — usar um algoritmo projetado para ser *lento e caro de memória* de propósito. O projeto usa **scrypt**, que exige uma quantidade configurável de RAM por operação, tornando ataques em paralelo (GPU, FPGA) muito mais caros.

O parâmetro central é `N` (cost factor). O OWASP recomenda `N >= 2^17` (131072) para logins interativos como mínimo a partir de 2023. Com `r=8`, isso exige **128 MB de RAM** por operação — um atacante com 100 GPUs ainda precisa de 100 × 128 MB só para rodar em paralelo.

### O que é um timing side-channel?

Imagine que seu código de login seja:

```
1. Busca o usuário no banco pelo email
2. Se não encontrar → retorna 401 imediatamente
3. Se encontrar → compara a senha (operação lenta, ~100ms)
4. Se a senha estiver errada → retorna 401
```

O passo 2 é *visivelmente mais rápido* que o passo 4. Um atacante pode medir o tempo de resposta e descobrir quais e-mails estão cadastrados — mesmo que a mensagem de erro seja idêntica em ambos os casos. Isso é um **timing side-channel**: informação vazando pelo canal de tempo, não pelo canal de conteúdo.

A defesa é garantir que o código sempre execute o mesmo trabalho, independente do e-mail existir ou não.

### Migração transparente de hashes legados

Sistemas evoluem: o que era seguro em 2020 (N=16384) pode ser inadequado em 2026 (N=131072). A abordagem mais simples seria invalidar todas as senhas e forçar redefinição, mas isso é traumático para os usuários. A alternativa é **migração transparente**: na próxima vez que o usuário logar com sucesso, re-hashear a senha com os parâmetros novos e salvar silenciosamente. O usuário não percebe nada.

Para isso funcionar, o formato do hash precisa carregar seus próprios parâmetros — assim o código sempre sabe com qual custo o hash foi gerado.

---

## Aplicação no Code Connect

### Hashing de senhas (`apps/api/src/users/password.ts`)

O projeto implementa tudo acima em um único arquivo com cinco exportações:

**1. `hashPassword` — gerando um novo hash**

```ts
// apps/api/src/users/password.ts (linhas 36–43)
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, {
    ...CURRENT_PARAMS,   // { N: 2^17, r: 8, p: 1 }
    maxmem: MAX_MEM,     // 256 MB — necessário pois N=2^17,r=8 usa 128 MB
  });
  return formatHash(CURRENT_PARAMS, salt, hash);
}
```

O resultado é uma string no formato:

```
scrypt$N=131072,r=8,p=1$9fc2a80d057f7a9e...$d0dbf607256887c7...
```

Os parâmetros (`N`, `r`, `p`) ficam gravados *dentro* do hash. Isso é essencial para `shouldRehash` funcionar: você pode comparar os parâmetros do hash armazenado com `CURRENT_PARAMS` para saber se precisa de atualização.

**Por que o `Node.js` precisou de `maxmem: 256 MB`?** O Node tem um limite padrão de 32 MB para scrypt. Com N=2^17 e r=8, a fórmula `128 * N * r` dá exatamente 128 MB — acima do padrão. Sem o `maxmem` explícito, a chamada lançaria um erro na produção.

**2. Formato versionado vs. formato legado**

O projeto reconhece dois formatos:

| Formato | Exemplo | Parâmetros |
|---------|---------|------------|
| Versionado (atual) | `scrypt$N=131072,...$salt$hash` | Lidos do próprio string |
| Legado (antigo) | `saltHex:hashHex` | Assumido N=16384 (`LEGACY_PARAMS`) |

```ts
// apps/api/src/users/password.ts (linhas 89–91)
function parseStored(stored: string): ParsedHash | undefined {
  return stored.startsWith('scrypt$') ? parseVersioned(stored) : parseLegacy(stored);
}
```

O parser tenta o formato versionado primeiro. Se não começa com `scrypt$`, assume o legado. Isso garante retrocompatibilidade: contas antigas continuam funcionando sem migração forçada.

**3. `DUMMY_HASH` — prevenção de timing side-channel**

```ts
// apps/api/src/users/password.ts (linhas 113–114)
export const DUMMY_HASH =
  'scrypt$N=131072,r=8,p=1$9fc2a80d057f7a9e3c9eae1f444070b7$d0dbf60725...';
```

E seu uso em `verifyUserPassword`:

```ts
// apps/api/src/users/password.ts (linhas 122–127)
export async function verifyUserPassword(
  user: { passwordHash: string | null } | null,
  password: string,
): Promise<boolean> {
  return verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
}
```

Quando o e-mail não existe (`user` é `null`) ou a conta foi criada via OIDC sem senha local (`passwordHash` é `null`), o código ainda executa `verifyPassword` — só que contra o `DUMMY_HASH`. Isso garante que o tempo de resposta seja sempre ~100ms, independente de o e-mail existir ou não.

Detalhe importante: o `DUMMY_HASH` é pré-computado (uma string literal), não calculado na inicialização. Se fosse calculado em cada boot, custaria 128 MB de RAM e ~100ms toda vez que o servidor reiniciasse — sem nenhum benefício.

**4. `verifyPassword` — comparação segura em tempo constante**

```ts
// apps/api/src/users/password.ts (linhas 103)
return parsed.hash.length === actual.length && timingSafeEqual(parsed.hash, actual);
```

O `timingSafeEqual` do Node compara dois buffers em tempo constante — sem curto-circuito ao encontrar o primeiro byte diferente. Comparações normais (`===`) em strings podem vazar informação pelo tempo quando bytes divergem no início vs. no fim.

**5. `shouldRehash` — migração transparente**

```ts
// apps/api/src/users/password.ts (linhas 133–141)
export function shouldRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) return true;
  return (
    parsed.params.N !== CURRENT_PARAMS.N ||
    parsed.params.r !== CURRENT_PARAMS.r ||
    parsed.params.p !== CURRENT_PARAMS.p
  );
}
```

O `AuthService`, após um login bem-sucedido, chama `shouldRehash`. Se retornar `true` (hash legado ou parâmetros desatualizados), ele re-hasheia a senha com `CURRENT_PARAMS` e persiste o resultado. Na próxima vez que o mesmo usuário logar, já usará o hash atualizado.

---

### Rate Limiting — os 5 tiers (`apps/api/src/common/throttle.constants.ts`)

O projeto define cinco limites explícitos por IP:

```ts
// apps/api/src/common/throttle.constants.ts (linhas 7–15)
export const DEFAULT_THROTTLE      = { ttl: 60_000, limit: 100 };  // toda rota
export const LOGIN_THROTTLE        = { limit: 5,  ttl: 60_000 };   // /auth/login
export const SIGN_UP_THROTTLE      = { limit: 3,  ttl: 60_000 };   // /users
export const CREATE_POST_THROTTLE  = { limit: 10, ttl: 60_000 };   // publicações
export const CREATE_COMMENT_THROTTLE = { limit: 20, ttl: 60_000 }; // comentários
```

**Por que tiers diferentes?**

- `DEFAULT_THROTTLE (100/min)` — abrange toda rota sem decorador específico. Um usuário navegando normalmente nunca chega perto disso.
- `LOGIN_THROTTLE (5/min)` — tentativas de força bruta (adivinhar senha) ficam limitadas a 5 tentativas por minuto por IP. Após a 5ª, o servidor responde `429 Too Many Requests` com um header `Retry-After`.
- `SIGN_UP_THROTTLE (3/min)` — criação massiva de contas (spam, bots) é bloqueada antes de escalar.
- `CREATE_POST_THROTTLE (10/min)` — spam de publicações é mitigado sem incomodar usuários legítimos que escrevem várias respostas seguidas.
- `CREATE_COMMENT_THROTTLE (20/min)` — comentários são mais frequentes que posts, então o limite é mais generoso.

O `ThrottlerModule` é configurado como `APP_GUARD` — ou seja, aplica-se *globalmente* a todas as rotas automaticamente, sem precisar decorar cada controller. Rotas que precisam de um tier específico usam `@Throttle({ default: LOGIN_THROTTLE })`.

---

### O bucket compartilhado (`apps/api/src/common/login-throttler.guard.ts`)

Este é um dos detalhes de segurança mais sutis do projeto. Duas rotas verificam senha do usuário local:

- `POST /auth/login` — login direto com e-mail e senha
- `POST /auth/oidc/link` — vinculação de conta social (também exige confirmação de senha)

Se cada rota tiver seu próprio bucket independente, um atacante tem **10 tentativas/min** contra a mesma senha (5 em `/auth/login` + 5 em `/auth/oidc/link`), não 5. Obter um `linking_token` para usar `/auth/oidc/link` não custa nada — é emitido automaticamente quando o e-mail já existe.

A solução é o `LoginThrottlerGuard`, que sobrescreve `generateKey`. Cada rota que verifica senha anota `@ThrottleBucket('shared-password-guess')`; o guard lê esse metadado via Reflector e usa o nome do bucket como prefixo da chave:

```ts
// apps/api/src/common/login-throttler.guard.ts
protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
  const bucket = this.reflector.get<string | undefined>(THROTTLE_BUCKET_KEY, context.getHandler());
  const prefix = bucket ?? `${context.getClass().name}.${context.getHandler().name}`;
  return `${prefix}-${name}-${suffix}`;
}
```

```ts
// apps/api/src/auth/auth.controller.ts
@ThrottleBucket('shared-password-guess')
async login(...) { ... }

// apps/api/src/auth/oidc/oidc.controller.ts
@ThrottleBucket('shared-password-guess')
async link(...) { ... }
```

**Por que usar um decorator em vez de uma lista hardcoded de referências de método?**

A abordagem anterior usava um `Set` com `AuthController.prototype.login.name` e `OidcController.prototype.link.name`. Isso importava os controllers dentro do guard, criando um risco de ciclo de dependência (TDZ — *Temporal Dead Zone*) e acoplamento desnecessário. Com `@ThrottleBucket`, o guard não precisa conhecer nenhum controller — qualquer rota futura que precise do bucket compartilhado simplesmente adiciona o decorator.

O teste e2e em `apps/api/test/throttle.e2e-spec.ts` (linhas 69–96) valida exatamente isso: divide as tentativas entre as duas rotas e verifica que o 429 é atingido na contagem total combinada.

---

### HealthService: `@SkipThrottle` + cache + `inFlightQuery` (`apps/api/src/health/health.service.ts`)

O endpoint `GET /` é o health check — infraestrutura (Docker, Kubernetes, load balancers) o consulta frequentemente. Ele tem três proteções contra sobrecarga:

**1. `@SkipThrottle`** — o health check está isento do rate limit global. Se não estivesse, um pico de requisições ao `/` poderia retornar `429`, fazendo a infraestrutura interpretar o serviço como *não saudável* — o que causaria reinicializações desnecessárias, criando um ciclo vicioso.

**2. Cache de 1,5 s** — toda chamada dentro da janela de `PROBE_CACHE_MS = 1_500ms` após a última probe completar reutiliza o resultado em memória. Mil requisições simultâneas ao `/` custam apenas uma query ao banco.

```ts
// apps/api/src/health/health.service.ts (linhas 56–65)
if (this.pending) {
  return this.pending;         // coalescência: retorna a probe em andamento
}
const now = Date.now();
if (this.cached && this.cached.expiresAt > now) {
  return Promise.resolve(this.cached.value);  // resultado cacheado
}
```

**3. `inFlightQuery`** — Prisma não tem cancelamento de query. Se a probe atingir o timeout de 3 s e o `Promise.race` desistir de esperar, a query original *ainda está rodando* e mantém uma conexão do pool aberta. Sem `inFlightQuery`, cada vez que o cache expirasse enquanto o banco estivesse lento, uma nova query seria emitida — acumulando conexões presas até esgotar o pool.

```ts
// apps/api/src/health/health.service.ts (linha 102)
if (!this.inFlightQuery) {
  const query = this.prisma.$queryRaw`SELECT 1`;
  this.inFlightQuery = query;   // reutilizado nas próximas probe() se ainda pendente
  // ...
}
```

O diagrama de estado da probe:

```
isDatabaseReachable()
  ├─ pending?  → retorna a promise existente (coalescência)
  ├─ cached?   → retorna valor em memória
  └─ novo probe:
       ├─ inFlightQuery existente?  → reutiliza
       └─ nova $queryRaw `SELECT 1`
            ├─ resolve em < 3s  → cached = true, pending = null
            └─ timeout 3s       → cached = false, pending = null
                                   (query original ainda corre, inFlightQuery aponta pra ela)
```

---

### Headers de segurança — a ordem importa (`apps/api/src/app.setup.ts`)

O projeto registra o `helmet` **antes** de `enableCors`:

```ts
// apps/api/src/app.setup.ts (linhas 31–48)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);
app.enableCors(getCorsOptions());
```

**Por que essa ordem é crítica?** O pacote `cors` intercepta requisições `OPTIONS` (preflight de CORS) e responde *imediatamente*, sem chamar `next()`. Se o `helmet` fosse registrado depois, ele nunca rodaria para esses requests — e o header `X-Powered-By: Express` seria retornado sem ser removido, revelando a stack tecnológica ao atacante.

Esse bug foi descoberto *ao vivo*, fazendo um `curl` de preflight OPTIONS contra a imagem Docker construída. Sem testar a imagem real, o problema passaria despercebido indefinidamente.

O `helmet` configura automaticamente vários headers de segurança:

| Header | Valor padrão do helmet | Propósito |
|--------|----------------------|-----------|
| `X-Content-Type-Options` | `nosniff` | Impede que o browser "adivinhe" o MIME type |
| `X-Frame-Options` | `SAMEORIGIN` | Evita clickjacking via iframe |
| `Strict-Transport-Security` | `max-age=15552000` | Força HTTPS por 180 dias |
| `X-Powered-By` | *(removido)* | Não revelar tecnologia de backend |
| `Content-Security-Policy` | `default-src 'self'` | Limita origens de scripts/recursos |

A `Content-Security-Policy` foi ajustada para incluir `'unsafe-inline'` em `script-src` — o Swagger UI usa um `<script>` inline para se inicializar. A exceção é justificada pois a API não serve HTML além da página do Swagger.

**CORS (`apps/api/src/cors.ts`)**

```ts
// apps/api/src/cors.ts (linhas 22–31)
return {
  origin: getCorsOrigins(),         // lista explícita de origens permitidas
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  exposedHeaders: ['Location', 'Retry-After'],
  maxAge: 600,                      // preflight válido por 10 minutos
  credentials: true,                // necessário para cookies de sessão
};
```

Pontos importantes:
- **Nunca wildcard com credentials.** `Access-Control-Allow-Origin: *` e `Access-Control-Allow-Credentials: true` juntos são rejeitados pelo browser — e por boas razões. O projeto usa uma lista explícita.
- **Em produção sem `CORS_ORIGINS`**, a lista fica vazia: todos os browsers são recusados. Isso falha na inicialização (`env.ts` agrega o erro) em vez de deixar a API silenciosamente inacessível.
- **`X-CSRF-Token` na allowlist** — o frontend precisa enviar esse header para as rotas que mutam estado.
- **`Retry-After` nos exposedHeaders** — o browser só permite que JavaScript leia headers que estão explicitamente nessa lista. Sem isso, o frontend não conseguiria implementar backoff após um 429.

**Body limit (`app.setup.ts`, linha 49)**

```ts
app.useBodyParser('json', { limit: '10kb' });
```

O limite padrão do Express é 100 KB. Para DTOs de nome/e-mail/senha, 10 KB é mais que suficiente — e elimina um vetor de DoS barato onde um atacante envia payloads JSON gigantes para consumir memória.

---

### AllExceptionsFilter — mascaramento de erros (`apps/api/src/common/filters/all-exceptions.filter.ts`)

Sem um filtro de exceções, qualquer `throw` não tratado dentro de um service poderia vazar o stack trace completo — incluindo mensagens do Prisma com nomes de tabelas e colunas — para o cliente.

O filtro funciona em três branches:

```
Exceção recebida
  ├─ HttpException (ex: BadRequestException, UnauthorizedException)
  │    → resposta passa direto (já formatada pelo NestJS)
  │    → NÃO loga (401, 404, 429 são operação normal, não bugs)
  │
  ├─ http-errors shape (ex: PayloadTooLargeError do body-parser)
  │    → só passa se expose === true (HTTP 4xx)
  │    → body seguro para o cliente
  │
  └─ Qualquer outra coisa (bug real, erro de Prisma, etc.)
       → resposta: { statusCode: 500, message: "Internal server error" }
       → loga o stack trace no servidor (logger.error)
       → NUNCA expõe detalhes ao cliente
```

**Por que `expose === true` especificamente?**

O pacote `http-errors` seta `expose` como `(status < 500)`: erros 4xx são considerados seguros para o cliente ver; erros 5xx, não. Checar `expose === true` (e não só `typeof expose === 'boolean'`) segue exatamente essa semântica.

**Log com `request.path`, não `request.url`:**

```ts
// apps/api/src/common/filters/all-exceptions.filter.ts (linha 107)
this.logger.error(`${request.method} ${request.path}`, error.stack);
```

`request.url` inclui a query string. Uma rota de busca como `GET /posts?q=senha_do_usuario` logaria a senha. `request.path` retorna apenas o caminho, sem parâmetros.

---

### Validação de ambiente (`apps/api/src/env.ts`)

O módulo `env.ts` é importado *antes* de qualquer outro módulo em `main.ts`. Ele valida todas as variáveis de ambiente na inicialização e **agrega** todos os erros antes de lançar:

```ts
// apps/api/src/env.ts (linhas 211–215)
if (errors.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n- ${errors.join('\n- ')}\n\nSee apps/api/.env.example.`,
  );
}
```

Isso significa que um `.env` com três variáveis erradas mostra os três problemas de uma vez, em vez de um por reinicialização.

**Cross-validação de secrets:**

```ts
// apps/api/src/env.ts (linhas 143–148)
if (raw === process.env.JWT_SECRET) {
  errors.push('OIDC_LINKING_TOKEN_SECRET must not be the same value as JWT_SECRET');
}
if (raw === process.env.CSRF_SECRET) {
  errors.push('OIDC_LINKING_TOKEN_SECRET must not be the same value as CSRF_SECRET');
}
```

Se `OIDC_LINKING_TOKEN_SECRET` for igual ao `JWT_SECRET`, um vazamento de qualquer um dos dois comprometeria ambos. O módulo rejeita essa configuração na inicialização — antes de aceitar qualquer requisição.

**`TRUST_PROXY` — por que nunca `true`:**

```ts
// apps/api/src/env.ts (linhas 98–112)
// Nunca `true`: trusting the entire X-Forwarded-For chain would let a client
// set its own and spoof any IP, defeating the limiter instead of fixing it.
```

`TRUST_PROXY=true` faria o Express confiar em toda a cadeia `X-Forwarded-For` — que *qualquer cliente* pode falsificar. O rate limiter leria o IP forjado e o atacante poderia usar quantos IPs quiser. O projeto aceita apenas um número inteiro (contagem de hops confiáveis).

---

## Erros Comuns e Armadilhas

**1. Registrar `helmet` depois de `enableCors`**

O `cors` middleware intercepta `OPTIONS` e não chama `next()`. Headers como `X-Powered-By` não são removidos em preflights — revelando a stack ao atacante. Sempre registre `helmet` antes.

**2. Usar `TRUST_PROXY=true` em vez de um número**

Com `true`, qualquer cliente pode adicionar um IP falso ao `X-Forwarded-For` e contornar o rate limiter por completo. Use o número exato de hops de proxy confiáveis (geralmente `1` para um único load balancer).

**3. Não usar `verifyUserPassword` e chamar `verifyPassword` direto em lógica de login**

`verifyPassword` não sabe o que fazer quando o usuário não existe. Chamar ela diretamente em um `if (user) { verify } else { return 401 }` recria o timing side-channel. Use sempre `verifyUserPassword`, que inclui o fallback para `DUMMY_HASH`.

**4. Adicionar `'unsafe-inline'` a todos os scripts "por precaução"**

A exceção da CSP no Code Connect é estritamente para o Swagger UI. Em uma app React/Vue/Angular sem Swagger, `'unsafe-inline'` anula grande parte da proteção da CSP. Considere usar nonces ou hashes para scripts inline necessários.

**5. Colocar `shouldRehash` como lógica de background job**

`shouldRehash` foi projetado para rodar *sincrono ao login bem-sucedido*, quando a senha em plaintext ainda está disponível em memória. Em um background job você não tem mais a senha — apenas o hash. Não há como re-hashear sem a senha original.

**6. Logar `request.url` em vez de `request.path` em filtros de exceção**

Se a query string contiver dados sensíveis (tokens, e-mails, termos de busca), eles vão parar nos logs do servidor — potencialmente indexados por ferramentas de monitoramento. Use `request.path`.

**7. Esquecer `Retry-After` nos `exposedHeaders` do CORS**

O header `Retry-After` é enviado pelo ThrottlerGuard no 429, mas o browser bloqueia acesso a ele pelo JavaScript por padrão. Sem adicioná-lo a `exposedHeaders`, o frontend não consegue implementar backoff automático — os usuários só veem uma mensagem de erro genérica.

**8. Medir o cache do `HealthService` a partir da *chamada*, não do *resultado***

Se o cache expirasse 1,5 s após a *chamada* que iniciou a probe, e a probe demorasse 2 s, o cache já estaria expirado quando o resultado chegasse — cada nova requisição emitiria uma query nova enquanto a anterior ainda rodava. O projeto inicia a janela no *resultado* (`Date.now() + PROBE_CACHE_MS` dentro do `.then()`), garantindo que ao menos 1,5 s se passem antes do próximo round trip.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| `hashPassword` com scrypt N=2^17 | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 36–43 |
| `CURRENT_PARAMS` e `LEGACY_PARAMS` | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 19, 27 |
| Formato versionado `scrypt$N=...` | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 29–31 (formatHash) |
| Parser versionado vs. legado | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 51–91 |
| `DUMMY_HASH` pré-computado | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 113–114 |
| `verifyUserPassword` com fallback | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 122–127 |
| `timingSafeEqual` | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linha 103 |
| `shouldRehash` | [apps/api/src/users/password.ts](../../apps/api/src/users/password.ts) | linhas 133–141 |
| 5 tiers de throttle | [apps/api/src/common/throttle.constants.ts](../../apps/api/src/common/throttle.constants.ts) | linhas 7–15 |
| Bucket compartilhado via `@ThrottleBucket` + Reflector | [apps/api/src/common/login-throttler.guard.ts](../../apps/api/src/common/login-throttler.guard.ts) | todos |
| Decorator `@ThrottleBucket` | [apps/api/src/common/throttle-bucket.decorator.ts](../../apps/api/src/common/throttle-bucket.decorator.ts) | todos |
| `@SkipThrottle` + cache + inFlightQuery | [apps/api/src/health/health.service.ts](../../apps/api/src/health/health.service.ts) | linhas 15, 53–85, 101–124 |
| Ordem helmet → enableCors | [apps/api/src/app.setup.ts](../../apps/api/src/app.setup.ts) | linhas 28–48 |
| CSP com `'unsafe-inline'` para Swagger | [apps/api/src/app.setup.ts](../../apps/api/src/app.setup.ts) | linhas 38–44 |
| Body limit 10 KB | [apps/api/src/app.setup.ts](../../apps/api/src/app.setup.ts) | linha 49 |
| TRUST_PROXY como hop count | [apps/api/src/app.setup.ts](../../apps/api/src/app.setup.ts) | linhas 54–59 |
| CORS com lista explícita + credentials | [apps/api/src/cors.ts](../../apps/api/src/cors.ts) | linhas 22–31 |
| `Retry-After` em exposedHeaders | [apps/api/src/cors.ts](../../apps/api/src/cors.ts) | linha 27 |
| AllExceptionsFilter — 3 branches | [apps/api/src/common/filters/all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts) | linhas 44–117 |
| `request.path` vs. `request.url` | [apps/api/src/common/filters/all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts) | linha 107 |
| Validação agregada de env | [apps/api/src/env.ts](../../apps/api/src/env.ts) | linhas 211–215 |
| Cross-validation de secrets | [apps/api/src/env.ts](../../apps/api/src/env.ts) | linhas 143–148 |
| TRUST_PROXY nunca `true` | [apps/api/src/env.ts](../../apps/api/src/env.ts) | linhas 103–112 |
| Testes e2e de throttle | [apps/api/test/throttle.e2e-spec.ts](../../apps/api/test/throttle.e2e-spec.ts) | linhas 38–155 |
| Teste bucket compartilhado | [apps/api/test/throttle.e2e-spec.ts](../../apps/api/test/throttle.e2e-spec.ts) | linhas 69–96 |
| `@SkipThrottle` no health check | [apps/api/test/throttle.e2e-spec.ts](../../apps/api/test/throttle.e2e-spec.ts) | linhas 150–154 |

---

_Ultima atualizacao: 2026-10-16 | Gerado a partir do codigo-fonte._
