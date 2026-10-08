# Plano: Login Social via OIDC (apps/api, apps/web)

## Contexto

Os botões Github e Gmail existem na tela de Login e Cadastro desde o mockup original, mas nunca fizeram nada além de `console.info` (ver `plan/PaginaLogin.md`). O plano de Secure by Design (`plan/SecureByDesign.md`) desabilitou os botões (`disabled`, sem handler) em vez de deixá-los simular uma funcionalidade que não existe, e apontou para este arquivo como o desenho de como implementá-los de verdade.

Este é **só o desenho** — nenhuma linha de código daqui foi implementada. Ele existe para ser avaliado e, quando aprovado, executado como os outros planos do projeto.

## Nota de implementação (2026-10-08)

Implementado (`apps/api/src/auth/oidc/`, `apps/web/src/pages/VincularContaPage/`), com os seguintes ajustes de escopo em relação ao desenho acima:

- **`WEB_APP_ORIGIN` (novo env var).** O desenho dizia "redireciona para `/perfil` no front" como se fosse um path relativo — mas a API e o front são origens diferentes, então um redirect relativo do callback navegaria dentro da própria origem da API, não do SPA. O callback (e a vinculação) agora redirecionam para `${WEB_APP_ORIGIN}/perfil` (ou `/vincular-conta`), um env var fixo por ambiente, mesma lógica de `API_ORIGIN`.
- **`API_ORIGIN`/`WEB_APP_ORIGIN`/credenciais OIDC não são obrigatórios em produção.** `OIDC_LINKING_TOKEN_SECRET` continua obrigatório (é um segredo barato de gerar e um default incorreto é risco real de forjar vinculação). Os demais não: OIDC é um método de login opcional sobre o de senha, e uma implantação que não queira configurar Google/Microsoft ainda precisa subir normalmente — sem esses vars, os botões sociais simplesmente falham no provedor.
- **Vinculação automática quando a conta existente não tem senha local.** O desenho só cobria "conta local com senha" vs. "conta nova". Faltava o caso de uma conta já criada via OIDC (sem `passwordHash`) logar com um *segundo* provedor usando o mesmo email: como não há senha local para proteger, e o email já foi verificado por outro provedor, a nova identidade é vinculada automaticamente, sem o fluxo de senha. Só uma conta com senha local aciona `/vincular-conta`.
- **`oidc_flow` carrega seu próprio `exp`**, checado no servidor — não só o `Max-Age` do cookie, que só controla se o *navegador* ainda manda o cookie, não se o servidor aceitaria um state "velho" por algum outro motivo.
- Gap do front (`socialProviders.ts` com `github`/`google`→`Gmail`) corrigido para `google`/`microsoft`.
- Testes e2e usam um IdP falso local (`apps/api/test/oidc-fake-idp.ts`) para cobrir o checklist da seção 5 sem depender de credenciais reais do Google/Microsoft.
- `linking_token` é limpo **mesmo numa senha errada** (não só na expiração) — uma tentativa falha exige refazer o fluxo OIDC inteiro, não só reenviar a senha. É a leitura literal do "sucesso ou falha" do item 4 abaixo; mais rígido do que o login por senha normal (que permite várias tentativas), mas é o que este desenho pede.

### Arquivos

**`apps/api`** — novos: `src/auth/oidc/` (`oidc.module.ts`, `oidc.controller(.spec).ts`, `oidc.service(.spec).ts`, `oidc.constants(.spec).ts`, `oidc.types.ts`, `oidc-pkce(.spec).ts`, `oidc-flow-cookie(.spec).ts`, `oidc-linking-token(.spec).ts`, `dto/link-account.dto.ts`), `prisma/migrations/20261008165123_add_oidc_identities/`, `test/oidc-fake-idp.ts`, `test/oidc.e2e-spec.ts`. Alterados: `prisma/schema.prisma`, `src/env(.spec).ts`, `src/auth/auth.module.ts`, `src/auth/auth.service(.spec).ts`, `src/auth/cookie.constants.ts`, `src/users/password(.spec).ts` (novo `verifyUserPassword` compartilhado), `src/users/users.service.ts` (`findByProviderIdentity`/`createFromOidc`/`linkProviderIdentity`), `test/db.ts` (trunca `oidc_identities`), `.env.example`, `package.json`/`pnpm-lock.yaml` (dependência `jose`).

