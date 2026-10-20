# Plano: Wiki Obrigatória na Elaboração de Planos

## Contexto

A atualização da wiki está sendo sistematicamente esquecida na fase de elaboração de planos e só sendo lembrada durante os testes ou quando o `wiki-check` do CI bloqueia o PR. Isso cria retrabelho: o plano já está aprovado, a implementação foi feita, e a wiki vira uma "pendência urgente" em vez de uma entrega planejada.

A causa raiz **não é falta de disciplina** — é estrutural. A seção "Execution plans" em `development-workflow.md` descreve a estrutura canônica de um plano como:

> context → implementation steps → tests → commits → verification

**Wiki não existe como seção.** Sem um slot nomeado com requisitos explícitos, a atualização da wiki não tem "momento certo" no fluxo de elaboração e só vira obrigatória quando algo externo (o `wiki-check` do CI) a cobra — tarde demais.

## Diagnóstico estrutural

| Onde está o gap | Por que causa o problema |
|---|---|
| `development-workflow.md` — seção `Execution plans` | Não cita wiki na estrutura de planos; o template de referência (`PaginaLogin.md`) também não tem seção Wiki |
| Nenhum plano existente tem `## Wiki` | Sem exemplo, o comportamento padrão é "esquece" |
| O wiki-gate em `ci.yml` só corre depois de Stage 1 | O bloqueio existe, mas está no momento errado — reativo em vez de preventivo |
| Memória de feedback `feedback-wiki-update-proactive.md` | Não existia; a instrução de "sempre atualizar wiki no mesmo PR" não estava salva como regra estrutural |

## 1. Alterar `development-workflow.md` — tornar Wiki seção obrigatória

Adicionar, na seção `## Execution plans`, logo após a lista de regras gerais:

```
- Every plan must include a **`## Wiki`** section placed **between the commits step and
  the verification step**. This section is mandatory — a plan without it is incomplete
  and will not be approved. It must name:
  - Which wiki page(s) are affected (relative path under `docs/wiki/` or a GitHub wiki
    page name).
  - What content to add, update or remove in each page (new section title + 1-line
    summary of what it covers, modified section + what changes, diagram or table to add).
  - If the change is a **pure infrastructure change with zero user-visible or
    architectural impact** (e.g., a CI timing tweak, a dev-dependency bump), write
    `Sem impacto na wiki — <motivo em uma linha>` explicitly. An **empty Wiki section
    is never acceptable** — it signals the author skipped the analysis, not that there
    is nothing to document.
```

## 2. Atualizar `plan/PaginaLogin.md` (template de referência)

`PaginaLogin.md` é o arquivo citado pelo `development-workflow.md` como a estrutura canônica ("Plans follow the structure of `plan/PaginaLogin.md`"). Adicionar retroativamente uma seção `## Wiki` entre os commits e a verificação, para que qualquer plano novo que use o arquivo como referência veja o padrão correto.

Conteúdo da seção a adicionar:

```markdown
## Wiki

**Página afetada:** `Componentes-e-Design-System` (wiki do repositório)

- Nova seção **"Átomos de Autenticação"** listando `Button`, `Input`, `Label`,
  `Checkbox`, `TextLink`, `Heading` e `Icon` com props principais e variantes.
- Nova seção **"Moléculas de Autenticação"** listando `FormField`, `CheckboxField`,
  `SocialButton` e `TextDivider`.
- Nova seção **"Template `AuthTemplate`"** explicando o padrão de slot `children` /
  `footer` que permite reaproveitar o layout entre Login e Cadastro.
- Tabela de tokens de cor do tema (`--color-page`, `--color-primary`, etc.) mapeados
  para seus hex originais — base para futuros planos de página.
```

## 3. Criar memória de feedback `feedback-wiki-update-proactive.md`

Salvar a regra como feedback persistente para que ela seja aplicada em novas conversas
sem depender de que o usuário repita a instrução.

## 4. Commits

```
docs(wiki): add mandatory Wiki section to plan template in development-workflow
docs(wiki): add retroactive Wiki section to plan/PaginaLogin.md reference plan
```

## Wiki

Sem impacto direto na wiki do projeto — este plano altera o *processo* de elaboração
de planos, não a arquitetura ou as funcionalidades da aplicação. O efeito na wiki será
indireto: todos os planos futuros passarão a incluir suas próprias atualizações de wiki,
produzindo documentação mais completa ao longo do tempo.

## Verificação

- `development-workflow.md` contém a seção Wiki como parte da lista de regras de planos,
  com o exemplo de conteúdo mínimo e a cláusula de "sem impacto" explícita.
- `plan/PaginaLogin.md` contém `## Wiki` entre commits e verificação.
- A memória `feedback-wiki-update-proactive.md` existe em
  `~/.claude/projects/.../memory/` com a regra estrutural correta.
- Um novo plano criado nesta sessão deve instanciar a seção `## Wiki` naturalmente,
  sem precisar de lembrete.
