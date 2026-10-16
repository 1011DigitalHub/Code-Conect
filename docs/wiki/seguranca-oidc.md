# Seguranca: OIDC / Login Social

> Publico-alvo: analistas juniores / trainees.

---

## Conceito Teorico

### OAuth 2.0 vs OpenID Connect: autorizacao vs autenticacao

Imagine que voce vai a um evento e apresenta seu passaporte. O seguranca olha a foto, confirma que e voce, e deixa entrar. Isso e **autenticacao**: provar *quem* voce e.

Agora imagine que voce autoriza um aplicativo de musica a acessar sua lista de contatos para sugerir amigos. O aplicativo recebe permissao para ler dados, mas nao "sabe" quem voce e de forma estruturada. Isso e **autorizacao** pura: conceder acesso a recursos.

**OAuth 2.0** foi criado para autorizacao. Ele define como um usuario concede a um aplicativo permissao para agir em seu nome em outro servico. O que *voce* recebe ao final e um `access_token` — uma chave para acessar APIs.

**OpenID Connect (OIDC)** e uma camada construida *sobre* o OAuth 2.0 que adiciona autenticacao. Junto com o `access_token`, o provedor tambem devolve um **`id_token`** — um JWT assinado que declara "este usuario, com este email, se autenticou com sucesso agora". A aplicacao pode confiar nessa declaracao porque ela esta assinada com a chave privada do provedor (Google, Microsoft...), e a chave publica correspondente e publicada em um endpoint JWKS publico.

**Resumo pratico:**
- OAuth 2.0 responde: "Este usuario me autorizou a fazer X em nome dele?"
- OIDC responde: "Quem e este usuario? Ele realmente se autenticou agora?"

### Fluxo Authorization Code com PKCE

O fluxo completo de login social segue estas etapas:

```
Usuario clica "Entrar com Google"
    │
    ▼
API gera state + codeVerifier + codeChallenge
Salva {provider, state, codeVerifier} em cookie assinado (oidc_flow)
Redireciona para: accounts.google.com/o/oauth2/v2/auth?
    response_type=code
    &client_id=...
    &redirect_uri=https://api.exemplo.com/auth/oidc/google/callback
    &scope=openid email profile
    &state=<state aleatorio>
    &code_challenge=<SHA-256(codeVerifier)>
    &code_challenge_method=S256
    │
    ▼
Usuario autentica no Google
Google redireciona para a callback com ?code=...&state=...
    │
    ▼
API valida state (compara com o do cookie)
API troca o code por id_token enviando o codeVerifier
Google valida SHA-256(codeVerifier) == code_challenge salvo no /authorize
Devolve o id_token
    │
    ▼
API valida assinatura, iss, aud, exp, email_verified do id_token
Resolve identidade (3 vias — ver adiante)
Inicia sessao ou redireciona para vincular conta
```

---

## Aplicacao no Code Connect

### PKCE: protegendo o authorization code de interceptacao

**O problema que o PKCE resolve:** em ambientes moveis ou com proxies transparentes, um atacante pode interceptar o redirecionamento de volta da callback e capturar o `code`. Com o `code` em maos e o `client_id` publico, ele poderia trocar o code por tokens na API do provedor — sem precisar da senha do usuario.

**A solucao PKCE (Proof Key for Code Exchange):**

O arquivo [apps/api/src/auth/oidc/oidc-pkce.ts](../../apps/api/src/auth/oidc/oidc-pkce.ts) implementa a geracao:

```typescript
// oidc-pkce.ts (linhas 7-11)
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
```

- **`codeVerifier`**: segredo aleatorio de 32 bytes (256 bits de entropia). Nunca sai do servidor na fase de autorizacao — fica guardado no cookie `oidc_flow`.
- **`codeChallenge`**: hash SHA-256 do verifier, codificado em base64url. Este sim e enviado ao provedor no `?code_challenge=...` durante o `/start`.
- **Metodo S256**: o provedor armazena o `codeChallenge`. Quando a callback chega com o `code`, o servidor envia o `codeVerifier` original. O provedor recomputa `SHA-256(codeVerifier)` e so troca o code por tokens se bater com o challenge registrado.

**Por que isso protege:** o atacante que captura o `code` em transito nao tem o `codeVerifier` — ele nunca foi transmitido nessa etapa. Sem ele, o provedor recusa a troca.

O `statesMatch` usa `timingSafeEqual` para evitar ataques de timing na comparacao do state:

