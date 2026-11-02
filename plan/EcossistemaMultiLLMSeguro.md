# Ecossistema Multi-LLM Seguro (v3)

> Status: concluído (2026-11-02). v2 ✅ (Aider + Ollama 1.5b + Continue.dev). v3 ✅ upgrade para 16 GB RAM — Tier 3 autocomplete migrado para `qwen2.5-coder:3b` (11.15 t/s), chat inline adicionado com `qwen2.5-coder:7b` (6.39 t/s), Tier 1 documentado com `/fast` (Opus).

## Contexto

O plano v1 (`EcossistemaMultiLLM.md`) identificou corretamente o problema (dependência única do Claude Code) e a estratégia de 3 camadas. Contudo, a implementação proposta continha três falhas de infraestrutura que inviabilizavam a adoção segura:

1. **Quebra do Claude Code (D1):** Redirecionar `ANTHROPIC_BASE_URL` no `.claude/settings.local.json` para Ollama ou OpenRouter corrompe o tool-calling e o Agentic Reasoning do Claude Code. A CLI depende de schemas internos (computer use, MCP, sequências de ferramentas) que modelos menores como Qwen 7B alucinam — a CLI passa a produzir respostas inválidas ou travar.

2. **Intermediário na nuvem (D2):** O OpenRouter opera como proxy entre o dev e as APIs de destino. Para um projeto com autenticação por cookie HttpOnly, CSRF duplo-submit e tokens JWT, rotear prompts com contexto de código sensível por um agregador de terceiros introduz um vetor de exfiltração de dados desnecessário. A conexão direta via TLS às APIs oficiais elimina esse intermediário.

3. **Performance em CPU (D3):** O hardware do projeto (Ryzen 5 PRO 5675U, 16 GB DDR4 2400 MHz dual-channel, ~27-31 GB/s bandwidth) permite modelos até 7B com performance aceitável. Benchmarks reais (2026-11-02): `qwen2.5-coder:3b` → 11.15 t/s (autocomplete funcional), `qwen2.5-coder:7b` → 6.39 t/s (chat inline viável), `qwen2.5-coder:1.5b` → 27.52 t/s (fallback rápido).

---

## Decisões de Design

### D1 — Claude Code permanece intacto e soberano

**Decisão:** O `.claude/settings.local.json` NÃO redireciona `ANTHROPIC_BASE_URL`. Claude Code sempre aponta para a infraestrutura oficial da Anthropic.

**Consequência:** Claude Code é o Tier 1 exclusivo — reservado para tarefas que exigem raciocínio agentic completo: planos de execução, auditoria DevSecOps, debugging cross-stack, refatorações com múltiplos arquivos em contexto.

**O que muda:** As issues #84 (migrar Ollama para settings.local.json) é fechada como `not_planned` — a abordagem está errada. A issue #60 (OpenRouter via settings.local.json) é fechada pela mesma razão.

### D2 — Tier 2 via Aider com arquitetura dual-provider (Redundância Ativa)

**Decisão:** Para tarefas de média complexidade (gerar DTOs, criar componentes, escrever testes), usar o CLI **Aider** conectado diretamente via TLS às APIs oficiais — sem proxies intermediários. Arquitetura de redundância ativa com dois provedores:

- **Tier 2 — Primário:** Google Gemini Flash (`gemini/gemini-3.8-flash`) — janela de contexto de até 2 milhões de tokens, ideal para spokes complexos sem truncamento; modelo atual recomendado pela Google (2026-10-20).
- **Tier 2.5 — Failover:** DeepSeek Coder (`deepseek/deepseek-coder`) — ativado quando a API da Google sofre indisponibilidade ou latência elevada; custo 90–95% menor que Claude Sonnet.

**Comandos de inicialização:**
```powershell
# Uso padrão (Gemini Flash — modelo atual)
aider --model gemini/gemini-3.8-flash

# Uso de contingência (DeepSeek)
aider --model deepseek/deepseek-coder
```

**Por que Aider:** CLI open-source (Python, MIT License), focado em edição de código, com suporte nativo a ambos os modelos. Não toca no Claude Code.

**Instalação pinada** (sem downloads dinâmicos, conforme CLAUDE.md):
```powershell
# Requer Python 3.12 — aider-chat não suporta Python 3.14+
py -3.12 -m pip install aider-chat==0.82.3
```

> **Nota:** O Python 3.12 é instalado via `winget install Python.Python.3.12 --source winget` antes do pip.

