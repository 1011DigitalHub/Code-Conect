# Plano: Governanca e Security By Design — Revisao Final

## Contexto

O projeto Code-Conect ja possui uma base robusta de seguranca (cookie-based JWT, CSRF double-submit, fail-closed AuthGuard, scrypt, rate limiting, CSP/HSTS/helmet) e governanca (3 templates de issue, PR template com DoD, wiki-check no CI, todo-to-issue, Conventional Commits, planos em `plan/`).

Porem, duas lacunas criticas foram identificadas na auditoria DevSecOps:

1. **Security By Design nao e um gate formal nos planos** — ha mencoes esparsas a "security cases" e "DevSecOps compliance" em `development-workflow.md`, mas nao existe uma secao obrigatoria e estruturada que force o autor a considerar ameacas ANTES de escrever codigo.

2. **PRs podem ser abertos sem issue vinculada** — o PR template sugere `Closes #N` como comentario, mas nao ha enforcement no CI. Mudancas sem rastreabilidade de Change Management podem entrar no codebase.

**Lacunas adicionais:** ausencia de `CODEOWNERS` para paths criticos de seguranca e ausencia de governanca formal sobre o uso de escape hatches.

---

## Alteracao 1 — Secao obrigatoria `## Security By Design` nos planos

**Arquivo:** `.github/ai-guidelines/development-workflow.md`

**Onde:** Novo bullet na secao "Execution plans" (apos a regra do Wiki na linha 32, antes de "## PR validation" na linha 34).

**Conteudo a inserir:**

```markdown
- Every plan must include a **`## Security By Design`** section placed **before the implementation steps**. This section is mandatory — a plan without it is incomplete and will not be approved. It must contain the following checklist, with every item answered explicitly (never left blank):
  1. **Autenticacao:** Does this change affect login, session, token lifecycle, or `@Public()` routes? If adding a new `@Public()` route, justify why it must be unauthenticated.
  2. **Autorizacao / BOLA:** Does any new endpoint accept a `:id` param? If yes, describe the ownership check (`where: { id, authorId: actor.sub }`) and the e2e case proving user A cannot reach user B's resource. Reference the BOLA/IDOR pattern in `security-standards.md`.
  3. **Validacao de entrada:** List every new DTO or param. Confirm that `ValidationPipe` with `whitelist`/`forbidNonWhitelisted` covers them and that no field allows mass assignment (`id`, `role`, `passwordHash`).
  4. **Exposicao de dados:** What data does the response return? Confirm it uses a response DTO or entity (never raw database records). Confirm no password hash, internal id, or PII is leaked.
  5. **CSRF:** Does this add or modify an unsafe method (`POST`/`PUT`/`PATCH`/`DELETE`)? If yes, confirm that `CsrfGuard` covers it. If it needs `@NoCsrf()`, justify why.
  6. **Rate limiting:** Does this endpoint need a custom `@Throttle()` override? Reference the existing tiers (100/min global, 5/min login, 3/min signup) and justify the chosen limit.
  7. **Gestao de segredos:** Does this change introduce new environment variables or secrets? If yes, confirm they are validated in `src/env.ts` at boot, listed in `.env.example`, and never committed to git.
  8. **Risco de dependencias:** Does this change add a new dependency? If yes, confirm `pnpm audit` passes and the package is from a known, maintained source. For security-critical deps (crypto, auth), justify the choice.
  - If the change has **zero security impact** (e.g., a pure UI layout change, a docs-only update, a CSS tweak), write `Sem impacto de seguranca — <motivo em uma linha>` explicitly. An **empty Security By Design section is never acceptable**.