```typescript
// oidc-pkce.ts (linhas 17-21)
export function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
```

### O flow cookie assinado com HMAC

**Por que usar um cookie em vez de, digamos, a sessao do servidor?**

O fluxo OIDC cruza um redirecionamento para um dominio externo (Google, Microsoft) e volta. Nao ha XHR; e uma navegacao real do browser. Um estado de servidor (Redis, banco) funcionaria, mas exigiria infra extra. Um cookie de curta duracao assinado e autocontido e suficiente aqui.

O arquivo [apps/api/src/auth/oidc/oidc-flow-cookie.ts](../../apps/api/src/auth/oidc/oidc-flow-cookie.ts) assina o payload com HMAC-SHA256:

```typescript
// oidc-flow-cookie.ts (linhas 25-29)
function sign(encodedPayload: string): string {
  return createHmac('sha256', getOidcLinkingTokenSecret())
    .update(`oidc-flow:${encodedPayload}`)
    .digest('base64url');
}
```

O prefixo de dominio `'oidc-flow:'` separa este HMAC do HMAC do linking token (que usa `'oidc-link:'`) — ambos usam o mesmo segredo `OIDC_LINKING_TOKEN_SECRET`, mas um nao pode ser confundido com o outro.

**TTL de 5 minutos** — definido em [apps/api/src/auth/cookie.constants.ts:88](../../apps/api/src/auth/cookie.constants.ts):

```typescript
export const OIDC_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;
```

O cookie tem `Max-Age` no atributo HTTP, mas o servidor tambem embute um campo `exp` no proprio payload e o verifica independentemente. Isso e importante: o `Max-Age` controla *se o browser envia o cookie de volta*, mas um browser mal-comportado ou um request forjado poderia ignorar isso. O servidor nao confia apenas no browser para nao reenviar um cookie expirado.

**Por que `SameSite=Lax` em vez de `Strict`?**

O cookie `oidc_flow` precisa sobreviver ao redirecionamento de volta do dominio do provedor (ex: `accounts.google.com` → `api.seusite.com`). Com `SameSite=Strict`, o browser **nao enviaria** o cookie em uma navegacao top-level vinda de outro site. Com `Lax`, o cookie e enviado em navegacoes top-level GET — exatamente o que a callback e. Veja em [apps/api/src/auth/cookie.constants.ts:122-128](../../apps/api/src/auth/cookie.constants.ts):

```typescript
// cookie.constants.ts (linhas 122-128)
sameSite: 'lax',  // forcado, ignora COOKIE_SAMESITE
path: '/',
...(useHostPrefix() ? {} : { domain: getCookieDomain() }),
httpOnly: true,
maxAge: OIDC_COOKIE_MAX_AGE_MS,
```

### O prefixo `__Host-` contra injecao de cookie em subdominio sibling

**O problema:** suponha que `COOKIE_DOMAIN=exemplo.com` e o cookie `oidc_flow` esta configurado com esse dominio. Qualquer subdominio de `exemplo.com` — incluindo `blog.exemplo.com` ou `api-legado.exemplo.com` — pode emitir uma resposta `Set-Cookie: oidc_flow=...; Domain=exemplo.com`. O browser aceitaria e enviaria esse cookie para `api.exemplo.com`. Um atacante controlando qualquer subdominio poderia injetar um `oidc_flow` **valido e assinado por nos mesmos** (basta iniciar o fluxo em `/start`, capturar o cookie retornado, e injeta-lo na vitima via subdominio).

**A solucao: prefixo `__Host-`** — descrita em [apps/api/src/auth/cookie.constants.ts:91-109](../../apps/api/src/auth/cookie.constants.ts):

O prefixo `__Host-` impoe tres restricoes no browser:
1. O cookie so e aceito se `Secure` estiver presente
2. O cookie so e aceito sem atributo `Domain` (fica preso ao host exato)
3. O atributo `Path` deve ser `/`

Com isso, mesmo que um subdominio tente injetar `__Host-oidc_flow`, o browser rejeita — a regra `__Host-` proibe o `Domain`, entao o cookie fica restrito ao proprio subdominio que o emitiu, nunca chegando ao `api.exemplo.com`.

O projeto ativa esse prefixo automaticamente quando `Secure=true` (producao):