### D3 — Tier 3 com modelos 3B/7B + Continue.dev (v3: upgrade 16 GB)

**Decisão (v3):** Com o upgrade para 16 GB DDR4, o Tier 3 agora opera com dois modelos:
- **`qwen2.5-coder:3b`** (1.9 GB) — tab-autocomplete, 11.15 t/s (benchmark real)
- **`qwen2.5-coder:7b`** (4.7 GB) — chat inline via Ctrl+L, 6.39 t/s (benchmark real)
- **`qwen2.5-coder:1.5b`** (986 MB) — fallback quando RAM sob pressão, 27.52 t/s

**Modelo removido:** `qwen3.5:4b` (generalista, não especializado em código).

**Config global (`~/.continue/config.json`):**
```json
{
  "models": [
    {
      "title": "qwen2.5-coder:7b (local offline)",
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "apiBase": "http://localhost:11434"
    },
    {
      "title": "qwen2.5-coder:1.5b (fallback)",
      "provider": "ollama",
      "model": "qwen2.5-coder:1.5b",
      "apiBase": "http://localhost:11434"
    }
  ],
  "tabAutocompleteModel": {
    "title": "qwen2.5-coder:3b",
    "provider": "ollama",
    "model": "qwen2.5-coder:3b",
    "apiBase": "http://localhost:11434"
  },
  "allowAnonymousTelemetry": false
}
```

**Nota:** Esta configuração é global (`~/.continue/`) e funciona em todos os projetos, não apenas Code-Conect.

**Por que Continue.dev:** extensão open-source dedicada a coding assistants, suporte nativo a Ollama com configuração declarativa, sem conta obrigatória, sem telemetria por padrão.

---

## Arquitetura (v3)

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — Claude Code (cloud Anthropic)                         │
│  Default: Sonnet · /fast: Opus (audit, planos, debug complexo)  │
│  settings.local.json NÃO redireciona ANTHROPIC_BASE_URL         │
└─────────────────────────────────────────────────────────────────┘
         │ quando tarefa é média complexidade
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2 — Aider CLI + Gemini Flash (PRIMÁRIO, API)              │
│  TIER 2.5 — Aider CLI + DeepSeek Coder (FAILOVER, API)         │
│  TIER 2-LOCAL — Aider + qwen2.5-coder:7b (OFFLINE, ~6 t/s)    │
└─────────────────────────────────────────────────────────────────┘
         │ para autocomplete inline no editor
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3 — Ollama local + Continue.dev (global, multi-projeto)   │
│  qwen2.5-coder:3b · 11 t/s · tab-autocomplete                  │
│  qwen2.5-coder:7b · 6 t/s · inline chat (Ctrl+L)              │
│  qwen2.5-coder:1.5b · 27 t/s · fallback se RAM sob pressão    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security By Design

Sem impacto de segurança — este plano altera exclusivamente ferramentas de desenvolvimento local (Ollama, Continue.dev, Aider). Nenhum código de aplicação (`apps/api`, `apps/web`), endpoint, middleware de autenticação, ou configuração de CI/CD é modificado. O `ANTHROPIC_BASE_URL` permanece inalterado (decisão D1).

1. **Autenticação:** N/A — tooling local
2. **Autorização/BOLA:** N/A — tooling local
3. **Validação de entrada:** N/A — sem inputs de usuário
4. **Exposição de dados:** N/A — modelos rodam offline em localhost:11434
5. **CSRF:** N/A — sem superfície web
6. **Rate limiting:** N/A — sem API exposta
7. **Gestão de segredos:** API keys (Gemini, DeepSeek) armazenadas como variáveis de ambiente do usuário Windows, nunca commitadas
8. **Risco de dependências:** Modelos Ollama são binários GGUF verificados por hash; Continue.dev instalado via VS Code Marketplace (assinado)

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

### ~~Passo 2~~ — ✅ Configurar o Tier 2 (Aider) — concluído 2026-10-20

**2a. Instalar Aider com versão pinada** (requer Python 3.12 — aider-chat não suporta Python 3.14+):
```powershell
# 1. Instalar Python 3.12 via winget (pinado, sem downloads dinâmicos)
winget install Python.Python.3.12 --source winget

# 2. Instalar Aider com Python 3.12
py -3.12 -m pip install aider-chat==0.82.3
aider --version   # esperado: aider 0.82.3
```

