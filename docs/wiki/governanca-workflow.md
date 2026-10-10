# Governanca: Workflow de PR, Wiki e CI

> **Publico-alvo:** analistas juniores / trainees.

---

## Conceito Teorico

### Documentacao como Codigo: por que a wiki nao e opcional

Em projetos de software, e comum que a documentacao fique desatualizada rapidamente. O codigo evolui, decisoes mudam, e o texto que explicava "por que fizemos assim" fica referenciando arquivos que ja foram renomeados ou regras que ja foram revogadas.

A pratica **Documentacao como Codigo** trata a documentacao com o mesmo rigor do codigo: ela faz parte do PR, passa por revisao, e nao pode ser ignorada sem uma justificativa explicita. A ideia e simples:

> Se o codigo mudou e a explicacao nao mudou, a explicacao esta errada.

No Code Connect isso e implementado como uma **politica de CI que bloqueia merges**: um workflow de GitHub Actions detecta PRs que alteram codigo sem atualizar a wiki, posta um comentario pedindo correcao e falha o check. O PR so pode ser mergeado depois que a documentacao for atualizada — ou depois que o autor explicar que a mudanca e trivial e nao precisa de documentacao.

### O que sao Conventional Commits?

**Conventional Commits** e uma convencao de mensagem de commit que facilita automacao (geracao de changelogs, versionamento semantico) e leitura do historico.

O formato basico e:
```
<tipo>(<escopo>): <descricao>

[corpo opcional]

[rodape opcional]
```

Os tipos indicam a natureza da mudanca:
- `feat` — nova funcionalidade
- `fix` — correcao de bug
- `docs` — documentacao
- `refactor` — refatoracao sem mudanca de comportamento
- `test` — adicionando ou ajustando testes
- `ci`, `build`, `chore` — CI, build, tarefas de manutencao

A convencao permite que ferramentas gerem changelogs automaticamente e que qualquer desenvolvedor leia o historico sem precisar abrir cada commit para entender o que mudou.

### O que e um Pipeline de CI?

**CI (Continuous Integration)** e a pratica de integrar as mudancas de codigo frequentemente ao repositorio principal, com verificacoes automaticas a cada integracao.

No Github Actions, cada workflow e um arquivo YAML em `.github/workflows/`. Cada arquivo define quando ele roda (`on:`), as permissoes necessarias e os jobs a executar. Um job falha (exit code != 0) → o check fica vermelho → o PR nao pode ser mergeado (se a branch protection exigir aquele check).

---

## Aplicacao no Code Connect

### Os 5 workflows de CI

O projeto tem cinco workflows, cada um com escopo e responsabilidade distintos:

#### 1. `ci.yml` — O gate principal

Roda em **todo push e todo PR**, sem filtro de caminho. E o workflow mais importante porque:
- Nao ha como pular por "so alterei docs" ou "so alterei config"
- Tem tres jobs paralelos:

| Job | O que faz | Precisa de banco? |
|-----|-----------|-------------------|
| `quality` | `pnpm lint`, `pnpm typecheck`, `pnpm test:api`, `pnpm test:web` | Nao |
| `e2e-api` | `pnpm test:api:e2e` com container PostgreSQL | Sim (service container) |
| `e2e-web` | `pnpm test:web:a11y` contra o build de producao | Sim (service container) |

O job `e2e-web` tem um timeout de 25 minutos (linha 109 do ci.yml). Isso porque o `playwright install --with-deps` baixa bibliotecas de sistema do browser, o que pode levar ate ~10 minutos em um runner frio. Sem timeout, um travamento no teardown esperaria ate o limite padrao de 6 horas do GitHub Actions.

Um detalhe importante: o job `e2e-web` deliberadamente **nao define `NODE_ENV`** no nivel do job. Se definisse, o `vite build` geraria o bundle de desenvolvimento (576 kB vs 347 kB de producao) — a suite auditaria algo que os usuarios nunca recebem.

#### 2. `security.yml` — Seguranca em tres frentes

Tambem sem filtro de caminho. Tres jobs independentes:

- **`secrets`** — TruffleHog OSS com `fetch-depth: 0` (clone completo do historico). Um segredo pode ter sido commitado e depois removido antes do PR ser aberto; um clone raso nunca veria o commit onde vazou.
- **`sast`** — Semgrep OSS com os rulesets `p/typescript`, `p/nodejs`, `p/react` e `p/secrets`. Analise estatica buscando padroes de vulnerabilidade conhecidos.
- **`dependency-audit`** — `pnpm audit --audit-level=high`. Falha se alguma dependencia direta ou transitiva tiver uma vulnerabilidade de severidade `high` ou `critical` no banco de dados do npm.

#### 3. `lighthouse.yml` — Performance, acessibilidade e SEO

Escopo filtrado: so roda quando `apps/web/**` e alterado (ou o lockfile, ou o proprio workflow). Mede scores do Lighthouse no build de producao — performance, acessibilidade e SEO. Nao roda em PRs que so alteram a API.