```

**Tambem atualizar** a linha 23 (descricao da estrutura canonica):

De: `Plans follow the structure of plan/PaginaLogin.md: context, implementation steps, tests, commits and verification.`

Para: `Plans follow the structure of plan/PaginaLogin.md: context, **security by design**, implementation steps, tests, commits, **wiki** and verification.`

---

## Alteracao 2 — Regra integrada no `.claude/rules/devsecops-planning.md`

**Arquivo:** `.claude/rules/devsecops-planning.md`

Adicionar regra 5 integrada a estrutura existente (frontmatter YAML `paths:` permanece inalterado — a regra ja se aplica a `plan/*.md`). Inserir apos o item 4:

```markdown
5. **Security By Design Gate:** Every execution plan (`plan/*.md`) must contain a `## Security By Design` section placed before the implementation steps, with all 8 checklist items from `development-workflow.md` § "Execution plans" answered explicitly. The items are: (1) Autenticacao, (2) Autorizacao/BOLA, (3) Validacao de entrada, (4) Exposicao de dados, (5) CSRF, (6) Rate limiting, (7) Gestao de segredos, (8) Risco de dependencias. A plan missing this section, or with any item left blank, is a blocker — do not proceed to implementation. The only acceptable exemption is `Sem impacto de seguranca — <motivo>` when the change has genuinely zero security surface.
```

O frontmatter existente ja cobre o path `plan/*.md`, entao nenhuma alteracao no bloco `paths:` e necessaria — a regra 5 herda o mesmo escopo de ativacao das regras 1-4.

---

## Alteracao 3 — Exemplo retroativo no plano canonico

**Arquivo:** `plan/PaginaLogin.md`

Inserir secao `## Security By Design` entre "## Contexto" (fim na linha ~17) e "## 1. Test runner" (linha 18). Conteudo:

```markdown
## Security By Design

> **Nota retroativa (2026-10-21):** secao adicionada ao aplicar o plano `GovernancaSecurityByDesign.md`, que tornou a secao Security By Design obrigatoria em todos os planos.

1. **Autenticacao:** Nao afeta — a pagina de login chama `POST /auth/login`, que ja existe e esta protegida. Nenhuma rota `@Public()` nova.
2. **Autorizacao / BOLA:** Nao ha parametro `:id`. Sem risco.
3. **Validacao de entrada:** `LoginDto` ja tem `@IsEmail()`, `@MinLength(8)`, `@MaxLength(72)`. Nenhum DTO novo.
4. **Exposicao de dados:** A resposta de login retorna `{ tokenType, expiresIn }` — sem token, hash ou PII.
5. **CSRF:** `POST /auth/login` ja esta coberto pelo `CsrfGuard` global.
6. **Rate limiting:** Login tem `@Throttle(5/min)` existente. Sem alteracao.
7. **Gestao de segredos:** Nenhuma variavel nova.
8. **Risco de dependencias:** Nenhuma dependencia nova.
```

---

## Alteracao 4 — Job `issue-check` no CI (regex endurecida)

**Arquivo:** `.github/workflows/ci.yml`

### 4a. Trigger types (linha 9)

De:
```yaml
types: [opened, synchronize, reopened, ready_for_review]
```

Para:
```yaml
types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
```

Justificativa: `labeled`/`unlabeled` permite reavaliar os escape hatches quando uma label e adicionada/removida. `edited` e deliberadamente excluido para nao re-disparar jobs caros (e2e, lighthouse). O `dorny/paths-filter` reporta "sem mudancas" em eventos de label, entao apenas `wiki-check` e `issue-check` executam.

### 4b. Novo job `issue-check` (inserir entre `wiki-check` e `claude-review`, apos linha 270)

```yaml
  # ── Issue gate (Change Management) ────────────────────────────────────────────
  # Every PR must reference a documented issue via formal GitHub closing keywords
  # (Closes/Fixes/Resolves #N). Bare #N references are NOT accepted — Change
  # Management requires auditable auto-close traceability.
  # Escape hatches: label `skip-issue` or `[x] skip-issue` in the PR body.
  # GOVERNANCE: escape hatches require formal Owner/DevSecOps review (CODEOWNERS).
  issue-check:
    needs: [changes]
    if: ${{ github.event_name == 'pull_request' && !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - name: Verify PR references a documented issue
        env:
          LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          set -euo pipefail

          # Escape hatch 1: label `skip-issue`.
          if printf ',%s,' "$LABELS" | grep -q ',skip-issue,'; then
            echo "::warning::Escape hatch via label 'skip-issue' — requer aprovacao formal do Code Owner (@1011DigitalHub) antes do merge."
            exit 0
          fi
          # Escape hatch 2: checkbox `[x] skip-issue` in the PR body.
          if printf '%s' "$PR_BODY" | grep -qiE '\[x\][[:space:]]*skip-issue'; then
            echo "::warning::Escape hatch via '[x] skip-issue' — requer aprovacao formal do Code Owner (@1011DigitalHub) antes do merge."
            exit 0
          fi

          # Strict regex: only formal GitHub closing keywords are accepted.
          # Closes/Close/Closed #N, Fixes/Fix/Fixed #N, Resolves/Resolve/Resolved #N.
          # Case-insensitive. Bare #N references do NOT pass.
          ISSUE_RE='(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+'

          if printf '%s' "$PR_BODY" | grep -qiE "$ISSUE_RE"; then
            echo "Issue reference found (formal closing keyword). Check passed."
            exit 0
          fi

          echo "::error::Este PR nao referencia nenhuma issue com palavra-chave formal de fechamento. Use 'Closes #N', 'Fixes #N' ou 'Resolves #N' no corpo do PR. Referencias soltas (#N) nao sao aceitas — Change Management exige rastreabilidade auditavel. Para PRs de infra/CI sem issue, aplique a label 'skip-issue' (requer aprovacao do Code Owner)."
          exit 1
```

**Design decisions (regex endurecida):**
- **Apenas keywords formais do GitHub:** `Closes/Close/Closed`, `Fixes/Fix/Fixed`, `Resolves/Resolve/Resolved` seguidas de `#N`. Isso garante que o merge fecha automaticamente a issue — rastreabilidade auditavel.
- **Bare `#N` rejeitado:** uma referencia solta como "See #42" ou "Ref #42" nao constitui vinculo formal de Change Management.
- **Busca apenas no `PR_BODY`:** as keywords de auto-close do GitHub so funcionam no corpo do PR, nao no titulo. Alinhar o check com o comportamento real da plataforma.
- **Sem checkout:** le apenas metadata do PR — execucao em <5 segundos.
- **Warnings nos escape hatches:** deixam claro que a aprovacao do Code Owner e obrigatoria.

### 4c. Adicionar `issue-check` ao `ci-gate` (linhas 576-643)

No array `needs`:
```yaml
  ci-gate:
    needs:
      - changes
      - static-api
      - static-web
      - static-quality
      - docs-lint
      - wiki-check
      - issue-check        # NOVO
      - claude-review
      - unit-api
      - component-web
      - e2e-api
      - e2e-web
      - lighthouse
      - bundlemon
      - dast-api
```

No bloco `env`:
```yaml
          ISSUE_CHECK:    ${{ needs.issue-check.result }}
```

No `declare -A jobs`:
```bash
          [issue-check]="$ISSUE_CHECK"
```

---

## Alteracao 5 — PR template com secao Issue obrigatoria

**Arquivo:** `.github/pull_request_template.md`

Inserir nova secao `## Issue` NO TOPO do template (antes da secao Descricao). Remover o comentario redundante `Closes #123` da secao Descricao existente.

```markdown
## 🔗 Issue

<!-- OBRIGATORIO: referencie a issue que este PR resolve usando uma
     palavra-chave formal de fechamento do GitHub.
     Use: Closes #N, Fixes #N ou Resolves #N.
     O CI (job issue-check) bloqueia PRs sem esta referencia. -->

Closes #

### Excecao — Escape Hatch (`skip-issue`)
<!-- Marque APENAS se este PR e uma mudanca de infraestrutura/CI que
     comprovadamente NAO requer uma issue documentada.
     ATENCAO: o uso deste escape hatch requer aprovacao formal do
     Code Owner (@1011DigitalHub) antes do merge (CODEOWNERS). -->
- [ ] skip-issue — este PR **nao requer** uma issue vinculada (justificativa na Descricao).
```

---

## Alteracao 6 — CONTRIBUTING.md atualizado

**Arquivo:** `CONTRIBUTING.md`

Nova subsecao apos "Linkando Pull Requests a Issues" (apos linha 68):

```markdown
### Obrigatoriedade da Referencia a Issues (Change Management)

**Todo PR deve referenciar uma issue documentada** usando uma palavra-chave formal de fechamento do GitHub (`Closes #N`, `Fixes #N` ou `Resolves #N`) no corpo do PR. O CI (job `issue-check` no `ci.yml`) verifica automaticamente e bloqueia PRs sem referencia formal. Referencias soltas (`#N`) nao sao aceitas.

**Escape hatch:** Para PRs de infraestrutura ou CI que genuinamente nao requerem uma issue (ex.: bump trivial de dependencia, ajuste de formatacao de workflow), use uma das opcoes:
- Aplique a label **`skip-issue`** ao PR, **ou**
- Marque o checkbox **`[x] skip-issue`** no corpo do PR.

**Governanca:** O uso de qualquer escape hatch (`skip-issue` ou `skip-wiki`) requer **aprovacao formal do Code Owner** (`@1011DigitalHub`) antes do merge. Esta regra e aplicada via `CODEOWNERS` + branch protection com "Require review from Code Owners".
```

---

## Alteracao 7 — CODEOWNERS com governanca de escape hatches

**Arquivo novo:** `.github/CODEOWNERS`

```
# ─────────────────────────────────────────────────────────────────────
# Code-Conect CODEOWNERS
# ─────────────────────────────────────────────────────────────────────
# Branch protection must have "Require review from Code Owners" enabled.
# This ensures that:
#   1. Security-critical paths require Owner review on every PR.
#   2. Escape hatches (skip-issue, skip-wiki) require Owner approval
#      to merge — the PR passes CI but cannot merge without review.
# ─────────────────────────────────────────────────────────────────────

# ── Security-critical application code ──────────────────────────────
apps/api/src/auth/                          @1011DigitalHub
apps/api/src/env.ts                         @1011DigitalHub
apps/api/src/cors.ts                        @1011DigitalHub
apps/api/src/common/login-throttler.guard.ts @1011DigitalHub

# ── Governance and security configuration ───────────────────────────
.github/workflows/                          @1011DigitalHub
.github/ai-guidelines/security-standards.md @1011DigitalHub
.github/CODEOWNERS                          @1011DigitalHub
.claude/                                    @1011DigitalHub
SECURITY.md                                 @1011DigitalHub
CLAUDE.md                                   @1011DigitalHub

# ── Catch-all: all other files ──────────────────────────────────────
# In a single-maintainer project, this ensures every PR requires
# Owner review — including PRs that use escape hatches. When the
# team grows, replace with team-based ownership per module.
*                                           @1011DigitalHub
```

**Governanca dos escape hatches:** Com `* @1011DigitalHub` como catch-all + "Require review from Code Owners" habilitado no branch protection, **todo PR** (incluindo os que usam `skip-issue` ou `skip-wiki`) requer aprovacao formal do Owner para mergear. O CI pode passar, mas o merge fica bloqueado ate a review ser aprovada. Isso implementa o controle pedido: escape hatches existem para flexibilidade, mas nao dispensam supervisao.

**Passo manual obrigatorio:** Ativar "Require review from Code Owners" nas branch protection rules de `main` no GitHub. Sem isso, o CODEOWNERS e apenas documentacao.

---

## Alteracao 8 — Label `skip-issue`

Criar a label no GitHub ANTES de mergear as mudancas de CI:

```bash
gh label create skip-issue \
  --description "PR does not require a linked issue (requires Code Owner approval)" \
  --color "d4c5f9"
```

---

## Wiki

**Arquivo:** `docs/wiki/governanca-workflow.md`

Adicionar duas novas subsecoes na area "Aplicacao no Code Connect":

### Subsecao: "Controle de Mudancas: Issue Obrigatoria em PRs"
- Documentar o job `issue-check` e sua regex estrita (apenas keywords formais)
- Explicar os escape hatches (`skip-issue` label e checkbox)
- Explicar a governanca: escape hatches requerem Code Owner approval (CODEOWNERS)
- Incluir diagrama de fluxo similar ao do `validate-wiki.yml`

### Subsecao: "Security By Design nos Planos de Execucao"
- Documentar a secao obrigatoria `## Security By Design` com os 8 itens
- Explicar o escape para mudancas sem impacto
- Referenciar `plan/PaginaLogin.md` como exemplo canonico

### Tabela de rastreabilidade
Adicionar entradas:
- Job `issue-check` (regex estrita, escape hatches) → `.github/workflows/ci.yml`
- Regra Security By Design Gate → `.claude/rules/devsecops-planning.md` regra 5
- CODEOWNERS com catch-all → `.github/CODEOWNERS`
- Secao Security By Design no template de plano → `.github/ai-guidelines/development-workflow.md`

---

## Arquivos Modificados

| # | Arquivo | Acao | Descricao |
|---|---------|------|-----------|
| 1 | `.github/ai-guidelines/development-workflow.md` | Editar | Secao `## Security By Design` obrigatoria (8 itens) + estrutura canonica atualizada |
| 2 | `.claude/rules/devsecops-planning.md` | Editar | Regra 5 integrada ao frontmatter existente: Security By Design Gate |
| 3 | `plan/PaginaLogin.md` | Editar | Exemplo retroativo da secao Security By Design preenchida |
| 4 | `.github/workflows/ci.yml` | Editar | Job `issue-check` (regex estrita) + ci-gate + trigger types |
| 5 | `.github/pull_request_template.md` | Editar | Secao `## Issue` com escape hatch governado |
| 6 | `CONTRIBUTING.md` | Editar | Subsecao obrigatoriedade de issue + governanca de escape hatches |
| 7 | `.github/CODEOWNERS` | Criar | Ownership para paths de seguranca + catch-all para governanca de escape hatches |
| 8 | `docs/wiki/governanca-workflow.md` | Editar | Documentar issue-check, Security By Design e CODEOWNERS |

---

## Commits Previstos

```
docs(root): add mandatory Security By Design section to execution plan template
ci(root): add issue-check job with strict closing-keyword regex
chore(root): add CODEOWNERS with catch-all for escape hatch governance
docs(root): update PR template and CONTRIBUTING with mandatory issue linking
docs(wiki): document issue-check gate and Security By Design in governance page
```

---

## Verificacao

1. `pnpm lint` e `pnpm typecheck` passam (mudancas sao apenas docs/CI/config)
2. Abrir PR de teste SEM referencia formal a issue → `issue-check` falha
3. Adicionar `Ref #42` (referencia solta) → `issue-check` continua falhando (regex estrita)
4. Adicionar `Closes #42` → `issue-check` passa
5. Remover `Closes #42`, adicionar label `skip-issue` → `issue-check` passa com warning de governanca
6. Verificar que `ci-gate` inclui `issue-check` no output de jobs
7. Confirmar que eventos `labeled`/`unlabeled` NAO re-disparam jobs caros
8. Criar um plano de teste sem `## Security By Design` → Claude Code deve rejeitar (regra 5)
9. Verificar CODEOWNERS: PR sem review aprovada do Owner nao pode mergear (requer config manual de branch protection)
10. `markdownlint` passa nos MDs alterados

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Regex estrita bloqueia PRs com formato ligeiramente diferente | Mensagem de erro clara com exemplos aceitos; label `skip-issue` como escape |
| `labeled`/`unlabeled` re-dispara jobs caros | `dorny/paths-filter` reporta "sem mudancas" → scope detection pula todos exceto governance checks |
| Escape hatch bypass sem Owner review | CODEOWNERS catch-all `*` + "Require review from Code Owners" = merge bloqueado fisicamente |
| Overhead do Security By Design em planos triviais | Escape clause "Sem impacto" mantendo analise consciente |
| CODEOWNERS catch-all exige self-review em projeto solo | GitHub permite self-review; quando segundo membro chegar, dividir ownership |
| PRs existentes bloqueados retroativamente | Label `skip-issue` criada antes do merge do CI; PRs abertos podem usa-la |