```typescript
// cookie.constants.ts (linhas 107-113)
function useHostPrefix(): boolean {
  return isCookieSecure();
}

export function getOidcFlowCookieName(): string {
  return useHostPrefix() ? '__Host-oidc_flow' : 'oidc_flow';
}
```

O mesmo se aplica ao `linking_token`, onde o impacto seria ainda pior (o atacante poderia vincular sua propria identidade OIDC a conta da vitima).

### Verificacao do id_token: JWKS e protecao contra DoS por `kid` falso

Apos receber o `id_token` do provedor, o projeto precisa verificar sua assinatura. O provedor publica suas chaves publicas em um endpoint **JWKS** (JSON Web Key Set). A biblioteca `jose` busca a chave correspondente ao `kid` (key ID) do header do JWT.

**O ataque:** um atacante poderia forjar um `id_token` com um `kid` inexistente e enviar muitas requisicoes. Sem protecao, cada requisicao forcaria uma busca HTTP ao endpoint JWKS do Google — criando um vetor de DoS indireto contra o proprio Google, e potencialmente esgotando conexoes da API.

**A defesa — `cooldownDuration`** em [apps/api/src/auth/oidc/oidc.service.ts:27](../../apps/api/src/auth/oidc/oidc.service.ts):

```typescript
// oidc.service.ts (linhas 17-31)
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 30_000 });
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}
```

- **Uma instancia por URI por processo**: a instancia e criada uma vez e reutilizada. Um `new createRemoteJWKSet()` por request perderia o cache interno da `jose`.
- **`cooldownDuration: 30_000`**: apos uma busca ao JWKS, `jose` recusa novas buscas por 30 segundos, independente de quantos `kid`s desconhecidos cheguem. Um atacante com 1000 tokens por segundo ainda dispara no maximo 1 busca real por 30s.

Alem disso, o `jwtVerify` verifica `audience` (deve ser o `client_id` do projeto) e aceita apenas algoritmos `RS256` e `ES256`:

```typescript
// oidc.service.ts (linhas 121-127)
const result = await jwtVerify(idToken, getJwks(config.jwksUri), {
  audience: config.clientId,
  algorithms: ['RS256', 'ES256'],
  clockTolerance: 120, // 2 minutos de tolerancia de relogio
});
```

O `clockTolerance: 120` cobre discrepancias de relogio entre servidores — sem isso, um JWT legitimo criado 90 segundos atras poderia ser rejeitado por `exp` ou `nbf` se os relogios dos servidores estiverem dessincronizados.

### Verificacao do issuer: Google fixo, Microsoft dinamico

O Google tem um issuer fixo (com ou sem esquema):

```typescript
// oidc.constants.ts (linhas 87-88)
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
```

A documentacao do Google explicita que o `iss` pode vir com ou sem o `https://` — aceitar ambos e correto, nao uma brecha.

O Microsoft usa um endpoint "common" multi-tenant. O `iss` no token embute o tenant ID real do usuario:
```
https://login.microsoftonline.com/12345678-1234-1234-1234-123456789abc/v2.0
```

Nao ha como fixar um unico string esperado. O projeto usa um regex:

```typescript
// oidc.constants.ts (linhas 81-82)
const MICROSOFT_ISSUER_PATTERN =
  /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i;
```

### Resolucao de identidade em 3 vias

Apos validar o `id_token`, o projeto decide o que fazer com a identidade em [apps/api/src/auth/oidc/oidc.service.ts:191-236](../../apps/api/src/auth/oidc/oidc.service.ts):

**Via 1 — Identidade ja existe (`OidcIdentity` encontrada):**
```typescript
const byIdentity = await this.usersService.findByProviderIdentity(provider, claims.sub);
if (byIdentity) return { kind: 'signedIn', user: byIdentity };
```
O par `(provider, sub)` — ex: `('google', '109876543210')` — e estavel e unico por usuario no Google. Login direto, sem verificar mais nada.

**Via 2 — Email novo, nao existe nenhum usuario:**
```typescript
if (!byEmail) {
  const created = await this.usersService.createFromOidc({ ... });
  return { kind: 'signedIn', user: created };
}
```
Cria a conta automaticamente. **Mas apenas se `emailVerified === true`** (veja a guarda antes desse bloco — secao nOAuth abaixo).

**Via 3 — Email ja existe com senha local (`passwordHash !== null`):**
```typescript
const linkingToken = mintLinkingToken({ email: byEmail.email, provider, providerSub: claims.sub });
return { kind: 'linkingRequired', linkingToken };
```
Nunca funde contas automaticamente. O usuario e redirecionado para `/vincular-conta` e precisa provar que controla a conta local digitando a senha.