**`apps/web`** — novos: `src/pages/VincularContaPage/` (`.tsx`, `.test.tsx`, `index.ts`), `public/icons/microsoft.svg`. Alterados: `src/pages/socialProviders.ts`, `src/pages/LoginPage/LoginPage(.test).tsx`, `src/pages/SignUpPage/SignUpPage(.test).tsx`, `src/api/auth.ts` (`startOidcLogin`/`linkOidcAccount`), `src/api/client.ts` (`API_BASE_URL` exportado), `src/App.tsx` (rota `/vincular-conta`), `e2e/routes.ts`, `public/llms.txt`. Removido: `public/icons/github.svg` (não usado mais).

**Infra/raiz** — `docker-compose.yml` (vars OIDC opcionais no serviço `api`), `.env.example` (raiz).

A decisão de arquitetura central: a API passa a aceitar dois métodos de login — o atual (email/senha, `scrypt`) e OIDC — sem remover o primeiro. A sessão resultante é a mesma de hoje (cookie `access_token` httpOnly, `csrf_token`, `AuthGuard`, `CsrfGuard`): o que muda é só como o usuário prova que é quem diz ser antes de a API emitir essa sessão.

## Provedores

Google Workspace (via `accounts.google.com`, discovery em `https://accounts.google.com/.well-known/openid-configuration`) e Microsoft Entra ID (via `https://login.microsoftonline.com/common/v2.0`, multi-tenant). Os dois são OpenID Connect padrão — nenhum SDK proprietário, só `openid-client` (ou `@nestjs/passport` + `passport-openidconnect`) configurado duas vezes.

~~**Gap a resolver na implementação:** `apps/web/src/pages/socialProviders.ts` hoje declara `{ id: 'github', name: 'Github' }` e `{ id: 'google', name: 'Gmail' }`...~~ Corrigido: `{ id: 'google', name: 'Google' }` e `{ id: 'microsoft', name: 'Microsoft' }`, com `apps/web/public/icons/microsoft.svg` novo.

## 1. Fluxo (Authorization Code + PKCE)

A API nunca vê a senha do usuário no provedor — esse é o ponto do OIDC. O fluxo:

1. `GET /auth/oidc/:provider/start` (`:provider` = `google` | `microsoft`, validado estritamente — qualquer outro valor é `400`, não cai num provedor default nem tenta montar uma URL a partir dele —, `@Public()`, `@NoCsrf()` — é GET). Gera `state` (CSRF do próprio fluxo OAuth, aleatório, `httpOnly`) e um par PKCE (`code_verifier` aleatório + `code_challenge = base64url(sha256(code_verifier))`), guarda os dois num cookie `httpOnly`, `SameSite=Lax` de vida curta (5 min — precisa sobreviver ao redirect cross-site de volta do provedor, por isso não pode ser `Strict`), e redireciona (`302`) para o `authorization_endpoint` do provedor com `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope=openid email profile`, `redirect_uri` apontando para o callback abaixo.
2. Usuário autentica no provedor (fora da nossa API inteiramente).
3. Provedor redireciona para `GET /auth/oidc/:provider/callback?code=...&state=...`. A API:
   - Valida que o `state` da query bate com o do cookie usando `timingSafeEqual` (rejeita CSRF do próprio fluxo OAuth e ataques de tempo na comparação) e que não expirou.
   - Troca o `code` pelo token no `token_endpoint`, mandando o `code_verifier` do cookie (prova de posse do PKCE — fecha o "authorization code interception attack").
   - Valida o `id_token` recebido: assinatura via JWKS do provedor (`jwks_uri` do discovery document, cacheado — o cache por si só já limita quantas vezes a API bate no `jwks_uri`, mas a estratégia de cache escolhida precisa também limitar refetch forçado por `kid` desconhecido/inválido, senão um atacante pode mandar `id_token`s com `kid` lixo só para forçar a API a martelar o endpoint do provedor —, nunca `alg: none` nem HS256 — só os algoritmos RS256/ES256 que o provedor realmente usa), `iss`, `aud` (= nosso `client_id`), `exp`, `iat`/`nbf` com clock skew tolerável de 1–2 min (relógio do servidor nunca é perfeito), `nonce` se usado.
   - Extrai `email` (normalizado, minúsculo) e `sub` (id estável do provedor) das claims.
   - `findOrCreateByProviderIdentity(provider, sub, email)`: se já existe um `User` com esse `(provider, providerSub)`, usa esse usuário. Senão, se existe um `User` com esse email criado via senha local, **não funde automaticamente** — ver "Vinculação de conta" abaixo. Senão, cria um novo `User`.
   - A partir daqui é o fluxo de login normal: assina o JWT da sessão, seta `access_token` + `csrf_token`, redireciona (`302`) para `/perfil` no front.
