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

---

## 📝 Descrição

<!-- Descreva o que este PR faz e por quê. Contexto, problema resolvido e
     decisões relevantes. -->

## 🏷️ Tipo de Mudança

<!-- Marque com um "x" o que se aplica. -->

- [ ] 🐛 Correção de bug (`fix`)
- [ ] ✨ Nova funcionalidade (`feat`)
- [ ] ♻️ Refatoração (`refactor`) — sem mudança de comportamento
- [ ] ⚡ Performance (`perf`)
- [ ] 📝 Documentação (`docs`)
- [ ] ✅ Testes (`test`)
- [ ] 🔧 Build / CI / infra (`build`, `ci`, `chore`)
- [ ] 💥 Breaking change (quebra compatibilidade)

## 🧪 Como Testar

<!-- Passos para validar localmente. Ex.: comandos, rotas, dados de exemplo. -->

1.
2.
3.

```bash
# Comandos relevantes (ajuste conforme o escopo):
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
```

## 🏛️ Impacto Arquitetural

<!-- Este PR introduz ou altera: novos módulos/camadas, contratos de API,
     modelo de dados (Prisma), dependências, fluxo de autenticação/segurança,
     componentes de UI compartilhados? Descreva o impacto. Escreva "Nenhum"
     se não houver. -->

## ✅ Definition of Done (DoD)

### Qualidade
- [ ] `pnpm lint` e `pnpm typecheck` passam sem erros.
- [ ] Testes adicionados/atualizados para o que foi alterado e todos passam.
- [ ] Commits seguem Conventional Commits.

### 📚 Documentação como Código (obrigatório)
- [ ] Minhas alterações introduziram ou alteraram conceitos, ferramentas ou regras de arquitetura/segurança/UI/QA.
- [ ] Se SIM, eu atualizei/criei o arquivo correspondente na pasta `/docs/wiki` e verifiquei se a Home/Índice continua correta.
- [ ] Garanti que os links de rastreabilidade entre a teoria na Wiki e o código novo estão apontando para os arquivos certos.

### Exceção — Escape Hatch (`skip-wiki`)
<!-- Marque APENAS se esta mudança comprovadamente NÃO exige documentação na Wiki
     (ex.: ajuste de formatação, bump trivial de dependência, correção de typo).
     Justifique na Descrição. Marcar este checkbox (deixando a string "[x] skip-wiki")
     OU aplicar a label `skip-wiki` ao PR faz o check de sincronia da Wiki passar. -->
- [ ] skip-wiki — esta mudança **não requer** atualização da Wiki (justificativa na Descrição).