> **Nota de segurança:** Não usar `pip install aider-chat` sem versão — viola o guardrail de Zero Dynamic Downloads do CLAUDE.md.

**2b. Configurar AMBAS as API keys** (variável de usuário no Windows — NUNCA commitadas):

```powershell
# Tier 2 primário — Google Gemini Flash
[System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "AIza...", "User")

# Tier 2.5 failover — DeepSeek Coder
[System.Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-...", "User")
```

As duas chaves devem **coexistir** exportadas no perfil do desenvolvedor. A chave não usada fica inerte até o failover ser acionado.

**2c. Comandos de uso:**
```powershell
# Uso padrão (Gemini Flash — Tier 2 primário)
aider --model gemini/gemini-3.8-flash apps/api/src/app.controller.ts

# Uso de contingência (DeepSeek — Tier 2.5 failover)
aider --model deepseek/deepseek-coder apps/api/src/app.controller.ts
```

---

## Critérios de Roteamento Práticos (v3)

| Tipo de tarefa | Ferramenta | Critério de corte |
|---|---|---|
| Planos, audit, debug multi-arquivo | **Claude Code** (Sonnet) | Sempre — não há substituto |
| Audit complexo, planos estratégicos | **Claude Code** (`/fast` → Opus) | Alta complexidade, decisão arquitetural |
| Gerar DTO, componente, teste unitário | **Aider + Gemini Flash** (primário) | Contexto < 5 arquivos, tarefa descritível em 2 linhas |
| Idem, com Gemini indisponível | **Aider + DeepSeek** (failover) | Chavear com `--model deepseek/deepseek-coder` |
| Idem, sem internet | **Aider + Ollama 7b** (offline) | `aider --model ollama/qwen2.5-coder:7b` |
| Tab-autocomplete | **Continue.dev + Ollama 3b** | Automático — sempre rodando no editor |
| Inline chat (Ctrl+L), dúvida rápida | **Continue.dev + Ollama 7b** | Modelo padrão no Continue.dev |
| RAM sob pressão (>85% uso) | **Continue.dev + Ollama 1.5b** | Trocar manualmente no Continue.dev |
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

### Tier 3 — Ollama (v3: 3B + 7B + 1.5B fallback)

```powershell
# 1. Confirmar modelos instalados
ollama list
# Deve mostrar: qwen2.5-coder:7b, qwen2.5-coder:3b, qwen2.5-coder:1.5b
# NÃO deve mostrar: qwen3.5:4b (removido)

# 2. Medir tokens/segundo — 3B (autocomplete)
ollama run qwen2.5-coder:3b "Complete: @Get() async findAll(): Promise<User[]> {" --verbose
# Alvo: > 10 tokens/s · Resultado real (2026-11-02): 11.15 t/s ✅

# 3. Medir tokens/segundo — 7B (chat)
ollama run qwen2.5-coder:7b "Write a Vitest test for UserService.findById with Prisma" --verbose
# Alvo: > 6 tokens/s · Resultado real (2026-11-02): 6.39 t/s ✅

# 4. Confirmar que Claude Code NÃO está usando Ollama
# settings.local.json não deve ter ANTHROPIC_BASE_URL
cat .claude/settings.local.json   # inspecionar manualmente
```

### Tier 2 — Aider

```powershell
# 1. Confirmar versão instalada
aider --version
# Esperado: aider 0.82.3

# 2. Testar conexão com Gemini Flash (primário)
aider --model gemini/gemini-3.8-flash --no-git --message "Write a one-line TypeScript type for a paginated response"
# Deve responder em < 5s

# 3. Testar failover com DeepSeek (contingência)
aider --model deepseek/deepseek-coder --no-git --message "Write a one-line TypeScript type for a paginated response"
# Deve responder em < 5s

# 4. Confirmar que NENHUMA API key está em arquivo commitado
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
| #87 — Configurar Tier 3 (Ollama + Continue.dev) | ✅ Fechada (2026-10-20) |
| #88 — Configurar Tier 2 (Aider CLI) | ✅ Fechada (2026-10-20) |
| #89 — Documentar Multi-LLM v2 na wiki | ✅ Fechada (2026-10-20) |
| #86 — Avaliar qwen2.5-coder:1.5b para autocomplete | ✅ Fechada (2026-10-20) |
| #103 — Upgrade Multi-LLM v3 para 16 GB RAM | ✅ Concluído (2026-11-02) — 3b+7b instalados, benchmarks OK, config atualizada |
