# Plano: Otimização do pipeline de CI (escopo afetado + fail-fast)

> Status: aguardando aprovação (2026-10-08). Ver "Pontos em aberto" no fim antes de aprovar.

## Contexto
Hoje o `ci.yml` não tem filtro de caminho. Todo push ou PR roda lint, typecheck e unit tests das duas apps, além de `e2e-api` (Postgres) e `e2e-web` (Playwright, até ~10 min de setup a frio), mesmo quando a mudança é só em `plan/*.md`. O `lighthouse.yml` e o `claude.yml` rodam em paralelo e de forma independente, então a revisão por IA, que gasta tokens, roda mesmo quando o código não passa no lint.

O objetivo é rodar só o que a mudança afeta, em estágios encadeados com `needs:`, e abortar cedo quando um estágio falha.

## O que a análise encontrou (afeta o desenho)
- **Não existe `prisma/` na raiz.** O schema fica em `apps/api/prisma/`, que já está coberto por `apps/api/**`. Mesmo assim, `prisma/**` continua no filtro da API, como pede a especificação.
- **A documentação está desatualizada.** O `development-workflow.md` diz que o Lighthouse está restrito a `apps/web/**`, mas o `lighthouse.yml` também dispara com `apps/api/**`. A página auditada (`/`, o feed) consome a API.
- **O cache do Playwright sozinho não elimina os ~10 min.** O comentário do `ci.yml` (linhas 103-108) mede 9m34s para `playwright install --with-deps`, e o custo está no apt das bibliotecas de sistema. Essas bibliotecas não ficam em `~/.cache/ms-playwright`. O cache economiza o download do Chromium, mas o `install-deps` (apt) continua rodando a cada execução. O ganho real será medido antes e depois.
- **Não há configuração de markdownlint no repositório.** Rodar o lint em todos os `.md` existentes provavelmente falharia em documentos antigos. Por isso o lint de docs olha só os `.md` alterados, com uma configuração tolerante.
- **`needs:` não funciona entre workflows diferentes.** Para o `claude.yml` e o `lighthouse.yml` participarem do fail-fast, eles viram workflows reutilizáveis (`workflow_call`) chamados pelo `ci.yml`. Os arquivos continuam existindo.
- **O branch `feat/login-social` tem mudanças OIDC não commitadas.** O trabalho de CI será feito num `git worktree` novo a partir de `main` (branch `ci/otimizacao-pipeline`), sem mexer nessas mudanças.

## Decisões com padrão recomendado
- **D1: Lighthouse em mudança só de API é pulado**, como diz a especificação (`apps/api/**` sai do gatilho). Trade-off: uma regressão de latência ou de payload da API que piore o LCP do feed não é pega no PR. Ela continua sendo pega no push para `main`, que roda a suíte completa (D2).
- **D2: Push para `main` e `workflow_dispatch` sempre rodam a suíte completa.** A filtragem vale só para PRs. Assim a `main` continua 100% validada e não há perda de métrica.
- **D3: Arquivos fora de qualquer escopo conhecido** (ex.: `docker-compose.yml`, `.gitattributes`, `docker/**`) contam como "core" e disparam a suíte completa. É fail-closed: nenhuma mudança passa sem validação.
- **D4: O `security.yml` não muda** e continua sem filtro (TruffleHog, Semgrep e `pnpm audit` em todo PR).

## Arquitetura alvo do `ci.yml`
```text
changes ─┬─ [Estágio 1] static-api   (lint:api + typecheck:api)
         ├─ [Estágio 1] static-web   (lint:web + typecheck:web)
         ├─ [Estágio 1] docs-lint    (markdownlint nos .md alterados)
         │
         ├─ claude-review (reutiliza claude.yml)  needs: estágio 1
         │
         ├─ [Estágio 2] unit-api      (test:api)    needs: todo o estágio 1
         ├─ [Estágio 2] component-web (test:web)    needs: todo o estágio 1
         │
         ├─ [Estágio 3] e2e-api    (Postgres + test:api:e2e)       needs: todo o estágio 2
         ├─ [Estágio 3] e2e-web    (Postgres + Playwright, cache)  needs: todo o estágio 2
         ├─ [Estágio 3] lighthouse (reutiliza lighthouse.yml)      needs: todo o estágio 2
         │
         └─ ci-gate (if: always()): falha se algum job falhou ou foi cancelado → único required check
```

### Job `changes` (detecção de escopo)
`dorny/paths-filter`, fixado por SHA como todas as actions do repo, em dois passos:
- **Passo A** (quantificador padrão `some`):
  - `api: [apps/api/**, prisma/**]`
  - `web: [apps/web/**]`
  - `core: [package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .github/workflows/**, .github/actions/**]`
  - `docs: ['**/*.md']`
