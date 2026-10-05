# Plano: Integração Front-end ↔ Back-end com Axios

## Contexto
O `apps/api` já tem os endpoints de autenticação documentados no Swagger (`/api/docs`), criados pelo plano `AutenticacaoUsuario.md`:

| Endpoint | Body | Sucesso | Erros |
|---|---|---|---|
| `POST /users` | `{ name, email, password }` | `201` + `UserEntity` (`id, name, email, createdAt, links.self`) | `400`, `409` email já cadastrado |
| `POST /auth/login` | `{ email, password }` | `200` + `{ accessToken, tokenType: 'Bearer', expiresIn }` | `400`, `401` |
| `GET /auth/me` | header `Authorization: Bearer` | `200` + `UserEntity` | `401` |

No `apps/web`, `LoginPage` e `SignUpPage` ainda são stubs com `console.info` e `// TODO: call the API`. Este plano liga as duas páginas à API com **Axios**, guarda o JWT e cria uma página logada `/perfil` que chama `GET /auth/me`, para testar o fluxo completo.

Decisões (confirmadas com o usuário):
- **Login por email**: o campo "Email ou usuário" vira "Email" (`type="email"`), porque a API só aceita email. A API não muda.
- **Depois do login**: vai para a nova página protegida `/perfil` (nome, email e botão "Sair").
- **Depois do cadastro**: login automático (`POST /users` e depois `POST /auth/login`), em seguida `/perfil`.
- **Token**: "Lembrar-me" marcado → `localStorage`; desmarcado → `sessionStorage`. O token expira em 1h de qualquer forma.
- **URL da API**: `VITE_API_URL` (default `http://localhost:3000`) + CORS na API só para as origens conhecidas, como o CLAUDE.md exige antes de o navegador chamar a API. Sem proxy do Vite, para que dev e produção funcionem igual.
- **Rate limiting** com `@nestjs/throttler`, só em `POST /auth/login` e `POST /users`. Excesso de tentativas → `429 Too Many Requests` com header `Retry-After`. O front mostra uma mensagem própria para esse caso.

## 1. API: CORS (`apps/api`)

### O conceito
- **Origem** = esquema + host + porta. `http://localhost:5173` (web) e `http://localhost:3000` (API) são **origens diferentes**, porque a porta muda.
- **Same-Origin Policy**: por padrão, o navegador deixa um script fazer a requisição para outra origem, mas **não entrega a resposta** ao JavaScript. O Axios recebe um "Network Error" e o console mostra "blocked by CORS policy".
- **CORS** (Cross-Origin Resource Sharing) é como o **servidor** avisa ao navegador quais outras origens podem ler as respostas dele. Ele faz isso com headers:
  - `Access-Control-Allow-Origin`: a origem permitida (ecoa a do pedido se ela estiver na lista);
  - `Access-Control-Allow-Methods` / `Access-Control-Allow-Headers`: métodos e headers aceitos;
  - `Access-Control-Expose-Headers`: headers da resposta que o JS pode ler (por padrão só os "simples"; `Location` e `Retry-After` precisam ser expostos);
  - `Access-Control-Max-Age`: quanto tempo o navegador guarda o resultado do preflight.
- **Preflight**: as chamadas deste app não são "simples", porque usam `Content-Type: application/json` e `Authorization`. Antes delas, o navegador manda um `OPTIONS` automático. A requisição real só sai se a resposta do preflight liberar a origem, o método e os headers.
- **O que CORS não é**: não é autenticação nem protege a API. `curl`, Postman e servidores ignoram CORS. Ele protege o **usuário no navegador**, porque impede que um site qualquer leia respostas da nossa API em nome dele. Quem protege a API são o JWT, a validação e o rate limiting.
- **Por que não `*`**: liberar qualquer origem deixaria qualquer site chamar a API pelo navegador do usuário. Também não usamos `credentials: true`, porque o token vai no header `Authorization` (que o JS anexa), e não em cookie.

### Implementação
- Novo `src/cors.ts` com `getCorsOptions(): CorsOptions`:
  - `origin`: lista lida de `CORS_ORIGINS` (separada por vírgula). O default de dev é `http://localhost:5173,http://127.0.0.1:5174` (vite dev + vite preview do Playwright). Em produção, sem a variável, a API recusa todas as origens em vez de liberar tudo.
  - `methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']`;
  - `allowedHeaders: ['Content-Type', 'Authorization']`;
  - `exposedHeaders: ['Location', 'Retry-After']`;
  - `maxAge: 600`, `credentials: false`.
- `src/app.setup.ts` → `configureApp` chama `app.enableCors(getCorsOptions())`. Fica no `configureApp` para os testes e2e rodarem com a mesma configuração.
- `apps/api/.env.example` com `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT` e `CORS_ORIGINS` (valores falsos). O `.env` real fica fora do git.

