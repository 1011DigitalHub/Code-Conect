# QA: Estrategia e Padroes de Testes

> **Publico-alvo:** analistas juniores / trainees.

---

## Conceito Teorico

### A Piramide de Testes

A piramide de testes e uma metafora para a distribuicao ideal de testes em um projeto. Tem tres camadas:

```
        /\
       /  \          <- E2E / Browser (poucos, lentos, caros)
      /----\
     /      \        <- Componente / Integracao (alguns, medianos)
    /--------\
   /          \      <- Unitario (muitos, rapidos, baratos)
  /____________\
```

- **Testes unitarios** — testam uma funcao ou classe isolada, com dependencias substituidas por *fakes* ou *mocks*. Sao rapidos (milissegundos), sem I/O, sem banco. Sao a maioria.
- **Testes de componente / integracao** — testam um componente de UI renderizado em jsdom, ou um modulo com suas dependencias reais (mas sem infraestrutura externa). No frontend, isso e "renderizar o LoginForm e clicar no botao". Na API, e "criar o modulo NestJS e chamar o servico com um Prisma mockado".
- **Testes e2e (ponta a ponta)** — testam o sistema completo: um browser Chromium real abrindo paginas, ou um cliente HTTP (supertest) chamando a API real com banco PostgreSQL real. Sao os mais lentos e os que mais dependem de infraestrutura, por isso sao os menos numerosos.

### DAST: Dynamic Application Security Testing

DAST e o teste de seguranca que ataca a aplicacao **enquanto ela esta rodando** — como um atacante real faria. Diferente do SAST (Semgrep), que le o codigo parado, e do SCA (pnpm audit), que checa dependencias por CVEs conhecidos, o DAST envia requests maliciosos contra a API live e verifica se passam.

```
SAST (Semgrep)    →  "Esse codigo parece vulneravel"     (analise estatica)
SCA  (pnpm audit) →  "Essa dependencia tem um CVE"       (base de dados)
DAST (ZAP)        →  "Mandei SQL injection e o banco respondeu"  (ataque real)
```

O SAST encontra codigo que *parece* vulneravel. O DAST prova que a vulnerabilidade *e exploravel* na pratica. Por isso complementam-se: o SAST e rapido e abrangente, o DAST e mais lento mas elimina falsos positivos.

No Code Connect, o DAST e implementado com o **OWASP ZAP** — o scanner de seguranca open-source mais usado do mundo (15+ anos de maturidade, mantido pela Linux Foundation). Ele tem dois modos:

- **Scan passivo (baseline):** observa headers, cookies e info leaks sem injetar payloads. Rapido (2-5 min), seguro para rodar em cada PR.
- **Scan ativo:** injeta payloads de SQLi, XSS, path traversal e outros vetores OWASP Top 10. Lento (1-2h), intrusivo — roda apenas em schedule semanal.

O ZAP importa a spec OpenAPI da API (`/api/docs-json`) e testa cada endpoint documentado automaticamente — nao precisa saber os endpoints antecipadamente.

### Por que Vitest e nao Jest?

**Vitest** e o test runner escolhido para ambas as apps. As razoes:
- E construido sobre o Vite, que ja e o bundler do frontend — mesma cadeia de ferramentas, sem configuracao duplicada.
- **Suporte nativo a ESM**: a API usa `"type": "module"` e imports com extensao `.js`. O Jest tem suporte a ESM experimental e trabalhoso; o Vitest foi construido para ESM.
- **`globals: true`**: `describe`, `it`, `expect`, `vi` ficam disponiveis sem imports, como o Jest de sempre, mas sem precisar configurar Babel para isso.
- `vite-tsconfig-paths` resolve os path aliases do `tsconfig.json` automaticamente, sem configuracao adicional no Vitest.

---

## Aplicacao no Code Connect

### Camada 1: Testes unitarios do backend (`*.spec.ts`)

Ficam **colocalizados** com o codigo-fonte em `apps/api/src/`, no mesmo diretorio do arquivo que testam. Exemplo: `users.service.ts` e `users.service.spec.ts` ficam em `apps/api/src/users/`.

O padrao de mock da API usa **instancias construidas na mao**, sem o container de DI do NestJS:

```typescript
// users.service.spec.ts (linhas 23-30)
describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { create: Mock; findUnique: Mock; update: Mock } };

  beforeEach(() => {
    prisma = { user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() } };
    service = new UsersService(prisma as unknown as PrismaService);
  });
```

