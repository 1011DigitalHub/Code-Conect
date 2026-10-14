# Plano: Guardrails de Minimalismo para Code-Conect

## Contexto

O projeto tem pipeline de qualidade robusto (testes, SAST, review por IA), mas nenhuma camada que detecte ou bloqueie **codigo duplicado, complexo demais, morto ou desnecessariamente verboso**. O agente de IA pode gerar funcoes redundantes, arquivos imensos ou exports que ninguem usa — e nada no CI avisa. Este plano adiciona barreiras progressivas, da mais simples (ativar regras que ja existem) ate ferramentas dedicadas de analise.

---

## Camada 1 — Regras de complexidade no oxlint (zero deps novas)

O oxlint ja suporta essas regras built-in, mas nenhuma esta ativada. Basta editar os dois `.oxlintrc.json`:

**`apps/api/.oxlintrc.json`** e **`apps/web/.oxlintrc.json`** — adicionar:

```json
"max-lines": ["warn", { "max": 300, "skipBlankLines": true, "skipComments": true }],
"max-lines-per-function": ["warn", { "max": 50, "skipBlankLines": true, "skipComments": true }],
"max-params": ["warn", { "max": 4 }],
"complexity": ["warn", { "max": 15 }]
```

- `max-lines: 300` — arquivo com mais de 300 linhas vira warning
- `max-lines-per-function: 50` — funcao gigante vira warning
- `max-params: 4` — mais de 4 parametros sugere que precisa de um objeto
- `complexity: 15` — complexidade ciclomatica acima de 15 e sinal de refatoracao

Comecam como `warn` para nao quebrar o CI de imediato. Promover a `error` quando o codebase estiver limpo.

---

## Camada 2 — Knip: detectar codigo morto e exports nao usados

**O que e:** Knip escaneia o projeto e reporta arquivos, exports, tipos e dependencias que ninguem importa.

**Instalacao:**
```bash
pnpm add -wD knip
```

**Config:** `knip.config.ts` na raiz:
```ts
export default {
  workspaces: {
    'apps/api': {
      entry: ['src/main.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/generated/**'],
    },
    'apps/web': {
      entry: ['src/main.tsx'],
      project: ['src/**/*.{ts,tsx}'],
    },
  },
}
```

**Scripts no root `package.json`:**
```json
"knip": "knip",
"knip:fix": "knip --fix"
```

**CI:** Step no stage 1 do `ci.yml` (paralelo ao lint), comeca sem falhar (`--no-exit-code --reporter compact`). Quando estabilizar, trocar para `--max-issues 0`.

---

## Camada 3 — jscpd: detectar copy-paste

**O que e:** Detector de blocos de codigo duplicados.

**Instalacao:**
```bash
pnpm add -wD jscpd
```

**Config:** `.jscpd.json` na raiz:
```json
{
  "threshold": 5,
  "reporters": ["console"],
  "ignore": ["**/node_modules/**", "**/generated/**", "**/*.spec.ts", "**/*.test.tsx"],
  "minLines": 5,
  "minTokens": 50,
  "format": ["typescript", "tsx"]
}
```

- `threshold: 5` — maximo 5% de duplicacao
- `minLines: 5` / `minTokens: 50` — blocos menores sao ignorados (evita falsos positivos)
- Ignora testes (duplicacao em testes e aceitavel)

**Script no root `package.json`:**
```json
"cpd": "jscpd apps/"
```

**CI:** Step no stage 1, `continue-on-error: true` (comeca como warning).

---

## Camada 4 — BundleMon: rastrear tamanho do bundle no PR

**O que e:** GitHub App que comenta no PR o delta de tamanho de cada arquivo do bundle.

**Config:** `bundlemon.config.json` na raiz:
```json
{
  "baseDir": "apps/web/dist",
  "files": [
    { "path": "assets/index-*.js", "maxSize": "250kb", "maxPercentIncrease": 10 },
    { "path": "assets/index-*.css", "maxSize": "50kb", "maxPercentIncrease": 10 },
    { "path": "**/*.js", "maxSize": "300kb" }
  ]
}
```

**CI:** Step no stage 3 do `ci.yml` (apos build do web, junto com lighthouse), gated on `web == 'true'`.

**Passo manual obrigatorio:** Instalar o GitHub App BundleMon no repositorio antes de o step funcionar.

---

## Camada 5 — Diretrizes: "verifique antes de criar"

> **Arquitetura Hub and Spoke:** O conteudo da diretriz vai no spoke
> (`.github/ai-guidelines/development-workflow.md`), respeitando a separacao de
> responsabilidades documentada no `CLAUDE.md`. O `CLAUDE.md` (hub) recebe
> **apenas** os novos comandos (`knip`, `knip:fix`, `cpd`) na secao `## Commands`
> — nenhum conteudo de diretriz entra no hub.