- **Passo B** (`predicate-quantifier: every`): `unclassified: ['**', '!apps/api/**', '!apps/web/**', '!**/*.md', '!<arquivos core>']`. É `true` se alguma mudança cair fora de todos os escopos (D3).

Um passo shell calcula as saídas finais:
- `full` = evento não é `pull_request` (D2) ou `core` ou `unclassified`
- `api` = `api || full`; `web` = `web || full`; `docs` = `docs`
- `docs_only` = `docs && !api && !web && !full`. É informativo, para o summary: nesse caso todos os jobs pesados já ficam pulados naturalmente.

O passo também escreve no `$GITHUB_STEP_SUMMARY` uma tabela com o escopo detectado.

### Matriz resultante
| Mudança | Estágio 1 | Estágio 2 | Estágio 3 | Claude |
|---|---|---|---|---|
| só `apps/api/**` / `prisma/**` | static-api | unit-api | e2e-api | sim |
| só `apps/web/**` | static-web | component-web | e2e-web + lighthouse (sem e2e-api) | sim |
| core (`package.json`, `pnpm-workspace.yaml`, lockfile, workflows) ou fora de escopo | tudo | tudo | tudo | sim |
| só `.md` (`plan/`, `CLAUDE.md`, guidelines) | docs-lint | — | — | não |
| push em `main` / dispatch | tudo | tudo | tudo | n/a |

### Fail-fast
- Os jobs dos estágios 2 e 3 têm `needs:` em todos os jobs do estágio anterior e `if: ${{ !failure() && !cancelled() && needs.changes.outputs.<escopo> == 'true' }}`. Um job pulado por estar fora do escopo não bloqueia nada. Uma falha em qualquer job, inclusive na outra app, aborta todos os estágios seguintes.
- Limitação nativa: jobs do mesmo estágio rodam em paralelo e não cancelam uns aos outros. O corte acontece na fronteira do estágio.
- `ci-gate`: `needs` em todos os jobs e `if: always()`. Falha se algum `result` for `failure` ou `cancelled`. Ele deve ser o único required check na proteção de branch, porque jobs pulados por filtro não podem bloquear o merge.

### Reaproveitamento de setup
- Nova composite action `.github/actions/setup-workspace/action.yml` com `pnpm/action-setup` + `actions/setup-node` (`cache: pnpm`, mantido) + `pnpm install --frozen-lockfile`. SHAs e versões são os atuais (`PNPM_VERSION` 12.6.0, Node 22). Ela substitui os 3 passos repetidos em cada job.
- Comandos via `pnpm --filter`, usando os scripts que já existem no `package.json` da raiz: `lint:api`, `typecheck:api`, `test:api`, `test:api:e2e`, `lint:web`, `typecheck:web`, `test:web`, `test:web:a11y`.

### Estágio 3: `e2e-web` com cache do Playwright
- Um passo lê a versão com `pnpm --filter web exec playwright --version` e monta a chave `playwright-${{ runner.os }}-<versão>`.
- `actions/cache` (fixado por SHA) em `~/.cache/ms-playwright`.
- Cache miss: `playwright install --with-deps chromium`. Cache hit: só `playwright install-deps chromium` (apt), sem baixar o browser.
- Mantém `timeout-minutes: 25`, `workers: 1` do `playwright.config.ts` (sem mudança), `NODE_ENV` fora do nível do job e o build da API antes da suíte, com os mesmos comentários explicativos.

### `lighthouse.yml`
- O gatilho vira `on: workflow_call` + `workflow_dispatch` (rodar manualmente continua possível). O `concurrency` próprio sai, porque o do `ci.yml` governa.
- Steps, envs, `lhci collect/upload/assert`, summary e artifact ficam iguais. O Lighthouse não usa Playwright, então não recebe o cache.
- É chamado pelo `ci.yml` no estágio 3 com `if: ... && needs.changes.outputs.web == 'true'` (D1).

### `claude.yml`
- O gatilho vira `on: workflow_call`. O `ci.yml` chama via job `claude-review` com:
  - `needs: [changes, static-api, static-web]`
  - `if: github.event_name == 'pull_request' && !github.event.pull_request.draft && !failure() && !cancelled() && (api || web)`
  - `secrets: inherit`
  - permissões no job chamador: `contents: read`, `pull-requests: write`, `id-token: write`
- Resultado: a revisão profunda só roda depois que lint e typecheck dos escopos afetados passarem, e nunca roda para PRs só de docs (mantém o comportamento atual).
- O `ci.yml` passa a ouvir `pull_request: types: [opened, synchronize, reopened, ready_for_review]`, para preservar o gatilho de "draft → pronto" que o `claude.yml` tem hoje.
- Prompt, `--allowedTools`, `--max-turns 20` e o `git diff` com exclusões ficam inalterados.