4. Limpa os cookies de `state`/`code_verifier` no callback, sucesso ou falha.

## 2. Redirect URI: a superfície de ataque real

Um `redirect_uri` não validado é o jeito mais comum de quebrar OIDC na prática (abre um "open redirect" que vaza o `code`). Regras:

- `redirect_uri` enviado ao provedor é **sempre** o mesmo valor fixo, hardcoded por ambiente (`${API_ORIGIN}/auth/oidc/:provider/callback`), nunca construído a partir de um parâmetro da requisição.
- Esse valor precisa estar na allowlist de redirect URIs cadastrada no Google Cloud Console / Entra ID App Registration — o provedor rejeita qualquer valor fora dela, mas isso é defesa em profundidade, não a única barreira.
- Nenhum parâmetro tipo `?returnTo=` ou `?next=` neste fluxo: ao contrário de um app que aceita um destino pós-login arbitrário, aqui o destino pós-login é sempre `/perfil`, fixo.

## 3. Modelo de dados

```prisma
model User {
  id             Int       @id @default(autoincrement())
  name           String    @db.VarChar(100)
  email          String    @unique @db.VarChar(254)
  passwordHash   String?   @map("password_hash") // opcional: usuário só-OIDC não tem senha local
  createdAt      DateTime  @default(now()) @map("created_at")
  identities     OidcIdentity[]
}

model OidcIdentity {
  id         Int      @id @default(autoincrement())
  provider   String   @db.VarChar(20) // "google" | "microsoft"
  providerSub String  @map("provider_sub") @db.VarChar(255) // claim `sub`, estável
  userId     Int      @map("user_id")
  user       User     @relation(fields: [userId], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")

  @@unique([provider, providerSub])
  @@map("oidc_identities")
}
```

`passwordHash` vira opcional (`String?`) — um usuário que só já logou via OIDC não tem senha local. `AuthService.signIn` (login por senha) já trata `!user` como 401; passa a tratar `!user.passwordHash` da mesma forma (mesma mensagem genérica, para não revelar "essa conta só existe via Google").

## 4. Vinculação de conta (o caso que exige uma decisão do usuário)

Se alguém loga com Google usando `maria@exemplo.com`, e já existe uma conta local com esse mesmo email (senha), **a API não funde as duas automaticamente** — fazer isso sem prova de posse da conta local seria deixar qualquer um "assumir" uma conta existente só por controlar aquele email no Google. Em vez disso:

- O callback detecta o email já cadastrado sem uma `OidcIdentity` correspondente.
- Gera um `linking_token` de curtíssima duração (3–5 min, uso único — invalidado após a primeira tentativa de uso, sucesso ou falha), assinado (HMAC com segredo próprio, nunca o mesmo segredo do JWT de sessão) e contendo só `email`, `provider`, `providerSub` e `exp`.
- Guarda esse `linking_token` num cookie `httpOnly`, `SameSite=Lax`, de vida curta — **nunca em query string**: query param vaza em histórico do navegador, no header `Referer` de requisições subsequentes e em logs de acesso de proxy/CDN, e esse token prova posse de uma identidade OIDC, então vazamento dele é tão sensível quanto vazar o próprio `code`. Redireciona (`302`) para `/vincular-conta` no front sem nenhum parâmetro sensível na URL.
- `/vincular-conta` (front) pede a senha atual da conta local e faz `POST /auth/oidc/link` (API) com a senha no corpo; a API lê o `linking_token` do cookie (não do body, não da query), valida assinatura e expiração, valida a senha (via `verifyPassword`, igual ao login normal) e só então cria o `OidcIdentity` vinculando as duas contas. Limpa o cookie do `linking_token` ao final, sucesso ou falha.

Isso é a parte do fluxo com mais superfície de erro de segurança (account takeover via vinculação indevida) — vale uma revisão própria quando for implementada, não só seguir este desenho ao pé da letra.

## 5. Segurança — checklist