**Arquivo:** `.github/ai-guidelines/development-workflow.md` — adicionar secao
**"Antes de escrever codigo novo"** antes de "Git: Conventional Commits".

**Arquivo:** `CLAUDE.md` — adicionar ao bloco de comandos:
```bash
pnpm knip             # dead code / unused exports (Knip)
pnpm knip:fix         # auto-remove unused exports
pnpm cpd              # copy-paste detection (jscpd, threshold 5%)
```

---

## Resumo de impacto

| Camada | Ferramenta | Esforco | Bloqueia CI? | O que pega |
|---|---|---|---|---|
| 1 | oxlint rules | 10 min | warn → error | Funcoes longas, arquivos grandes, complexidade alta |
| 2 | Knip | 30 min | opcional | Exports/arquivos/deps mortos |
| 3 | jscpd | 20 min | opcional | Blocos copy-paste |
| 4 | BundleMon | 15 min | opcional | Bundle engordando silenciosamente |
| 5 | Guidelines | 10 min | nao | Agente de IA criando codigo sem verificar |

---

## Ordem de implementacao

1. **Camada 1** (oxlint) — zero risco, zero deps, efeito imediato
2. **Camada 5** (guidelines + CLAUDE.md) — zero risco, melhora o agente de IA
3. **Camada 2** (Knip) — 1 dep, detecta lixo acumulado
4. **Camada 3** (jscpd) — 1 dep, detecta duplicacao
5. **Camada 4** (BundleMon) — config file pronto, GitHub App manual

---

## Arquivos modificados

- `apps/api/.oxlintrc.json` — adicionar 4 regras
- `apps/web/.oxlintrc.json` — adicionar 4 regras
- `.github/ai-guidelines/development-workflow.md` — adicionar secao "Antes de escrever codigo novo"
- `CLAUDE.md` — adicionar comandos `knip`, `knip:fix`, `cpd` em `## Commands`
- `package.json` (raiz) — adicionar scripts `knip`, `knip:fix`, `cpd`
- `.github/workflows/ci.yml` — adicionar steps de knip e jscpd no stage 1

## Arquivos novos

- `knip.config.ts` — config do Knip (raiz)
- `.jscpd.json` — config do jscpd (raiz)
- `bundlemon.config.json` — config do BundleMon (raiz)

---

## Verificacao

1. `pnpm lint` — deve passar (warnings de complexidade em funcoes que excedam os limites sao esperados)
2. `pnpm knip` — deve listar exports/arquivos nao usados (se houver) sem erro
3. `pnpm cpd` — deve rodar e reportar porcentagem de duplicacao dentro do threshold
4. `pnpm typecheck` — inalterado, deve continuar passando
5. Abrir um PR de teste e verificar se BundleMon comenta com o delta (apos instalar o GitHub App)

---

## Estrategia de Implementacao Otimizada

A execucao e dividida em **3 sessoes isoladas** para poupar contexto e tempo.

### Sessao 1 — Atualizacao da Documentacao

1. Salvar este plano em `plan/GuardrailsMinimalismo.md`
2. Adicionar secao "Antes de escrever codigo novo" em `.github/ai-guidelines/development-workflow.md`
3. Adicionar comandos `knip`, `knip:fix`, `cpd` na secao `## Commands` do `CLAUDE.md`
4. **Commit:** `docs(root): add minimalism decision ladder and new tool commands`

### Sessao 2 — Instalacao de Ferramentas e Configuracao

1. Editar `apps/api/.oxlintrc.json` e `apps/web/.oxlintrc.json` (4 regras)
   - **Commit:** `refactor(root): enable oxlint complexity and size guardrails`
2. `pnpm add -wD knip` + `knip.config.ts` + scripts + step no CI
   - **Commit:** `build(root): add knip for dead code detection`
3. `pnpm add -wD jscpd` + `.jscpd.json` + script + step no CI
   - **Commit:** `build(root): add jscpd for copy-paste detection`
4. `bundlemon.config.json` + step no CI
   - **Commit:** `build(root): add bundlemon config for bundle size tracking`

### Sessao 3 — Verificacao Local e Validacao

1. `pnpm lint` — verificar warnings de complexidade
2. `pnpm knip` — verificar output e avaliar dead code real
3. `pnpm cpd` — verificar porcentagem de duplicacao
4. `pnpm typecheck` — confirmar que nada quebrou
5. Documentar resultados e ajustar thresholds se necessario