O `PrismaService` e substituido por um objeto com as mesmas funcoes mockadas. Isso e intencional: a alternativa seria `Test.createTestingModule` do NestJS, que monta o container DI completo — mais lento e mais fragil para testes unitarios que precisam apenas do servico em si.

Contrastando, o `AuthService` usa `Test.createTestingModule` quando precisa testar o comportamento de jwt e dependencias aninhadas:

```typescript
// auth.service.spec.ts (linhas 39-50)
usersService = {
  findByEmail: vi.fn((email: string) =>
    Promise.resolve(email === maria.email ? maria : null),
  ),
  updatePasswordHash: vi.fn().mockResolvedValue(undefined),
};
jwtService = new JwtService({ secret: 'test-secret' });
service = new AuthService(
  usersService as unknown as UsersService,
  jwtService,
);
```

A regra e: **mock apenas o que cruza uma fronteira de I/O** (banco, HTTP, sistema de arquivos). Logica pura e testada com os valores reais.

### Camada 2: Testes de componente do frontend (`*.test.tsx`)

Ficam colocalizados com o componente em `apps/web/src/`, no mesmo diretorio (`LoginForm/LoginForm.tsx` e `LoginForm/LoginForm.test.tsx`).

O padrao usa **React Testing Library** + **`@testing-library/user-event`**:

```typescript
// LoginForm.test.tsx (linhas 8-22)
it('submits the typed credentials and the remember option', async () => {
  const onSubmit = vi.fn()
  renderWithRouter(<LoginForm onSubmit={onSubmit} forgotPasswordHref="/recuperar-senha" />)

  await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
  await userEvent.click(screen.getByRole('button', { name: 'Login' }))

  expect(onSubmit).toHaveBeenCalledWith({ email: 'ana@exemplo.com', password: 'segredo', remember: true })
})
```

Tres convencoes importantes:
1. **`getByLabelText`** em vez de `getByTestId` — o teste falha se o input perder o `<label>` associado, o que serve de guarda de acessibilidade.
2. **`getByRole`** — consulta pelo papel ARIA (button, checkbox, alert, link), nao por selector CSS. Garante que o elemento tem o papel correto para leitores de tela.
3. **`userEvent`** em vez de `fireEvent` — simula interacao real (foco, teclado, mouse), nao apenas disparo de evento sintetico. O comportamento de validacao nativa do browser e exercitado.

**Verificacao axe em cada componente:** todo componente tem um caso de teste de acessibilidade:

```typescript
// LoginForm.test.tsx (linha 60)
it('has no WCAG 2.2 AA violations', async () => {
  // expectNoA11yViolations renderiza e roda axe-core, falhando se houver
  // qualquer violacao nas regras WCAG 2.2 AA
})
```

Isso garante que nenhuma regressao de acessibilidade passa despercebida em code review — axe pega automaticamente violacoes de contraste, ausencia de labels, uso incorreto de ARIA e outros.

**Setup do ambiente de teste (`apps/web/src/test/setup.ts`):**

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

`cleanup()` desmonta todos os componentes renderizados apos cada teste, impedindo que estado de um teste vaze para o proximo. O `@testing-library/jest-dom/vitest` adiciona matchers customizados como `toHaveTextContent`, `toBeDisabled` e `toHaveAttribute`.

O ambiente e **jsdom** (configurado em `vite.config.ts`), que emula o DOM do browser sem abrir um browser real — rapido o suficiente para rodar centenas de testes de componente em segundos.

### Camada 3: Testes e2e da API (`*.e2e-spec.ts`)

Ficam em `apps/api/test/`. Usam **supertest** para fazer requisicoes HTTP reais contra a aplicacao NestJS completa, com um **banco PostgreSQL de teste** real.

**Configuracao do banco separado (`vitest.config.e2e.ts`):**

```typescript
// vitest.config.e2e.ts (linhas 18-21)
globalSetup: './test/global-setup.ts',
env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
fileParallelism: false,
```

- `globalSetup` roda **uma vez** antes de todos os arquivos de teste: aplica as migrations via `prisma migrate deploy` no banco de teste.
- `DATABASE_URL` e substituida por `TEST_DATABASE_URL` — a suíte nunca toca o banco de desenvolvimento.
- `fileParallelism: false` e **critico**: os arquivos de teste compartilham o mesmo banco e chamam `resetDatabase()` no `beforeEach`. Se rodassem em paralelo, um arquivo limparia o banco enquanto outro esta no meio de um teste — falhas aleatorias imposssiveis de debugar.