- [x] PKCE obrigatório (`code_challenge_method=S256`), nunca o fluxo implícito.
- [x] `state` aleatório (`crypto.randomBytes`), de uso único, expira em minutos, comparado com `timingSafeEqual`.
- [x] `:provider` validado estritamente contra `['google', 'microsoft']` — qualquer outro valor é `400` antes de tocar em qualquer config de OIDC.
- [x] `redirect_uri` fixo por ambiente, nunca parametrizável pela requisição.
- [x] `id_token` validado via JWKS (biblioteca, não parsing manual) — assinatura, `iss`, `aud`, `exp`, `iat`/`nbf` com clock skew de 1–2 min.
- [x] Cache de JWKS limita refetch forçado por `kid` desconhecido (não deixa um `id_token` malicioso forçar a API a bater repetidamente no `jwks_uri` do provedor).
- [x] Nenhuma claim do provedor entra no JWT da nossa sessão além de `sub`/`email` (mesma regra que já vale hoje — ver `auth/auth.types.ts`).
- [x] Login por senha em conta `passwordHash = null` (só-OIDC) retorna o mesmo 401 genérico do login por senha incorreta — não revela que a conta existe só via OIDC.
- [x] Vinculação de conta exige prova de posse (senha atual), nunca é automática por email igual **quando a conta tem senha local** (ver nota de implementação); `linking_token` é assinado, de uso único, expira em minutos, e viaja só em cookie `httpOnly` — nunca em query string.
- [x] Segredos do cliente OIDC (`client_secret` de cada provedor, segredo de assinatura do `linking_token`) são env vars (`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`), validados em `src/env.ts` como os outros segredos — nunca hardcoded, nunca logados.
- [x] Rate limiting no `/auth/oidc/:provider/start`, `/callback` e `/auth/oidc/link`, mesma lógica de `LOGIN_THROTTLE`.
- [x] Testes e2e cobrindo: `state` inválido/ausente/expirado → rejeita; `code_verifier` que não bate com o `code_challenge` → rejeita; `id_token` com assinatura inválida → rejeita; `id_token` de um `aud` diferente → rejeita; login por senha numa conta só-OIDC → 401 genérico; criação de usuário novo via OIDC de ponta a ponta; email já existente bloqueia fusão automática e só vincula após senha correta em `/auth/oidc/link` (`apps/api/test/oidc.e2e-spec.ts`, 20 casos, com um IdP falso local).

## 6. Front (`apps/web`)

- `socialProviders.ts` muda de `['github', 'google']` para `['google', 'microsoft']` (ver "Provedores") — ícone Microsoft novo em `apps/web/public/icons/`.
- `SocialButton`/`SocialLogin` perdem o `disabled` e voltam a receber `onSelect`.
- `onSelect(providerId)` passa a ser `window.location.href = `${apiBaseUrl}/auth/oidc/${providerId}/start``— **navegação de página real, não uma chamada Axios**: o fluxo inteiro é feito de redirects do navegador (para o provedor, de volta pra API, de volta pro front), não de JSON sobre XHR/fetch.
- Nenhum código novo lida com token OIDC: o resultado do fluxo, visto do front, é exatamente o que o login por senha já produz hoje — o cookie `access_token` chega setado quando o navegador é redirecionado de volta para `/perfil`.
- Tela `/vincular-conta`: formulário simples (campo de senha + submit) que chama `POST /auth/oidc/link` via Axios (essa parte já é XHR normal, não navegação — o `linking_token` viaja no cookie, não precisa ser lido/manipulado pelo front). Sucesso redireciona para `/perfil`; falha mostra erro genérico (senha incorreta ou token expirado), sem distinguir os dois motivos.

## Verificação

- [x] `pnpm test:api` — 242 testes (inclui 66 novos do módulo `auth/oidc/`), `pnpm typecheck`/`pnpm lint` na API sem erros.
- [x] `pnpm test:api:e2e` — 121 testes (inclui os 20 de `test/oidc.e2e-spec.ts` cobrindo o checklist da seção 5 contra o IdP falso local).
- [x] `pnpm test:web` — 322 testes (inclui `VincularContaPage.test.tsx` e os ajustes em `LoginPage`/`SignUpPage`), `pnpm web typecheck`/`pnpm web lint` sem erros.
- [ ] `pnpm test:web:a11y` (Playwright) — **não executado nesta rodada**: a própria `frontend-ux-seo.md` documenta que o runner do Playwright trava nesta máquina Windows em certas condições; `/vincular-conta` foi adicionada a `e2e/routes.ts` e `llms.txt`, mas a verificação real (a11y AA completo, SEO, Lighthouse) ainda precisa rodar — via CI ou manualmente com o Chrome DevTools, como o guia recomenda.
- [ ] Teste manual com uma conta Google e uma Microsoft reais, em ambiente de homologação (nunca contra credenciais reais de produção durante o desenvolvimento) — não feito; os testes automatizados usam um provedor falso.
- [ ] Checagem manual (teclado, leitor de tela, zoom 200%) em `/vincular-conta`, mesmas regras de `CLAUDE.md`/`frontend-ux-seo.md`.