**Caso especial — Email ja existe, mas e conta OIDC-only (`passwordHash === null`):**
```typescript
if (byEmail.passwordHash === null) {
  await this.usersService.linkProviderIdentity(byEmail.id, provider, claims.sub);
  return { kind: 'signedIn', user: byEmail };
}
```
Vincula a nova identidade automaticamente (sem senha para provar — a conta ja era OIDC). Ainda requer `emailVerified`.

### A protecao contra nOAuth: nunca vincular email nao verificado

**nOAuth** e uma classe de ataque descoberta em 2023: alguns provedores permitem que um usuario configure um email arbitrario em sua conta *sem verificar* se realmente controla aquele email. Com isso:

1. **Ataque de pre-registro**: o atacante cria uma conta no provedor com o email `vitima@empresa.com` (sem verificar). Se o projeto auto-registrar contas por email nao verificado, o atacante planta uma conta com esse email. Quando a vitima real fizer login, ela cairia na conta plantada.

2. **Ataque de auto-vinculacao**: se o projeto auto-vincula uma nova identidade OIDC a uma conta existente apenas por match de email (sem verificar), o atacante pode vincular sua identidade a qualquer conta OIDC-only existente.

A guarda esta em [apps/api/src/auth/oidc/oidc.service.ts:209-213](../../apps/api/src/auth/oidc/oidc.service.ts):

```typescript
// oidc.service.ts (linhas 209-213)
if (!claims.emailVerified && (!byEmail || byEmail.passwordHash === null)) {
  throw new UnauthorizedException(
    'Não foi possível concluir o login. O provedor não confirmou que este email é verificado.',
  );
}
```

A logica: se o email nao esta verificado, recusa tanto a criacao de nova conta quanto a auto-vinculacao com conta OIDC-only. **A unica via que nao exige `emailVerified` e a Via 3 (senha local)** — porque nessa via o usuario ainda precisa digitar a senha correta, o que prova controle da conta independentemente da claim do provedor.

O `emailVerified` e extraido do `id_token`:

```typescript
// oidc.service.ts (linhas 164-168)
const emailVerified =
  payload.email_verified === true ||
  payload.email_verified === 'true' ||
  payload.xms_edov === true ||    // claim especifica do Microsoft Entra ID
  payload.xms_edov === 'true';
```

O `xms_edov` e uma claim opcional do Microsoft Entra ID ("externally-set domain ownership verified") que substitui o `email_verified` quando este nao e enviado pelo Entra ID.

### O linking token: prova criptografica entre redirect e POST

Quando a resolucao de identidade resulta em `linkingRequired`, o projeto precisa transportar a informacao `{email, provider, providerSub}` atraves de um redirect para `/vincular-conta` e depois recebe-la num POST `application/json`. Isso nao pode ser feito via query string (exposta no historico do browser) nem via session (exigiria infra de sessao).

A solucao: um token HMAC assinado guardado em cookie HttpOnly. Implementado em [apps/api/src/auth/oidc/oidc-linking-token.ts](../../apps/api/src/auth/oidc/oidc-linking-token.ts):

```typescript
// oidc-linking-token.ts (linhas 27-31)
export function mintLinkingToken(claims: LinkingTokenClaims): string {
  const payload: LinkingTokenPayload = { ...claims, exp: Date.now() + LINKING_TOKEN_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}
```

**Garantia de uso unico** — sem Redis ou tabela de tokens consumidos. A segunda tentativa de usar o mesmo token falha porque `linkProviderIdentity` tenta inserir na tabela `OidcIdentity` com o mesmo `(provider, providerSub)`, e o constraint `@@unique([provider, providerSub])` do Prisma (linha 48 do schema) garante o conflict com 409.

O token tem TTL de 5 minutos — tempo suficiente para ler e digitar a senha na tela `/vincular-conta`. Se o usuario demorar mais, precisa reiniciar o fluxo OIDC (o que e correto: ele teria de se re-autenticar no provedor de qualquer forma).

**Por que a mensagem de erro e identica** para token invalido e senha errada:

```typescript
// oidc.service.ts (linhas 247-249)
if (!claims) {
  throw new UnauthorizedException('Não foi possível concluir a vinculação');
}
// ...
if (!user || !passwordIsValid) {
  throw new UnauthorizedException('Não foi possível concluir a vinculação');
}
```