#### 4. `claude.yml` — Revisao automatica de codigo

Escopo filtrado: `apps/api/**` e `apps/web/**`. O Claude Code GitHub Action revisa o diff do PR e posta findings como comentario. Nao roda para PRs que so alteram `plan/`, `CLAUDE.md` ou configuracao na raiz.

#### 5. `validate-wiki.yml` — Documentacao como Codigo

Descrito em detalhe abaixo.

### O workflow `validate-wiki.yml`: como funciona o gate de documentacao

O workflow roda em todo PR para `main`, `master` ou `develop`. Logica:

```
PR aberto/atualizado
    │
    ▼
Detecta arquivos alterados no diff (git diff --name-only origin/<base>...HEAD)
    │
    ├── Codigo alterado? (apps/, src/, *.ts, *.tsx, etc. — excluindo docs/ e codigo gerado)
    │
    └── Wiki alterada? (docs/wiki/)
          │
          ├── Codigo SIM, Wiki NAO → verifica escape hatches
          │     ├── Label `skip-wiki` no PR? → passa com warning
          │     ├── `[x] skip-wiki` no corpo do PR? → passa com warning
          │     └── Nenhum dos dois → posta comentario "sticky" + falha o check
          │
          ├── Codigo SIM, Wiki SIM → resolve o comentario anterior (se existia) + passa
          │
          └── Codigo NAO → nao exige nada (refatoracao de plan/, bump de config pura, etc.)
```

O comentario e "sticky": o workflow sempre reutiliza o mesmo comentario (identificado por um marcador HTML `<!-- validate-wiki-bot -->`) em vez de criar um novo a cada push. O PR nao fica poluido com dezenas de comentarios identicos.

### O PR template e o DoD (Definition of Done)

O arquivo `.github/pull_request_template.md` e carregado automaticamente pelo GitHub ao abrir um PR. Ele tem quatro secoes:

1. **Descricao** — o que este PR faz e por que
2. **Tipo de Mudanca** — checkboxes para feat/fix/refactor/docs/etc.
3. **Como Testar** — passos para validar localmente
4. **DoD (Definition of Done)** — a lista de criterios que o PR precisa cumprir

O DoD inclui explicitamente:
- `pnpm lint` e `pnpm typecheck` passam
- Testes adicionados/atualizados
- Commits seguem Conventional Commits
- **Wiki atualizada se conceitos de arquitetura/seguranca/UI/QA foram alterados**

O escape hatch `[x] skip-wiki` aparece no proprio template como um checkbox. Marcado com justificativa na descricao, libera o merge sem atualizar a wiki.

### Planos de execucao em `plan/`

Antes de implementar qualquer funcionalidade de porte, o projeto exige um **plano de execucao** em `plan/` — um arquivo Markdown nomeado em PascalCase e em portugues (ex: `plan/LoginSocial.md`).

O plano tem estrutura padronizada:
- **Contexto** — por que estamos fazendo isso
- **Passos de implementacao** — a sequencia planejada
- **Testes** — que casos precisam ser cobertos
- **Commits** — os commits previstos (seguindo Conventional Commits)
- **Verificacao** — como confirmar que funcionou

Planos para paginas web tambem documentam acessibilidade (casos axe, rotas para `e2e/routes.ts`), performance (LCP, metadados) e SEO. Planos para endpoints de API listam os casos de seguranca (`401`, `403`, posse de recurso).

O plano **nao e deletado depois**: ao fechar a feature, o plano e marcado como concluido com uma nota datada. Se o escopo mudou durante a implementacao, o plano e atualizado com o que mudou e por que.

### `simple-git-hooks` + `lint-staged`: a guarda local antes do push

Configurado em `package.json`. A cada commit que toca `apps/api` ou `apps/web`, o hook executa `pnpm --filter <app> lint` (oxlint) sobre o app modificado. Intencional mente leve — o oxlint `--type-aware` precisa da resolucao completa do projeto, nao de arquivos isolados, entao ele roda sobre o app inteiro, nao so os arquivos staged.

O hook e so uma guarda rapida; a porta definitiva e o CI. A ideia e pegar erros de syntax antes que eles cheguem ao servidor de CI.

### Convencoes importantes que pegam desenvolvedores de surpresa

**ESM no backend:** a API usa `"type": "module"` e `module: nodenext`. Imports relativos *precisam* ter a extensao `.js`, mesmo em arquivos `.ts`:
```typescript
import { UsersService } from './users/users.service.js'; // correto
import { UsersService } from './users/users.service';    // erro em runtime
```

**Vitest, nao Jest:** `describe`, `it`, `expect` estao disponiveis globalmente (`globals: true`) — sem `import { describe } from 'vitest'`. Tests unitarios ficam em `src/` como `*.spec.ts`; tests e2e ficam em `apps/api/test/`.