### Docs lint
- Job `docs-lint` (se `docs == 'true'`): só `actions/setup-node`, sem `pnpm install`. Roda `npx markdownlint-cli2@<versão fixa>` apenas nos `.md` alterados (lista vinda do `dorny/paths-filter` com `list-files: shell`).
- Novo `.markdownlint-cli2.jsonc` na raiz, tolerante ao estilo atual (ex.: `MD013` linha longa off, `MD024` `siblings_only`). Antes de fixar as regras, o lint roda nos `plan/*.md` e guidelines atuais para calibrar.

### Documentação
- `.github/ai-guidelines/development-workflow.md`, seção PR validation: reescrever com a matriz acima, os estágios, o `ci-gate` como required check, a regra fail-closed (D3), a suíte completa em `main` (D2), a revisão do Claude condicionada ao estágio 1 e o cache do Playwright. Também corrigir a afirmação desatualizada sobre o escopo do Lighthouse.
- `CLAUDE.md` (hub): no máximo uma linha apontando a regra de escopo do CI. Os detalhes ficam na spoke.

## Arquivos
- `.github/workflows/ci.yml` — reescrito
- `.github/workflows/lighthouse.yml` — vira reutilizável
- `.github/workflows/claude.yml` — vira reutilizável
- `.github/actions/setup-workspace/action.yml` — novo
- `.markdownlint-cli2.jsonc` — novo
- `.github/ai-guidelines/development-workflow.md` — seção PR validation
- `plan/OtimizacaoPipelineCI.md` — este plano
- Sem mudança: `security.yml`, `playwright.config.ts`, `package.json`, configs de TS/oxlint

## Commits (Conventional Commits, escopo root)
1. `docs(root): add CI pipeline optimization plan`
2. `ci(root): add shared setup-workspace composite action`
3. `ci(root): gate CI jobs by affected scope with fail-fast stages`
4. `ci(root): cache Playwright browsers in e2e-web`
5. `ci(root): run lighthouse and claude review as staged reusable workflows`
6. `ci(root): lint changed markdown files`
7. `docs(root): document the dynamic CI condition matrix`

## Verificação
- **Estática:** `actionlint` (via `docker run rhysd/actionlint`) em todos os workflows, com zero erros.
- **Matriz:** abrir um PR draft do branch `ci/otimizacao-pipeline` e, com commits de teste, conferir pelo summary do `changes` e pela lista de jobs:
  - commit só em `apps/api/**`: só a trilha API roda, nada de web, Lighthouse ou Playwright;
  - commit só em `apps/web/**`: só a trilha web + Lighthouse, sem e2e-api;
  - commit só em `plan/*.md`: só docs-lint;
  - commit em `package.json`: tudo roda. (O próprio PR toca em `.github/workflows/**`, então o primeiro run já é a suíte completa e serve como regressão geral.)
- **Fail-fast:** commit com um erro de lint proposital na API → `static-api` falha, estágios 2 e 3 e `claude-review` ficam skipped, `ci-gate` vermelho. Depois reverter.
- **Cache:** comparar a duração do `e2e-web` no 1º run (miss) e no 2º (hit) e reportar o ganho real.
- **Sem regressão:** na suíte completa, os mesmos testes passam, as asserções do Lighthouse continuam iguais e o `security.yml` continua rodando.
- Remover os commits de teste antes do merge e entregar o relatório de execução com tempos antes/depois.

## Pontos em aberto (levantados na revisão do plano)
1. **Required checks atuais.** Se a proteção de branch da `main` exige jobs pelo nome (ex.: `lint`, `e2e-web`), renomear ou dividir esses jobs trava o merge do próprio PR, porque esses checks nunca vão reportar. Falta um passo: trocar a proteção de branch para o `ci-gate` no momento certo. É uma ação manual nas configurações do GitHub.
2. **O docs-lint bloqueia código.** Do jeito que está, os estágios 2 e 3 dependem de todo o estágio 1, então um erro de estilo num `.md` alterado aborta os testes da API e da web. Proposta: tirar o `docs-lint` dos `needs` dos estágios 2 e 3 e deixar só o `ci-gate` depender dele. O PR continua vermelho, mas os testes rodam.
3. **Concurrency.** Chamado pelo `ci.yml`, o `claude.yml` herda o `cancel-in-progress` dele. Um push novo no PR cancela uma revisão já em andamento, e os tokens gastos nela se perdem. É uma mudança de comportamento em relação a hoje.
4. **`ready_for_review` no `ci.yml`.** Tirar um PR de draft passa a rodar a suíte inteira de novo, não só a revisão do Claude. O custo é pequeno.
5. **Ganho do cache do Playwright.** Como o apt continua rodando, o realista é economizar só o download do Chromium. O tempo de setup não deve cair muito abaixo dos ~10 min.
