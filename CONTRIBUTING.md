# Guia de Contribuição

Bem-vindo ao Code Connect! Este documento explica como reportar problemas, sugerir funcionalidades, registrar débitos técnicos e contribuir com código.

## Abrindo Issues

Sempre use um dos templates disponíveis ao abrir uma issue. Blank issues estão desabilitadas.

### Bug Report
Use o template **"Relatório de Bug"** para reportar comportamentos inesperados. O template pede:
- Passos para reproduzir
- Comportamento esperado vs atual
- Ambiente (SO, browser, Node)
- Logs / screenshots

Labels aplicadas automaticamente: `bug`, `prio:medium`

### Feature Request
Use o template **"Solicitação de Funcionalidade"** para propor novas funcionalidades. O template pede:
- Problema ou necessidade que a feature resolve
- Solução proposta
- Alternativas consideradas

Labels aplicadas automaticamente: `feature`, `prio:medium`

### Débito Técnico
Use o template **"Débito Técnico"** para registrar refatorações, código acoplado, melhorias de arquitetura ou itens do tipo "devemos arrumar isso depois". O template pede:
- Área afetada (API / Web / Infra / CI)
- O que está ruim hoje e o impacto de não resolver
- A melhoria proposta e os arquivos envolvidos

Labels aplicadas automaticamente: `refactor`, `prio:low`

---

## TODOs no Código

Ao deixar um marcador no código, use o formato padrão seguido de dois-pontos:

```ts
// TODO: descrever a tarefa pendente
// FIXME: descrever o problema a corrigir
```

A cada push na branch `main`, o workflow **TODO → Issue** (`.github/workflows/todo-to-issue.yml`) varre o código em busca desses marcadores e cria automaticamente uma GitHub Issue com label `refactor` para cada um. Quando o marcador é removido do código (tarefa concluída), a issue é fechada automaticamente.

Para varrer os TODOs localmente antes de fazer push:

```bash
pnpm find-todos
```

---

## Linkando Pull Requests a Issues

Ao abrir um PR que resolve uma issue, use palavras-chave no campo **Descrição** para fechar a issue automaticamente ao fazer merge:

```
Closes #12
Fixes #34
Resolves #56
```

Múltiplas issues podem ser linkadas no mesmo PR:

```
Closes #12, Closes #15
```

### Obrigatoriedade da Referencia a Issues (Change Management)

**Todo PR deve referenciar uma issue documentada** usando uma palavra-chave formal de fechamento do GitHub (`Closes #N`, `Fixes #N` ou `Resolves #N`) no corpo do PR. O CI (job `issue-check` no `ci.yml`) verifica automaticamente e bloqueia PRs sem referencia formal. Referencias soltas (`#N`) nao sao aceitas.

**Escape hatch:** Para PRs de infraestrutura ou CI que genuinamente nao requerem uma issue (ex.: bump trivial de dependencia, ajuste de formatacao de workflow), use uma das opcoes:
- Aplique a label **`skip-issue`** ao PR, **ou**
- Marque o checkbox **`[x] skip-issue`** no corpo do PR.

**Governanca:** O uso de qualquer escape hatch (`skip-issue` ou `skip-wiki`) requer **aprovacao formal do Code Owner** (`@1011DigitalHub`) antes do merge. Esta regra e aplicada via `CODEOWNERS` + branch protection com "Require review from Code Owners".

---

## Commits

Este projeto segue o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <descrição imperativa, minúscula, sem ponto final>
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudança de comportamento |
| `test` | Adição ou correção de testes |
| `docs` | Documentação apenas |
| `ci` | Mudanças em workflows / CI |
| `chore` | Ajustes de build, deps, configuração |

Exemplos:
```
feat(api): add social login with Google OIDC
fix(web): correct focus trap in modal dialog
refactor(api): extract slug generation to shared utility
```

Veja mais detalhes em [`.github/ai-guidelines/development-workflow.md`](.github/ai-guidelines/development-workflow.md).

---

## Documentação como Código

Toda mudança que introduz ou altera conceitos, ferramentas ou regras de arquitetura/segurança/UI deve ser acompanhada de atualização na pasta `docs/wiki/`. O CI valida isso via `validate-wiki.yml`. Se a mudança genuinamente não requer documentação, marque `skip-wiki` no PR ou aplique a label correspondente.