**`global-setup.ts` — guardas de seguranca:**

```typescript
// global-setup.ts (linhas 4-18)
export default function setup(): void {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL must be set');
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }
  execSync('pnpm exec prisma migrate deploy', { env: { ...process.env, DATABASE_URL: testUrl } });
}
```

A segunda guarda (`testUrl === DATABASE_URL`) impede que um desenvolvedor que esqueceu de configurar `.env` rode os e2e tests contra o proprio banco de desenvolvimento — que seria truncado por `resetDatabase`.

**`resetDatabase` e o RESTART IDENTITY:**

```typescript
// test/db.ts (linha 10)
await prisma.$executeRaw`TRUNCATE TABLE likes, comments, posts, users RESTART IDENTITY CASCADE`;
```

O `RESTART IDENTITY` reinicia os sequences (auto-incremento dos IDs) apos cada teste. Sem isso, os IDs dos registros derivam entre arquivos de teste — um teste que asserta `expect(user.id).toBe(1)` passaria no primeiro arquivo e falharia no segundo. Todos os nomes de tabela sao listados explicitamente (nao `CASCADE` sozinho) porque o `CASCADE` nao reinicia sequences de tabelas dependentes automaticamente.

**O FakeIdP nos e2e tests de OIDC:**

O `startFakeIdp()` levanta um servidor HTTP em processo na porta 0 (SO escolhe uma porta livre). As variaveis de ambiente `GOOGLE_TOKEN_ENDPOINT` etc. sao apontadas para esse servidor. Ao final do suite (`afterAll`), `fakeIdp.close()` encerra o servidor. Ver [seguranca-oidc.md](seguranca-oidc.md) para o detalhamento completo.

**Helpers compartilhados dos testes e2e (`test/helpers/`):**

Os arquivos e2e repetiam localmente duas funcoes identicas — `createApp()` e `signIn()`. Isso violava o limite de 5% de duplicacao do projeto (medido por jscpd). As funcoes foram extraidas para helpers reutilizaveis:

| Helper | Arquivo | O que faz |
|--------|---------|-----------|
| `createTestApp()` | `test/helpers/app.ts` | Compila o `AppModule`, aplica `configureApp` e `setupSwagger`, chama `app.init()` e devolve um `NestExpressApplication` pronto para supertest. Elimina o boilerplate repetido em 6 spec files. |
| `loginAs(app, credentials)` | `test/helpers/auth.ts` | Cadastra o usuario (`POST /users`) e faz login (`POST /auth/login`) com um `request.agent` (o cookie de sessao fica no jar). Devolve `{ agent, csrfToken }`. O `csrfToken` e o token novo lido do `Set-Cookie` do login, porque o login troca o token e o de antes deixa de valer. |
| `Agent` (tipo) | `test/helpers/auth.ts` | Alias de `ReturnType<typeof request.agent>`, para tipar o agente nos specs sem repetir essa expressao. |

```typescript
// Padrao antes (duplicado em 4+ arquivos):
async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app;
}

// Padrao depois (importado de test/helpers/app.ts):
const app = await createTestApp();
```

```typescript
// Antes (duplicado em posts e comments):
async function signIn(credentials) {
  const agent = request.agent(app.getHttpServer());
  const signUpToken = await fetchCsrfToken(agent);
  await agent.post('/users').set('X-CSRF-Token', signUpToken).send(credentials).expect(201);
  // O login troca o csrf token: o de antes do login deixa de valer.
  const res = await agent
    .post('/auth/login')
    .set('X-CSRF-Token', signUpToken)
    .send({ email: credentials.email, password: credentials.password })
    .expect(200);
  return { agent, csrfToken: cookieValue(setCookie(res, 'csrf_token')) };
}

// Depois (importado de test/helpers/auth.ts):
const { agent, csrfToken } = await loginAs(app, credentials);
await agent.post('/posts').set('X-CSRF-Token', csrfToken).send(newPost);
```

**Por que isso e relevante como padrao de design de testes?**
Centralizar o bootstrap e o login em helpers garante que 6 dos 8 spec files usam a mesma configuracao de `configureApp` e `setupSwagger`. Os dois blocos restantes em `security.e2e-spec.ts` continuam montando o app manualmente com `overrideProvider(HealthService)` — situacao prevista, pois precisam substituir dependencias para simular falha de banco.