## 1b. API: Rate limiting no login e no cadastro (`apps/api`)
**Por quê:** sem limite, um atacante pode testar milhares de senhas em `POST /auth/login` (força bruta e credential stuffing) ou criar contas em massa em `POST /users`. O scrypt também é caro de propósito, então muitas requisições viram uma forma de derrubar a API.

- `pnpm api add @nestjs/throttler`. Conferir se o peer dep aceita `@nestjs/common` 12 (se ainda não aceitar, avisar antes de seguir) e rodar `pnpm audit`.
- `AppModule`: `ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])`.
  - O guard **não** fica global, então o resto da API não muda.
  - O armazenamento é em memória, por IP, igual aos usuários. Com mais de uma instância, troca-se por Redis.
- Limites por rota com `@UseGuards(ThrottlerGuard)` + `@Throttle(...)`, valores em `src/common/throttle.constants.ts`:

  | Rota | Limite | Motivo |
  |---|---|---|
  | `POST /auth/login` | **5 por minuto** por IP | Dá margem para quem errou a senha e torna força bruta inviável |
  | `POST /users` | **3 por minuto** por IP | Cadastro é raro; freia criação de contas em massa |

- Resposta ao estourar o limite: `429` no formato padrão do Nest (`{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }`) e header `Retry-After` (segundos), que o CORS expõe ao front.
- Swagger: `@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'Muitas tentativas; veja o header Retry-After' })` nos dois handlers.
- Proxy reverso: o throttler usa `req.ip`. No deploy, atrás de um proxy, será preciso configurar `app.set('trust proxy', ...)`; senão, todos os usuários dividem o mesmo IP. Fica registrado para o plano de deploy, junto com `helmet`.

## 2. Web: dependência e configuração
- `pnpm web add axios` (~14 KB gzip). Conferir o tamanho do bundle depois do build. Se a Performance do Lighthouse cair, carregar o módulo de API com `import()` dentro dos handlers de submit.
- `apps/web/.env.example`: `VITE_API_URL=http://localhost:3000`. Tipar em `src/vite-env.d.ts` (`interface ImportMetaEnv { readonly VITE_API_URL?: string }`).

## 3. Web: camada de API (`apps/web/src/api/`)
Fica fora de `components/` (regra do Atomic Design: só pages e hooks falam com a API).

```
src/api/
  client.ts          # instância Axios + interceptors
  client.test.ts
  tokenStorage.ts    # getToken / saveToken(token, remember) / clearToken
  tokenStorage.test.ts
  auth.ts            # login(), getMe()
  users.ts           # createUser()
  errors.ts          # getErrorMessage(error): string em pt-BR
  errors.test.ts
  types.ts           # User, TokenResponse, ApiError (espelham o Swagger)
```
- `client.ts`: `axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000', timeout: 10_000, headers: { 'Content-Type': 'application/json' } })`.
  - Interceptor de **request**: se `getToken()` existir, adiciona `Authorization: Bearer <token>`.
  - Interceptor de **response**: em `401` numa requisição que levou token, chama `clearToken()` e rejeita o erro (a página decide para onde ir).
- `tokenStorage.ts`: grava em `localStorage` ou `sessionStorage` conforme `remember`, sempre limpando o outro storage. Todo acesso fica em `try/catch` (o storage pode estar bloqueado). Nunca loga o token.
- `auth.ts`: `login({ email, password }) → TokenResponse` e `getMe() → User`. `users.ts`: `createUser({ name, email, password }) → User`. Todas devolvem `response.data` tipado.
- `errors.ts`: `getErrorMessage(error)` usa `axios.isAxiosError` e mapeia o status para mensagens em pt-BR, sem mostrar mensagens internas da API:
  - sem `response` (rede ou timeout) → "Não foi possível conectar ao servidor. Tente novamente."
  - `400` → "Verifique os dados informados."
  - `401` → "Email ou senha inválidos."
  - `409` → "Este email já está cadastrado."
  - `429` → "Muitas tentativas. Aguarde N segundos e tente novamente.", com N lido do header `Retry-After` (sem o header, "Aguarde um minuto").
  - qualquer outro status → "Algo deu errado. Tente novamente."