Se as mensagens fossem diferentes ("token expirado" vs "senha errada"), um atacante poderia descobrir se um linking token ainda e valido sem precisar saber a senha — informacao util para temporizacao de ataques.

### O FakeIdP: testando o fluxo completo sem Google ou Microsoft

Os testes e2e nao podem chamar o Google de verdade (sem conta de servico, sem chaves reais, flaky por rede). O arquivo [apps/api/test/oidc-fake-idp.ts](../../apps/api/test/oidc-fake-idp.ts) implementa um servidor HTTP em processo que simula o comportamento do provedor:

```typescript
// oidc-fake-idp.ts (linhas 48-50)
export async function startFakeIdp(): Promise<FakeIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  // ...
  const server: Server = createServer(/* handler */);
  server.listen(0, '127.0.0.1', resolve); // porta OS-assigned
```

O servidor expoe dois endpoints:
- `GET /jwks` — devolve a chave publica gerada, no formato JWKS
- `POST /token` — decodifica o `code` (que e um JSON base64url com instrucoes do teste) e devolve um `id_token` assinado

O truque do "code como instrucoes":

```typescript
// oidc-fake-idp.ts (linhas 142)
encodeCode: (options = {}) => Buffer.from(JSON.stringify(options)).toString('base64url'),
```

Nos testes, o `code` que a callback recebe nao vem de um browser real — vem do proprio teste. Entao o teste "instrui" o FakeIdP colocando as opcoes desejadas dentro do `code`:

```typescript
// oidc.e2e-spec.ts (linhas 81-82)
const code = fakeIdp.encodeCode({ expectedCodeChallenge: challenge, claims });
```

O FakeIdP no handler `/token` le essas instrucoes e pode:
- Retornar um token com claims personalizados (`email_verified: false`, `aud` errado, etc.)
- Simular falha no endpoint (`tokenEndpointFails: true`)
- Assinar com chave errada (`signWithWrongKey: true`)
- Verificar o PKCE challenge que o API enviou (`expectedCodeChallenge`)

Nos testes, as variaveis de ambiente apontam todos os endpoints do Google para o FakeIdP local:

```typescript
// oidc.e2e-spec.ts (linhas 43-47)
vi.stubEnv('GOOGLE_TOKEN_ENDPOINT', `${fakeIdp.url}/token`);
vi.stubEnv('GOOGLE_JWKS_URI', `${fakeIdp.url}/jwks`);
vi.stubEnv('GOOGLE_ISSUER', FAKE_IDP_ISSUER);
```

Os overrides de endpoint so funcionam fora de `NODE_ENV=production` — a funcao `testOverride` em `oidc.constants.ts` retorna `undefined` em producao, impedindo que uma variavel residual em staging troque silenciosamente o trust root do id_token:

```typescript
// oidc.constants.ts (linhas 72-75)
function testOverride(envVar: string): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return process.env[envVar] || undefined;
}
```

---

## Erros Comuns e Armadilhas

### 1. Criar uma nova instancia de `createRemoteJWKSet` por request

**Errado:**
```typescript
// Nao faca isso
const result = await jwtVerify(idToken, createRemoteJWKSet(new URL(jwksUri)));
```

**Por que quebra:** cada instancia tem seu proprio cache e cooldown. Sem o cache, toda verificacao dispara uma busca HTTP. Sem o cooldown, mil tokens com `kid` falso disparam mil buscas. O projeto mantem um `Map<string, JwksInstance>` de longa vida exatamente para evitar isso.

### 2. Esquecer `SameSite=Lax` no cookie de estado do fluxo OIDC

Se voce configurar o cookie de fluxo com `SameSite=Strict` (ou herdar o padrao `Strict` do projeto), o browser **nao enviara** o cookie no redirect de volta do Google. Cada callback chegara sem o cookie, toda tentativa de login falhara silenciosamente redirecionando para `/login?oidcError=1`. E dificil de debugar porque funciona em localhost (onde `Strict` vs `Lax` nao faz diferenca para o mesmo host) mas quebra em producao.

### 3. Comparar `state` com `===` em vez de `timingSafeEqual`