### Camada 4: Testes e2e do frontend (Playwright)

Ficam em `apps/web/e2e/`. Usam **Playwright** com um browser **Chromium headless** real. Rodados com `pnpm test:web:a11y`.

Enquanto os testes de componente usam jsdom (emulacao), o Playwright abre um Chromium de verdade — o que permite testar:
- **Acessibilidade via axe-core/playwright**: o `AxeBuilder` injeta o axe no browser e analisa a pagina renderizada
- **Reflow horizontal** (WCAG 1.4.10): mede se `scrollWidth > clientWidth` no viewport de 320px
- **Text Spacing** (WCAG 1.4.12): injeta CSS que aumenta espacamento e verifica que nada fica cortado

```typescript
// a11y.e2e.ts (linhas 23-27)
test('has no WCAG 2.2 AA violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  const report = formatViolations(results.violations)
  expect(report, report.join('\n')).toEqual([])
})
```

O `WCAG_AA_TAGS` filtra apenas as regras da WCAG 2.2 nivel AA — sem isso, o axe incluiria regras experimentais que geram falsos positivos.

Os e2e do frontend rodam contra o **build de producao** (`vite build` + `vite preview`), nao contra o servidor de dev. Isso e intencional: o build de producao aplica tree-shaking, minificacao e os headers de seguranca que o `vite preview` serve — auditamos o que os usuarios realmente recebem.

### Camada 5: DAST da API (OWASP ZAP)

O DAST roda em dois contextos distintos:

**No CI, a cada PR que toca o backend (`dast-api` no stage 3):**

O job builda a API, levanta um PostgreSQL de teste (porta `5433`, isolada do `e2e-api` na `5432`), aplica migrations, inicia a API na porta `3001` e aponta o ZAP API scan em modo passivo contra `http://localhost:3001/api/docs-json`.

O scan passivo **nao injeta payloads** — apenas observa o que a API retorna e verifica headers de seguranca, configuracao de cookies, information leaks e outros checks passivos. Roda em 2-5 minutos e comeca como `continue-on-error` ate ser promovido a bloqueante apos calibragem de falsos positivos.

**Em schedule semanal (`security-dast.yml`, domingos 03:30 UTC):**

Mesmo setup, mas em modo **ativo**: o ZAP injeta payloads reais (SQLi, XSS, path traversal, command injection) contra cada endpoint. Leva 1-2 horas. Findings criticos criam uma GitHub Issue automatica para triagem.

O `JWT_SECRET` do scan semanal e gerado dinamicamente via `openssl rand -base64 48` — nao ha string hardcoded no workflow.

**Falsos positivos:**

O arquivo `.github/zap/rules.tsv` permite suprimir alertas confirmados como falsos positivos. O formato e: `<rule-id>\t<action>\t<justificativa>`. Novas entradas sao adicionadas somente apos triagem manual do report.

---

## Erros Comuns e Armadilhas

### 1. Esquecer `fileParallelism: false` nos e2e da API

Se dois arquivos de e2e rodarem em paralelo e ambos chamarem `resetDatabase()`, um deles trunca o banco no meio da execucao do outro. Os erros sao aleatorios e dificiissimos de reproduzir. O `fileParallelism: false` esta em `vitest.config.e2e.ts` e nao deve ser removido.

### 2. Usar `getByTestId` em vez de `getByRole` ou `getByLabelText`

`data-testid` passa no teste independente do papel ARIA do elemento. Um `<div role="button">` e um `<button>` sao indistinguiveis para `getByTestId`, mas o leitor de tela os trata diferente. A Testing Library deliberadamente nao exporta `getByTestId` na importacao padrao — e um sinal de que deve ser o ultimo recurso.

### 3. Usar `fireEvent` em vez de `userEvent`

`fireEvent.click` dispara apenas um evento `click`. `userEvent.click` simula todo o ciclo: pointerover, pointerenter, mouseover, mouseenter, pointermove, mousemove, pointerdown, mousedown, focus, pointerup, mouseup, click. Componentes que dependem de eventos de foco, hover ou sequencia de eventos falham silenciosamente com `fireEvent`.

### 4. Nao limpar o banco corretamente nos e2e da API