## 4. Web: componentes
**atoms/**
- Novo `FormError`: `<p role="alert" className="text-sm text-danger">` com ícone/texto "Erro:" visível, para não depender só da cor. Renderiza `null` sem mensagem. Com test e axe.

**organisms/**
- `LoginForm`:
  - `login` vira `email` (`type="email"`, label "Email", `autoComplete="email"`, placeholder "Digite seu email").
  - Novas props `submitting?: boolean` e `error?: string`. O erro aparece com `FormError` acima do botão.
  - Com `submitting`, o botão fica `disabled` e mostra "Entrando...".
- `SignUpForm`: mesmas props (`submitting`, `error`) e o botão mostra "Cadastrando...". Validação nativa alinhada ao DTO: `maxLength={100}` no nome, `minLength={8} maxLength={72}` na senha, e um texto de ajuda "Mínimo de 8 caracteres" ligado à senha via `aria-describedby` (precisa de prop `hint?` no `FormField`).
- Novo `ProfileCard`: mostra `name`, `email` e a data de cadastro (`createdAt` formatada em pt-BR), com um botão "Sair" (`onLogout`). Usa só atoms/molecules existentes (`Heading`, `Button`).

**templates/**
- Novo `CenteredTemplate`: card `bg-surface` centralizado com slot `children`, sem banner. Fica para páginas logadas simples.

## 5. Web: páginas e rotas
- `LoginPage`:
  - estado `submitting` e `error`;
  - `handleLogin` → `login()` → `saveToken(accessToken, remember)` → `navigate('/perfil')`;
  - no `catch`, `setError(getErrorMessage(e))`.
- `SignUpPage`: `createUser()` → `login()` com o mesmo email e senha → `saveToken` → `navigate('/perfil')`. Se o cadastro passar e o login falhar, vai para `/login`.
- Nova `ProfilePage` (`/perfil`):
  - `usePageMeta('Perfil', 'Veja os dados da sua conta no Code Connect e gerencie sua sessão na comunidade de pessoas desenvolvedoras.')`;
  - sem token → `<Navigate to="/login" replace />`;
  - com token → `getMe()` num `useEffect` (com `AbortController`) e "Carregando..." em `role="status"` enquanto espera;
  - `401` → `clearToken()` e volta para `/login`; outros erros → `FormError`;
  - "Sair" → `clearToken()` + `navigate('/login')`.
- `App.tsx`: `<Route path="/perfil" element={<ProfilePage />} />`.
- `/perfil` é privada: **não** entra em `e2e/routes.ts` (SEO e Lighthouse são só para rotas públicas). `public/robots.txt` ganha `Disallow: /perfil`. O `llms.txt` não muda.

## 6. Testes
**API**
- `src/cors.spec.ts`: default de dev, parsing de `CORS_ORIGINS` (espaços, vírgulas) e produção sem variável → nenhuma origem.
- Novo `test/cors.e2e-spec.ts`:
  - preflight `OPTIONS /auth/login` com `Origin: http://localhost:5173` e `Access-Control-Request-Headers: content-type,authorization` → `204`, `Access-Control-Allow-Origin` igual à origem e `authorization` nos headers permitidos;
  - origem desconhecida → sem `Access-Control-Allow-Origin`;
  - `POST /users` de origem permitida → `Access-Control-Expose-Headers` inclui `Location`.
- Novo `test/throttle.e2e-spec.ts` (app novo por teste, para o contador começar zerado):
  - 5 logins com senha errada → `401`; o 6º → `429` com `Retry-After` e corpo `{ statusCode: 429, ... }`;
  - 3 cadastros → `201`/`409`; o 4º → `429`;
  - `GET /auth/me` não é limitado (mais de 5 chamadas → todas `200`).
- `test/auth.e2e-spec.ts`: conferir que nenhum `it` passa de 5 logins ou 3 cadastros no mesmo app. Se passar, criar o app no `beforeEach`. Também verificar no `GET /api/docs-json` que as duas rotas documentam a resposta `429`.

**Web (Vitest), cada arquivo com o caso `has no WCAG 2.2 AA violations` quando renderiza UI:**
- `tokenStorage.test.ts`: `remember` escolhe o storage, `clearToken` limpa os dois, e storage que lança erro não quebra.
- `client.test.ts`: com um `adapter` falso do Axios (sem nova dependência), conferir que envia `Authorization: Bearer` quando há token e que um `401` limpa o token.
- `errors.test.ts`: cada status → mensagem certa (inclui `429` com e sem `Retry-After`); erro sem response → mensagem de conexão.
- `FormError.test.tsx`, `ProfileCard.test.tsx` (mostra dados e "Sair" chama `onLogout`), `CenteredTemplate.test.tsx`.
- `LoginForm.test.tsx` / `SignUpForm.test.tsx`: label "Email"; com `submitting`, o botão fica desabilitado; com `error`, aparece um alerta.
- `LoginPage.test.tsx` / `SignUpPage.test.tsx`: `vi.mock('../../api/auth')` (e `users`). Sucesso → token salvo e navegação para `/perfil`; `401`/`409` → mensagem de erro visível.
- `ProfilePage.test.tsx`: sem token → redireciona para `/login`; com token → mostra nome e email; `401` → limpa o token e redireciona; "Sair" → limpa e redireciona.

**Web (Playwright)**
- Novo `e2e/profile.e2e.ts`:
  - grava o token no `sessionStorage` (`addInitScript`) e simula `GET /auth/me` com `page.route` (sem precisar da API rodando);
  - roda axe AA, Reflow, foco visível e o title `Perfil | Code Connect` nas três larguras.
- As suítes de Login e Cadastro seguem iguais: nenhuma chamada à API acontece no carregamento.

## 7. Documentação
- `CLAUDE.md`:
  - seção Frontend: camada `src/api/` (cliente Axios, `VITE_API_URL`, `tokenStorage`, `getErrorMessage`) e a regra "componentes não importam `src/api`";
  - seção de segurança da API: trocar "enable CORS ... before" e "Add rate limiting ... before deploying" pelo que existe agora (`getCorsOptions`/`CORS_ORIGINS`, limites em `throttle.constants.ts`, `429` documentado) e manter `trust proxy` + `helmet` como pendências de deploy.
- `plan/PaginaLogin.md` e `plan/PaginaCadastro.md`: nota datada (2026-10-02) sobre a troca do campo para Email e a ligação com a API.

## 8. Commits (Conventional Commits)
1. `docs(root): add front-end and back-end integration plan`
2. `feat(api): enable cors for the web app origins`
3. `build(api): add nestjs throttler`
4. `feat(api): rate limit login and user sign-up`
5. `build(web): add axios`
6. `feat(web): add api client and token storage`
7. `feat(web): add form error atom`
8. `feat(web): add submitting and error states to auth forms`
9. `feat(web): connect login and sign-up pages to the api`
10. `feat(web): add profile page`
11. `test(web): cover profile page in the browser suite`
12. `docs(root): document web api layer, cors and rate limits`

## Verificação
- `pnpm test:api`, `pnpm test:api:e2e`, `pnpm test:web`, `pnpm test:web:a11y`: todos passam.
- `pnpm lint` e `pnpm build`.
- Manual, com `pnpm dev` (API em :3000, web em :5173):
  1. Cadastro → cai em `/perfil` com nome e email certos.
  2. Sair → `/login`. Login com senha errada → "Email ou senha inválidos." (anunciado pelo leitor de tela).
  3. Login com "Lembrar-me" → fechar e reabrir a aba e continuar logado; sem marcar → a sessão some ao fechar.
  4. Cadastrar o mesmo email de novo → "Este email já está cadastrado."
  5. API parada → mensagem de conexão.
  6. DevTools > Network:
     - o preflight `OPTIONS` antes de `/auth/login` responde com `Access-Control-Allow-Origin: http://localhost:5173`;
     - `Authorization: Bearer` aparece só no `/auth/me`;
     - nenhum erro de CORS no console.
  7. CORS negado: subir a API com `CORS_ORIGINS=http://exemplo.com` e confirmar que o login falha com "blocked by CORS policy" no console e com a mensagem de conexão na tela. Depois, voltar ao default.
  8. Rate limit:
     - errar a senha 6 vezes seguidas → "Muitas tentativas. Aguarde N segundos..." e `429` + `Retry-After` no Network;
     - depois de 1 minuto, o login volta a funcionar.
  9. Swagger (`/api/docs`): login e cadastro mostram a resposta `429`.
- Acessibilidade: usar Login, Cadastro e Perfil só com o teclado, testar com o NVDA (erros e "Carregando..." anunciados) e conferir zoom de 200%.
- Lighthouse (DevTools, build de produção, aba anônima) em `/login` e `/cadastro`: registrar a tabela (Performance, Acessibilidade, Boas práticas, SEO, LCP, CLS, TBT) e confirmar que o Axios não derrubou a Performance abaixo de 90.

## Notas de execução (2026-10-02)
- `CenteredTemplate` recebeu a prop `title` (o `h1` da página), em vez de só `children`, para garantir um único `h1`.
- `ProfileCard` define o próprio tipo de usuário, para não importar de `src/api/` (regra: componentes não falam com a API).
- Os specs de controller que usam `ThrottlerGuard` o substituem por um guard liberado; o limite é coberto por `test/throttle.e2e-spec.ts`.
- A API já usa Prisma/Postgres (não mais array em memória); isso não alterou o plano.
- Pendências manuais: medir o Lighthouse em `/login` e `/cadastro` (build de produção, DevTools) e fazer os testes com NVDA e zoom de 200%.

## Lighthouse (2026-10-05, GitHub Actions, desktop, build de produção)
Run 37314201427 no PR #1, três execuções por rota (resultados idênticos). Com o Axios no bundle (JS de 323 KB, 105 KB gzip), os alvos continuam atingidos.

| Rota | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/login` | 100 | 100 | 100 | 100 | 0,6 s | 0 | 0 a 10 ms |
| `/cadastro` | 100 | 100 | 100 | 100 | 0,6 s | 0 | 0 ms |

`/perfil` é privada e não entra no Lighthouse (nem em `e2e/routes.ts`).