A comparacao simples `flow.state === state` e vulneravel a timing attack: um atacante pode medir o tempo de resposta para descobrir quantos caracteres do `state` ele ja adivinhou corretamente. O projeto usa `timingSafeEqual` (que leva tempo constante independente de onde os buffers divergem), com verificacao de comprimento primeiro (porque `timingSafeEqual` lanca excecao em buffers de tamanhos diferentes).

### 4. Auto-vincular contas por email sem verificar `emailVerified`

Discutido na secao nOAuth acima. O erro classico e: "o email veio do Google, deve ser verdadeiro". Nao — o `email` na claim pode ser qualquer valor que o usuario configurou na conta do provedor. So o `email_verified: true` (ou `xms_edov: true` no Microsoft) confirma que o provedor verificou aquela caixa postal.

### 5. Usar a mesma mensagem de erro generica para o /callback mas mensagens distintas para o /link

O `/callback` redireciona para `/login?oidcError=1` em *qualquer* erro (state errado, token invalido, email nao verificado, provedor fora do ar). Isso e correto: e uma navegacao do browser, e expor detalhes ajudaria atacantes.

O `/link` tambem usa mensagem identica para token invalido e senha errada — deliberadamente. Se voce diferenciar as mensagens, estara vazando se o token ainda esta valido sem exigir a senha.

### 6. Nao limpar o cookie `oidc_flow` imediatamente no callback

```typescript
// oidc.controller.ts (linhas 132-134)
const flow = readOidcFlowCookie(req);
// Single-use regardless of outcome
clearOidcFlowCookie(res);
```

O cookie e limpo *antes* de qualquer processamento, seja sucesso ou falha. Isso garante que uma URL de callback nao seja reutilizada (mesmo que o codigo still estivesse valido no provedor, o cookie do estado ja foi invalidado).

### 7. Confiar no `Max-Age` do cookie para garantir expiracao no servidor

`Max-Age` instrui o *browser* a descartar o cookie. Um request forjado (Postman, curl, codigo malicioso) pode enviar o cookie mesmo depois do `Max-Age`. O projeto embute um campo `exp` no payload e o verifica independentemente no servidor — linha 71 de `oidc-flow-cookie.ts`:

```typescript
if (Date.now() > exp) return undefined;
```

### 8. Redirecionar o redirect_uri a partir de parametros da request

O `redirect_uri` enviado ao provedor nunca deve ser construido a partir de dados da request atual (ex: `req.headers.host`). Deve ser fixo por ambiente, lido de variavel de ambiente confiavel:

```typescript
// oidc.service.ts (linhas 33-35)
function buildRedirectUri(provider: OidcProvider): string {
  return `${getApiOrigin()}/auth/oidc/${provider}/callback`;
}
```