`TRUNCATE ... RESTART IDENTITY CASCADE` parece excessivo ate o dia em que um teste asserta um ID especifico ou depende de sequencia de IDs. Nao simplifique para `DELETE FROM` sem `RESTART IDENTITY` — os counters de autoincremento nao reiniciam e os IDs derivam.

### 5. Rodar `pnpm test:api:e2e` sem `pnpm db:up` ou sem configurar `.env`

O global-setup vai lancar um erro claro: `TEST_DATABASE_URL must be set`. Mas se `TEST_DATABASE_URL` e igual a `DATABASE_URL` (o desenvolvedor copiou a variavel errada), o erro tambem e claro: `must differ from DATABASE_URL`. Esses guardas existem exatamente para esse caso.

### 6. Testar a logica de negocio nos e2e ao inves de nos unitarios

E tentador escrever apenas testes e2e porque eles "testam tudo". O problema: sao 10-50x mais lentos e precisam de banco. Um servico com 10 casos de borda que so tem cobertura em e2e leva minutos para rodar. Os casos de borda pertencem aos testes unitarios; o e2e cobre o caminho feliz e os casos de erro de infraestrutura (banco indisponivel, token expirado na rede).

### 7. Achar que DAST substitui SAST (ou vice-versa)

O DAST (ZAP) e o SAST (Semgrep) testam vetores diferentes. O Semgrep encontra padroes inseguros no codigo que podem nunca ser exploraveis em runtime (porque o helmet bloqueia, ou o input nunca chega ali). O ZAP so encontra o que e exploravel, mas nao enxerga codigo que nao esta exposto via endpoint. As duas camadas se complementam — nenhuma substitui a outra.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Config Vitest unitario (`globals: true`, `*.spec.ts`) | `apps/api/vitest.config.ts` | todos |
| Config Vitest e2e (`fileParallelism: false`, `globalSetup`) | `apps/api/vitest.config.e2e.ts` | linhas 17-21 |
| Guardas de banco no global-setup | `apps/api/test/global-setup.ts` | todos |
| `resetDatabase` com `RESTART IDENTITY CASCADE` | `apps/api/test/db.ts` | linha 10 |
| FakeIdP (servidor HTTP in-process para testes OIDC) | `apps/api/test/oidc-fake-idp.ts` | todos |
| Config Vitest do frontend (jsdom, `setupFiles`) | `apps/web/vite.config.ts` | linhas 46-50 |
| Setup global de testes frontend (`cleanup`, jest-dom) | `apps/web/src/test/setup.ts` | todos |
| Padrao `getByRole`/`getByLabelText` + `userEvent` | `apps/web/src/components/organisms/LoginForm/LoginForm.test.tsx` | linhas 8-22 |
| Checagem axe em componente (`expectNoA11yViolations`) | `apps/web/src/components/organisms/LoginForm/LoginForm.test.tsx` | linha 60 |
| Suite Playwright: axe, reflow, text-spacing, titulo | `apps/web/e2e/a11y.e2e.ts` | todos |
| `WCAG_AA_TAGS` (filtragem de regras axe) | `apps/web/src/test/wcag.ts` | (referenciado em a11y.e2e.ts:4) |
| Headers de seguranca servidos pelo `vite preview` | `apps/web/vite.config.ts` | linhas 22-38 |
| Mock direto de Prisma (sem container DI) | `apps/api/src/users/users.service.spec.ts` | linhas 23-30 |
| Mock de UsersService construido manualmente | `apps/api/src/auth/auth.service.spec.ts` | linhas 39-50 |
| Helper `createTestApp()` — bootstrap centralizado dos e2e | `apps/api/test/helpers/app.ts` | todos |
| Helper `loginAs()` e tipo `Agent` — autenticacao centralizada | `apps/api/test/helpers/auth.ts` | todos |
| Job `dast-api` (ZAP passivo, stage 3, porta 5433/3001) | `.github/workflows/ci.yml` | job `dast-api` |
| Workflow DAST ativo semanal (ZAP + JWT efemero) | `.github/workflows/security-dast.yml` | todos |
| Regras de supressao de FPs do ZAP | `.github/zap/rules.tsv` | todos |
| OpenAPI spec servida pelo SwaggerModule | `apps/api/src/swagger.ts` | `SwaggerModule.setup('api/docs', ...)` |

---

_Ultima atualizacao: 2026-10-20 | Gerado a partir do codigo-fonte._