**`exactOptionalPropertyTypes` desligado no web:** esta configuracao do TypeScript gera seis erros no frontend que nao sao bugs reais — atrito entre props opcionais do React e tipos de estado. Esta deliberadamente desligada. Nao ligue sem medir o impacto primeiro.

**`pnpm typecheck` vs `pnpm build`:** o `build` do backend usa `tsconfig.build.json` que exclui arquivos de teste. O `typecheck` usa o `tsconfig.json` completo, incluindo `*.spec.ts` e `test/`. Faz diferenca quando um erro esta num arquivo de teste.

---

## Erros Comuns e Armadilhas

### 1. Mergear sem atualizar a wiki porque "e so um ajuste"

O gate e automatico. Qualquer alteracao em `*.ts`, `*.tsx`, `*.js` dentro de `apps/` dispara a verificacao. Se voce ajustou um comportamento de autenticacao ou mudou a estrutura de um componente, a wiki precisa refletir isso — mesmo que seja uma linha. Use `[x] skip-wiki` com justificativa quando a mudanca for genuinamente trivial (typo, formatacao, bump de dependencia menor), nao como atalho padrao.

### 2. Esquecer a extensao `.js` nos imports da API

O erro aparece em runtime, nao em compilacao, porque o TypeScript com `module: nodenext` resolve a extensao `.js` como referencia ao arquivo `.ts` correspondente. O lint (`typescript/no-floating-promises`) nao pega isso. Voce ve o erro so quando roda `pnpm start:api` ou `pnpm test:api`.

### 3. Confundir os escopos dos workflows de CI

O `claude.yml` e o `lighthouse.yml` sao filtrados por caminho. Um PR que so altera `plan/` ou `CLAUDE.md` nao dispara nenhum dos dois — sem revisao automatica do Claude, sem Lighthouse. Nao assuma que "CI passou" significa que uma revisao aconteceu. Para esses PRs, rode os comandos manualmente.

### 4. Escrever mensagens de commit no passado ou com periodo final

`add authentication endpoint.` — errado em dois pontos: esta no passado e tem ponto final. O correto e `feat(api): add authentication endpoint` — imperativo, sem ponto, 72 caracteres ou menos. O padrao do Conventional Commits segue o estilo do `git log` — como se o commit estivesse completando a frase "If applied, this commit will...".

### 5. Criar um novo arquivo de plano para cada iteracao

O plano e um documento vivo. Se o escopo mudou na metade da implementacao, adicione uma nota datada no proprio `plan/FeatureName.md` explicando o que mudou e por que. Nao crie `plan/FeatureNameV2.md` — o historico de decisoes e parte do valor do plano.

### 6. Achar que o timeout de 25 minutos no `e2e-web` e margem de erro

O timeout existe porque `playwright install --with-deps` pode levar ate ~10 minutos em um runner frio. O tamanho real da suite e ~2 minutos. Se o job come a bater no timeout com frequencia, investigar o que mudou no setup — nao aumentar o timeout como primeira acao.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Gate principal de CI (lint, typecheck, testes, e2e) | `.github/workflows/ci.yml` | todos os jobs |
| Timeout de 25 min no e2e-web (playwright install) | `.github/workflows/ci.yml` | linha 109 |
| `NODE_ENV` deliberadamente ausente no e2e-web | `.github/workflows/ci.yml` | linha 134 |
| TruffleHog com clone completo (`fetch-depth: 0`) | `.github/workflows/security.yml` | linhas 23-26 |
| Semgrep com rulesets typescript/nodejs/react/secrets | `.github/workflows/security.yml` | linhas 43-47 |
| `pnpm audit --audit-level=high` | `.github/workflows/security.yml` | linha 66 |
| Logica de deteccao de codigo vs wiki (regex) | `.github/workflows/validate-wiki.yml` | linhas 45-58 |
| Escape hatch via label `skip-wiki` | `.github/workflows/validate-wiki.yml` | linhas 73-76 |
| Escape hatch via `[x] skip-wiki` no corpo do PR | `.github/workflows/validate-wiki.yml` | linhas 79-82 |
| Comentario sticky com marcador HTML | `.github/workflows/validate-wiki.yml` | linhas 99-107 |
| PR template com DoD e escape hatch | `.github/pull_request_template.md` | todos |
| Regras de Conventional Commits e escopos | `.github/ai-guidelines/development-workflow.md` | secao "Git: Conventional Commits" |
| Estrutura e obrigatoriedade dos planos de execucao | `.github/ai-guidelines/development-workflow.md` | secao "Execution plans" |
| `simple-git-hooks` + `lint-staged` (hook de commit) | `.github/ai-guidelines/development-workflow.md` | secao "Conventions / gotchas" |
| ESM e extensao `.js` obrigatoria em imports | `.github/ai-guidelines/development-workflow.md` | "API is native ESM" |
| `exactOptionalPropertyTypes` desligado no web | `.github/ai-guidelines/development-workflow.md` | "exactOptionalPropertyTypes" |

---

_Ultima atualizacao: 2026-10-09 | Gerado a partir do codigo-fonte._
