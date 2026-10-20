# Ecossistema Multi-LLM Seguro (v2)

> Status: em progresso (2026-10-20). Passo 3 concluído (issues fechadas, v1 deprecado, `.vscode/extensions.json` atualizado). Passos 1 (Ollama + Continue.dev) e 2 (Aider) pendentes.

## Contexto

O plano v1 (`EcossistemaMultiLLM.md`) identificou corretamente o problema (dependência única do Claude Code) e a estratégia de 3 camadas. Contudo, a implementação proposta continha três falhas de infraestrutura que inviabilizavam a adoção segura:

1. **Quebra do Claude Code (D1):** Redirecionar `ANTHROPIC_BASE_URL` no `.claude/settings.local.json` para Ollama ou OpenRouter corrompe o tool-calling e o Agentic Reasoning do Claude Code. A CLI depende de schemas internos (computer use, MCP, sequências de ferramentas) que modelos menores como Qwen 7B alucinam — a CLI passa a produzir respostas inválidas ou travar.

2. **Intermediário na nuvem (D2):** O OpenRouter opera como proxy entre o dev e as APIs de destino. Para um projeto com autenticação por cookie HttpOnly, CSRF duplo-submit e tokens JWT, rotear prompts com contexto de código sensível por um agregador de terceiros introduz um vetor de exfiltração de dados desnecessário. A conexão direta via TLS às APIs oficiais elimina esse intermediário.

3. **Performance inviável em CPU (D3):** O hardware do projeto (Ryzen 5 PRO 5675U, DDR4 2400 MHz dual-channel, ~38 GB/s bandwidth) gera 2–5 tokens/s com um modelo 7B quantizado. Para tab-autocomplete, um delay de 1–3 segundos por token destrói a experiência. Um modelo 1.5B no mesmo hardware entrega 25–35 tokens/s, tornando o autocomplete instantâneo.

---

## Decisões de Design

### D1 — Claude Code permanece intacto e soberano

**Decisão:** O `.claude/settings.local.json` NÃO redireciona `ANTHROPIC_BASE_URL`. Claude Code sempre aponta para a infraestrutura oficial da Anthropic.

**Consequência:** Claude Code é o Tier 1 exclusivo — reservado para tarefas que exigem raciocínio agentic completo: planos de execução, auditoria DevSecOps, debugging cross-stack, refatorações com múltiplos arquivos em contexto.

**O que muda:** As issues #84 (migrar Ollama para settings.local.json) é fechada como `not_planned` — a abordagem está errada. A issue #60 (OpenRouter via settings.local.json) é fechada pela mesma razão.

### D2 — Tier 2 via Aider conectado diretamente às APIs oficiais

**Decisão:** Para tarefas de média complexidade (gerar DTOs, criar componentes, escrever testes), usar o CLI **Aider** conectado diretamente via TLS às APIs da **DeepSeek** ou **Google Gemini Flash** — sem proxies intermediários.

**Por que Aider:** CLI open-source (Python, MIT License), focado em edição de código, com suporte nativo a `--model deepseek/deepseek-coder` e `--model gemini/gemini-2.0-flash`. Não toca no Claude Code.

**Por que DeepSeek/Gemini direto:** Custo 90–95% menor que Claude Sonnet por token; conexão TLS direta ao provedor (sem agregador); nenhuma configuração do Claude Code alterada.

**Instalação pinada** (sem downloads dinâmicos, conforme CLAUDE.md):
```powershell
pip install aider-chat==0.82.3
```

### D3 — Tier 3 com modelo 1.5B + Continue.dev (substitui Cody AI)

**Decisão:** Substituir `qwen3.5:7b` por `qwen2.5-coder:1.5b` no Ollama para tab-autocomplete local. Substituir Cody AI por **Continue.dev** (`continue.continue`) no VS Code.

**Por que 1.5B:** ~1 GB de RAM, 25–35 tokens/s em CPU DDR4 2400 MHz — autocomplete subjetivamente instantâneo.

**Por que Continue.dev:** extensão open-source dedicada a coding assistants, suporte nativo a Ollama com configuração declarativa em `~/.continue/config.json`, sem conta obrigatória, sem telemetria por padrão.

**Impacto:** Issue #85 (Cody AI) fechada como `not_planned`; nova issue criada para Continue.dev.

---

