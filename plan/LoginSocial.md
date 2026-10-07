# Plano: Login Social via OIDC (apps/api, apps/web)

## Contexto

Os botões Github e Gmail existem na tela de Login e Cadastro desde o mockup original, mas nunca fizeram nada além de `console.info` (ver `plan/PaginaLogin.md`). O plano de Secure by Design (`plan/SecureByDesign.md`) desabilitou os botões (`disabled`, sem handler) em vez de deixá-los simular uma funcionalidade que não existe, e apontou para este arquivo como o desenho de como implementá-los de verdade.

Este é **só o desenho** — nenhuma linha de código daqui foi implementada. Ele existe para ser avaliado e, quando aprovado, executado como os outros planos do projeto.

A decisão de arquitetura central: a API passa a aceitar dois métodos de login — o atual (email/senha, `scrypt`) e OIDC — sem remover o primeiro. A sessão resultante é a mesma de hoje (cookie `access_token` httpOnly, `csrf_token`, `AuthGuard`, `CsrfGuard`): o que muda é só como o usuário prova que é quem diz ser antes de a API emitir essa sessão.

## Provedores

Google Workspace (via `accounts.google.com`, discovery em `https://accounts.google.com/.well-known/openid-configuration`) e Microsoft Entra ID (via `https://login.microsoftonline.com/common/v2.0`, multi-tenant). Os dois são OpenID Connect padrão — nenhum SDK proprietário, só `openid-client` (ou `@nestjs/passport` + `passport-openidconnect`) configurado duas vezes.

## 1. Fluxo (Authorization Code + PKCE)

A API nunca vê a senha do usuário no provedor — esse é o ponto do OIDC. O fluxo:

1. `GET /auth/oidc/:provider/start` (`:provider` = `google` | `microsoft`, `@Public()`, `@NoCsrf()` — é GET). Gera `state` (CSRF do próprio fluxo OAuth, aleatório, `httpOnly`) e um par PKCE (`code_verifier` aleatório + `code_challenge = base64url(sha256(code_verifier))`), guarda os dois num cookie `httpOnly`, `SameSite=Lax` de vida curta (5 min — precisa sobreviver ao redirect cross-site de volta do provedor, por isso não pode ser `Strict`), e redireciona (`302`) para o `authorization_endpoint` do provedor com `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope=openid email profile`, `redirect_uri` apontando para o callback abaixo.
2. Usuário autentica no provedor (fora da nossa API inteiramente).
3. Provedor redireciona para `GET /auth/oidc/:provider/callback?code=...&state=...`. A API:
   - Valida que o `state` da query bate com o do cookie (rejeita CSRF do próprio fluxo OAuth) e que não expirou.
   - Troca o `code` pelo token no `token_endpoint`, mandando o `code_verifier` do cookie (prova de posse do PKCE — fecha o "authorization code interception attack").
   - Valida o `id_token` recebido: assinatura via JWKS do provedor (`jwks_uri` do discovery document, cacheado, nunca `alg: none` nem HS256 — só os algoritmos RS256/ES256 que o provedor realmente usa), `iss`, `aud` (= nosso `client_id`), `exp`, `nonce` se usado.
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
- Responde com um estado intermediário (`409`, ou um redirect para uma tela `/vincular-conta` no front) pedindo a senha atual da conta local.
- Só depois de validar essa senha (via `verifyPassword`, igual ao login normal) a API cria o `OidcIdentity` vinculando as duas.

Isso é a parte do fluxo com mais superfície de erro de segurança (account takeover via vinculação indevida) — vale uma revisão própria quando for implementada, não só seguir este desenho ao pé da letra.

## 5. Segurança — checklist

- [ ] PKCE obrigatório (`code_challenge_method=S256`), nunca o fluxo implícito.
- [ ] `state` aleatório (`crypto.randomBytes`), de uso único, expira em minutos, comparado com `timingSafeEqual`.
- [ ] `redirect_uri` fixo por ambiente, nunca parametrizável pela requisição.
- [ ] `id_token` validado via JWKS (biblioteca, não parsing manual) — assinatura, `iss`, `aud`, `exp`.
- [ ] Nenhuma claim do provedor entra no JWT da nossa sessão além de `sub`/`email` (mesma regra que já vale hoje — ver `auth/auth.types.ts`).
- [ ] Vinculação de conta exige prova de posse (senha atual), nunca é automática por email igual.
- [ ] Segredos do cliente OIDC (`client_secret` de cada provedor) são env vars (`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`), validados em `src/env.ts` como os outros segredos — nunca hardcoded, nunca logados.
- [ ] Rate limiting no `/auth/oidc/:provider/start` e `/callback`, mesma lógica de `LOGIN_THROTTLE`.
- [ ] Teste e2e: `state` inválido/ausente → rejeita; `code_verifier` que não bate com o `code_challenge` → rejeita; `id_token` com assinatura inválida → rejeita; `id_token` de um `aud` diferente → rejeita.

## 6. Front (`apps/web`)

- `SocialButton`/`SocialLogin` perdem o `disabled` e voltam a receber `onSelect`.
- `onSelect(providerId)` passa a ser `window.location.href = `${apiBaseUrl}/auth/oidc/${providerId}/start``— **navegação de página real, não uma chamada Axios**: o fluxo inteiro é feito de redirects do navegador (para o provedor, de volta pra API, de volta pro front), não de JSON sobre XHR/fetch.
- Nenhum código novo lida com token OIDC: o resultado do fluxo, visto do front, é exatamente o que o login por senha já produz hoje — o cookie `access_token` chega setado quando o navegador é redirecionado de volta para `/perfil`.

## Verificação (quando implementado)

- `pnpm test:api`, `pnpm test:api:e2e` cobrindo o checklist da seção 5.
- Teste manual com uma conta Google e uma Microsoft reais, em ambiente de homologação (nunca contra credenciais reais de produção durante o desenvolvimento).
- Lighthouse/a11y nas telas novas (`/vincular-conta`, se implementada), seguindo as mesmas regras de `CLAUDE.md` que as páginas de Login/Cadastro já seguem.