Se o redirect_uri viesse da request, um atacante poderia manipula-lo para redirecionar o code para seu proprio servidor.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Geracao de `codeVerifier` e `codeChallenge` (S256) | `apps/api/src/auth/oidc/oidc-pkce.ts` | linhas 7-11 |
| Comparacao `state` com `timingSafeEqual` | `apps/api/src/auth/oidc/oidc-pkce.ts` | linhas 17-21 |
| Assinatura HMAC do flow cookie (`oidc-flow:` prefix) | `apps/api/src/auth/oidc/oidc-flow-cookie.ts` | linhas 25-29 |
| Leitura e validacao do flow cookie (incluindo `exp`) | `apps/api/src/auth/oidc/oidc-flow-cookie.ts` | linhas 47-78 |
| TTL de 5 minutos dos cookies OIDC | `apps/api/src/auth/cookie.constants.ts` | linha 88 |
| Logica do prefixo `__Host-` | `apps/api/src/auth/cookie.constants.ts` | linhas 91-113 |
| `SameSite=Lax` forcado para `oidc_flow` | `apps/api/src/auth/cookie.constants.ts` | linhas 122-128 |
| Cache de instancias JWKS + `cooldownDuration` | `apps/api/src/auth/oidc/oidc.service.ts` | linhas 17-31 |
| `jwtVerify` com `audience`, algoritmos e tolerancia de relogio | `apps/api/src/auth/oidc/oidc.service.ts` | linhas 121-127 |
| Validacao de issuer: Google fixo, Microsoft regex | `apps/api/src/auth/oidc/oidc.constants.ts` | linhas 81-88 |
| Resolucao de identidade em 3 vias | `apps/api/src/auth/oidc/oidc.service.ts` | linhas 191-236 |
| Guarda contra nOAuth (gate em `emailVerified`) | `apps/api/src/auth/oidc/oidc.service.ts` | linhas 209-213 |
| Extracao de `emailVerified` e `xms_edov` | `apps/api/src/auth/oidc/oidc.service.ts` | linhas 164-168 |
| Mintagem do linking token (HMAC + TTL) | `apps/api/src/auth/oidc/oidc-linking-token.ts` | linhas 27-31 |
| Verificacao do linking token (erros indistinguiveis) | `apps/api/src/auth/oidc/oidc-linking-token.ts` | linhas 44-69 |
| Constraint `@@unique([provider, providerSub])` | `apps/api/prisma/schema.prisma` | linha 48 |
| `User.passwordHash` opcional (conta OIDC-only) | `apps/api/prisma/schema.prisma` | linha 19 |
| FakeIdP: geracao de chaves e servidor HTTP in-process | `apps/api/test/oidc-fake-idp.ts` | linhas 48-145 |
| FakeIdP: code como instrucoes base64url | `apps/api/test/oidc-fake-idp.ts` | linha 142 |
| Override de endpoints bloqueado em producao | `apps/api/src/auth/oidc/oidc.constants.ts` | linhas 72-75 |
| Limpeza imediata do `oidc_flow` cookie no callback | `apps/api/src/auth/oidc/oidc.controller.ts` | linhas 132-134 |
| Redirecionamento para `/login?oidcError=1` em erros | `apps/api/src/auth/oidc/oidc.controller.ts` | linhas 55-57 |
| Rate limiting compartilhado entre `/login` e `/link` | `apps/api/src/auth/oidc/oidc.controller.ts` | linhas 204 |
| `OidcThrottleExceptionFilter` — 302 em vez de JSON 429 | `apps/api/src/auth/oidc/oidc-throttle.filter.ts` | todos |
| `redirectToLoginWithRaceError` — `oidcRace=1` em state mismatch | `apps/api/src/auth/oidc/oidc.controller.ts` | callback handler |
| `OIDC_LINKING_TOKEN_DEV_SECRET` movido para `env.ts` | `apps/api/src/env.ts` | `readOidcLinkingTokenSecret` |

---

### `OidcThrottleExceptionFilter` — 302 em vez de JSON 429 em rotas de navegacao OIDC

Os endpoints `GET /auth/oidc/:provider/start` e `GET /auth/oidc/:provider/callback` sao **navegacoes de browser** iniciadas por um redirect — o usuario nunca ve a resposta HTTP diretamente. Se o rate limit for atingido e esses endpoints retornarem um JSON `429`, o browser exibe o JSON cru, o que e confuso e quebra o fluxo de login.

O `OidcThrottleExceptionFilter` captura `ThrottlerException` nesses dois handlers e redireciona para `/login?error=too_many_requests`:

```ts
// apps/api/src/auth/oidc/oidc-throttle.filter.ts
@Catch(ThrottlerException)
export class OidcThrottleExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.redirect(`${getWebAppOrigin()}/login?error=too_many_requests`);
  }
}
```

O endpoint `/auth/oidc/link` e excluido intencionalmente: ele e chamado via XHR da pagina `/vincular-conta` e o JSON 429 com `Retry-After` e a resposta correta para uma chamada programatica.

### Deteccao de corrida de estado (race condition entre abas)

O callback OIDC valida o `state` da URL contra o `state` armazenado no cookie `oidc_flow`. Se o usuario abrir a tela de login em duas abas simultaneamente, a segunda aba sobrescreve o cookie com seu proprio `state`. Quando o callback da primeira aba chegar, o `state` nao vai bater — mas isso nao e um ataque, e uma corrida de abas.

Para distinguir esse caso de outros erros genericos:

```ts
// apps/api/src/auth/oidc/oidc.controller.ts
if (!statesMatch(flow.state, state)) {
  // Corrida entre abas: redireciona com flag distinta
  res.redirect(`${getWebAppOrigin()}/login?oidcError=1&oidcRace=1`);
  return;
}
// Todos os outros erros (provedor invalido, code ausente, etc.):
res.redirect(`${getWebAppOrigin()}/login?oidcError=1`);
```

O frontend pode usar `oidcRace=1` para exibir uma mensagem mais precisa ("outra aba pode ter interrompido seu login") em vez da mensagem generica de erro OIDC.

_Ultima atualizacao: 2026-10-16 | Gerado a partir do codigo-fonte._