## Arquitetura (v2)

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — Claude Code (inalterado)                              │
│  Anthropic Cloud direto · settings.local.json NÃO modificado   │
│  Para: planos, audit, debug cross-stack, multi-arquivo          │
└─────────────────────────────────────────────────────────────────┘
         │ quando tarefa é média complexidade
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2 — Aider CLI                                             │
│  Conexão TLS direta → DeepSeek API ou Gemini Flash API          │
│  Para: DTOs, componentes, testes unitários, boilerplate         │
└─────────────────────────────────────────────────────────────────┘
         │ para autocomplete inline no editor
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3 — Ollama local + Continue.dev                           │
│  qwen2.5-coder:1.5b · http://localhost:11434                    │
│  Para: tab-autocomplete, inline chat, perguntas rápidas         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Passos de Implementação

### ~~Passo 3~~ — ✅ Documentação e issues (concluído 2026-10-20)

- ✅ `plan/EcossistemaMultiLLM.md` marcado como deprecado com referência a este plano
- ✅ `.vscode/extensions.json` atualizado: `sourcegraph.cody-ai` → `continue.continue`
- ✅ Issue #84 fechada como `not_planned`
- ✅ Issue #85 fechada como `not_planned`
- ✅ Issue #60 fechada como `not_planned`
- ✅ Issue #86 escopo atualizado: avaliar `qwen2.5-coder:1.5b` para autocomplete

### Passo 1 — Sanear o Tier 3 (Ollama + Continue.dev) ⏳ — #87

**1a. Trocar o modelo Ollama para 1.5B:**
```powershell
ollama pull qwen2.5-coder:1.5b
# Opcional: remover modelo antigo após validar o novo
ollama rm qwen3.5:4b
```

**1b. Confirmar que `.claude/settings.local.json` não redireciona a URL:**
```powershell
# O arquivo NÃO deve ter ANTHROPIC_BASE_URL definida.
# Se existir com redirecionamento, remover o env block inteiro.
git status .claude/
```

**1c. ✅ Atualizar `.vscode/extensions.json`** — já executado (2026-10-20).

**1d. Configurar Continue.dev com Ollama** — criar `~/.continue/config.json` (arquivo pessoal, fora do repositório):
```json
{
  "models": [],
  "tabAutocompleteModel": {
    "title": "qwen2.5-coder:1.5b",
    "provider": "ollama",
    "model": "qwen2.5-coder:1.5b",
    "apiBase": "http://localhost:11434"
  },
  "allowAnonymousTelemetry": false
}
```

### Passo 2 — Configurar o Tier 2 (Aider) ⏳ — #88

**2a. Instalar Aider com versão pinada:**
```powershell
pip install aider-chat==0.82.3
aider --version   # confirmar instalação
```

> **Nota de segurança:** Não usar `pip install aider-chat` sem versão — viola o guardrail de Zero Dynamic Downloads do CLAUDE.md.

**2b. Configurar variáveis de ambiente para o provedor escolhido** (variável de usuário no Windows — NUNCA commitado):

Opção A — DeepSeek:
```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
aider --model deepseek/deepseek-coder
```

Opção B — Google Gemini Flash:
```powershell
$env:GEMINI_API_KEY = "AIza..."
aider --model gemini/gemini-2.0-flash
```

**2c. Testar com um arquivo do projeto:**
```powershell
# No diretório raiz do projeto:
aider apps/api/src/app.controller.ts --model deepseek/deepseek-coder
# Prompt de teste: "Add a /health/ready endpoint that returns { status: 'ok' }"
```

---

## Critérios de Roteamento Práticos (v2)

| Tipo de tarefa | Ferramenta | Critério de corte |
|---|---|---|
| Planos, audit, debug multi-arquivo | **Claude Code** | Sempre — não há substituto |
| Gerar DTO, componente, teste unitário | **Aider + DeepSeek/Gemini** | Contexto < 5 arquivos, tarefa descritível em 2 linhas |
| Tab-autocomplete, inline chat, dúvida rápida | **Continue.dev + Ollama** | Automático — sempre rodando no editor |
| Troca de Aider → Claude Code | — | Resposta incorreta após 1 tentativa, ou contexto envolve auth/segurança |

---

## Arquivos Modificados

| Arquivo | Operação | Estado |
|---|---|---|
| `.vscode/extensions.json` | `cody-ai` → `continue.continue` | ✅ Concluído 2026-10-20 |
| `plan/EcossistemaMultiLLM.md` | Nota de deprecação no topo | ✅ Concluído 2026-10-20 |
| `plan/EcossistemaMultiLLMSeguro.md` | Criar este arquivo | ✅ Concluído 2026-10-20 |
| `.claude/settings.local.json` | Remover `env` block com `ANTHROPIC_BASE_URL` (se presente) | ⏳ Passo 1b |
| `~/.continue/config.json` | Criar (pessoal, fora do repositório) | ⏳ Passo 1d |

**Arquivos que NÃO mudam:**
- Qualquer arquivo de código da aplicação (`apps/api`, `apps/web`): este plano é estritamente de tooling

---

## Commits

```
chore(root): substituir cody-ai por continue.dev em vscode extensions
chore(root): deprecar plano EcossistemaMultiLLM v1, referenciar v2
```

---

## Wiki

**Página afetada:** `docs/wiki/governanca-workflow.md`

**Conteúdo a adicionar — nova seção "Ecossistema de Ferramentas de IA (Multi-LLM v2)":**

- Subseção **"Arquitetura em 3 camadas"** — diagrama texto das 3 camadas (Claude Code / Aider / Continue.dev+Ollama) com a regra central: `ANTHROPIC_BASE_URL` não é redirecionada no `settings.local.json` (quebra o tool-calling da CLI)
- Subseção **"Critérios de roteamento"** — tabela: tipo de tarefa → ferramenta → critério de corte (contexto < 5 arquivos para Aider, autocomplete automático para Ollama, sempre Claude Code para planos/audit)
- Subseção **"Ferramentas e versões"** — tabela: Aider `0.82.3` (pip, pinado), `qwen2.5-coder:1.5b` (Ollama), Continue.dev (`continue.continue`)
- Nota de segurança: por que OpenRouter foi descartado (proxy intermediário) e por que modelo 7B é inviável em CPU DDR4 2400 MHz

**Página afetada:** `docs/wiki/Home.md`

- Atualizar referência de tooling: substituir menções a Cody AI por Continue.dev, remover referência a OpenRouter como Tier 2

---

## Verificação e Calibração de Performance

### Tier 3 — Ollama 1.5B

```powershell
# 1. Confirmar modelo instalado
ollama list
# Deve mostrar: qwen2.5-coder:1.5b

# 2. Medir tokens/segundo
ollama run qwen2.5-coder:1.5b "Write a NestJS DTO with class-validator for user registration"
# Observar: eval rate no final da resposta — alvo: > 20 tokens/s

# 3. Confirmar que Claude Code NÃO está usando Ollama
# settings.local.json não deve ter ANTHROPIC_BASE_URL
cat .claude/settings.local.json   # inspecionar manualmente
```

### Tier 2 — Aider

```powershell
# 1. Confirmar versão instalada
aider --version
# Esperado: aider-chat 0.82.3

# 2. Testar conexão com DeepSeek
aider --model deepseek/deepseek-coder --no-git --message "Write a one-line TypeScript type for a paginated response"
# Deve responder em < 5s

# 3. Confirmar que API key NÃO está em nenhum arquivo commitado
git status
git log --oneline -5
```

### Tier 1 — Claude Code (confirmação de integridade)

```powershell
# Confirmar que Claude Code usa Anthropic direto:
# No Claude Code, executar um comando que exige tool-calling real,
# ex: /code-review ou leitura de múltiplos arquivos.
# Se responder corretamente = Tier 1 intacto.
```

---

## Referências e Issues

| Issue | Status |
|---|---|
| #84 — Migrar Ollama para qwen3.5:7b | ✅ Fechada `not_planned` (2026-10-20) |
| #85 — Configurar Cody AI | ✅ Fechada `not_planned` (2026-10-20) |
| #60 — Configurar OpenRouter via settings.local.json | ✅ Fechada `not_planned` (2026-10-20) |
| #87 — Configurar Tier 3 (Ollama + Continue.dev) | ⏳ Aberta — Fase 1 |
| #88 — Configurar Tier 2 (Aider CLI) | ⏳ Aberta — Fase 2 |
| #89 — Documentar Multi-LLM v2 na wiki | ⏳ Aberta — Fase 3 (após #87 e #88) |
| #86 — Avaliar qwen2.5-coder:1.5b para autocomplete | ⏳ Aberta — executar após #87 |
