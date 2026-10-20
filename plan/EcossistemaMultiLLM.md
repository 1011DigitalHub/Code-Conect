# Ecossistema Multi-LLM: Ollama + OpenRouter

> ⚠️ **DEPRECADO em 2026-10-20.** Este plano contém falhas de infraestrutura (quebra do Claude Code via ANTHROPIC_BASE_URL, modelo 7B lento em CPU, OpenRouter como proxy). Ver `plan/EcossistemaMultiLLMSeguro.md` para a arquitetura v2 correta. Issues #84, #85 e #60 fechadas como `not_planned`.

## Contexto

O projeto Code-Conect usa Claude Code (Anthropic) como assistente principal de desenvolvimento. A dependência de um único provedor gera dois riscos:

1. **Interrupção por limite de tokens** — quando o plano de tokens do Claude Code esgota, o desenvolvimento para.
2. **Custo fixo elevado** — tarefas repetitivas e simples (autocompletar, gerar boilerplate, tirar dúvidas rápidas) consomem tokens ao mesmo preço de tarefas complexas.

A solução é um **ecossistema multi-LLM**: uma estratégia de múltiplos provedores de LLM com diferentes características de custo, qualidade e privacidade, selecionados conforme o tipo de tarefa.

---

## O que é um LLM local

Um **LLM local** é um modelo de linguagem que roda inteiramente na máquina do desenvolvedor, sem enviar dados para servidores externos. A inferência é feita pelo hardware local (CPU ou GPU).

**Vantagens:**
- Custo zero por token após a instalação
- Privacidade total — código e prompts não saem da máquina
- Funciona offline
- Sem rate limits nem filas

**Desvantagens:**
- Qualidade inferior a modelos grandes de nuvem (menos parâmetros)
- Velocidade dependente do hardware (CPU-only é lento)
- Requer espaço em disco para os pesos do modelo (2–20 GB por modelo)

---

## O que é um ecossistema Multi-LLM

Um ecossistema **Multi-LLM** é a prática de direcionar cada tipo de tarefa para o modelo mais adequado, equilibrando custo, velocidade e qualidade:

| Tipo de tarefa | Provedor ideal | Motivo |
|---|---|---|
| Planejamento arquitetural, debugging cross-stack, refatoração complexa | Claude Opus (Anthropic direto) | Máxima qualidade de raciocínio, contexto longo |
| Geração de componentes, testes unitários, endpoints simples | OpenRouter (modelos mid-tier) | Boa qualidade a custo reduzido |
| Autocomplete, perguntas rápidas, exploração de APIs | Ollama local | Custo zero, resposta imediata, sem privacidade comprometida |

---

## Componentes

### Ollama (LLM local) — ✅ instalado, ⏳ migração pendente (#84)

**O que é:** Runtime open-source para executar LLMs localmente. Expõe uma API REST na porta `11434`, compatível com os formatos OpenAI e Anthropic.

**Como integra com Claude Code:** via variáveis de ambiente que redirecionam a SDK Anthropic para o servidor local.

**Modelo atual (instalado):** `qwen3.5:4b` — adequado para 8 GB RAM; ainda em uso até a conclusão de #84.

**Modelo alvo (pós #84):** `qwen3.5:7b` (~4.5 GB) — desbloqueado pelo upgrade de RAM 16 GB (2026-10-20), CPU dual-channel.

### OpenRouter (gateway multi-modelo) — ⏳ pendente (#60)

**O que é:** Gateway na nuvem que centraliza acesso a dezenas de provedores (Anthropic, Google, Mistral, Qwen, etc.) em uma única API. Oferece modelos gratuitos (com rate limit) e modelos pagos a custo por token.

**Como integra com Claude Code:** mesma configuração de variáveis de ambiente — a SDK aponta para `https://openrouter.ai/api/v1` em vez da Anthropic.

**Vantagem principal:** acesso a modelos Claude via créditos OpenRouter (potencialmente mais barato que plano direto) e acesso a modelos gratuitos como fallback.

---

## Configuração do Claude Code

O arquivo `.claude/settings.local.json` na raiz do projeto controla qual provedor está ativo. **Este arquivo é pessoal e não é commitado** (já está no `.gitignore`).

### Modo Ollama local (16 GB RAM — configuração atual)

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3.5:7b",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3.5:7b",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen3.5:7b"
  }
}
```

> **Configuração anterior (8 GB RAM):** usava `qwen3.5:4b` nos três model IDs.

### Modo OpenRouter

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-or-SUA-CHAVE-AQUI",
    "ANTHROPIC_API_KEY": "sk-or-SUA-CHAVE-AQUI",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen/qwen-2.5-coder-32b:free",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen/qwen-2.5-coder-32b:free",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen/qwen-2.5-coder-32b:free"
  }
}
```

> **Nota:** IDs de modelo no OpenRouter usam o formato `autor/modelo` (ex: `qwen/qwen-2.5-coder-32b:free`). IDs nativos da Anthropic (ex: `claude-sonnet-4-20250514`) precisam do prefixo `anthropic/`.

### Modo Claude direto (Anthropic)

Remover ou renomear `.claude/settings.local.json`. A SDK usa a autenticação padrão do Claude Code.

---

## Troca entre modos

| Modo | `ANTHROPIC_BASE_URL` | `ANTHROPIC_API_KEY` | Quando usar |
|---|---|---|---|
| **Claude direto** | *(arquivo ausente)* | *(padrão)* | Tarefas complexas, contexto grande, máxima qualidade |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `sk-or-...` | Alternativa de custo ou quando tokens Anthropic acabam |
| **Ollama local** | `http://localhost:11434` | `""` | Tarefas simples, offline, custo zero, privacidade |

**Critérios práticos de roteamento:**

- Use **Ollama** quando: a tarefa cabe em uma descrição curta (gerar DTO, criar componente simples, tirar dúvida pontual) e o contexto necessário é menor que ~4k tokens.
- Troque para **Claude direto** quando: a resposta do Ollama demorar mais de ~20s, a qualidade for insuficiente após uma tentativa, ou o contexto envolver múltiplos arquivos.
- Use **OpenRouter** quando: os tokens do plano Anthropic estiverem esgotados e a tarefa for complexa demais para o Ollama.

---

## Hardware e modelos

**Hardware atual do projeto:** Ryzen 5 PRO 5675U, **16 GB DDR4 SODIMM 2400 MHz dual-channel** (2 de 2 slots em uso, upgrade concluído 2026-10-20), GPU integrada Radeon 496 MB (inutilizável para inferência).

| Configuração | Modelo local viável | RAM disponível para modelo | Qualidade |
|---|---|---|---|
| ~~8 GB RAM~~ *(anterior)* | `qwen3.5:4b` | ~4 GB | Básica — tarefas simples |
| **16 GB RAM (atual)** | **`qwen3.5:7b`** | ~10 GB | Razoável — componentes e testes |
| 32 GB RAM + GPU 24 GB | `qwen3.6:27b` | ~20 GB | Boa — próxima a Claude Sonnet |

---

## Extensão de IDE — ⏳ configuração pendente (#85)

A extensão **Cody AI** (`sourcegraph.cody-ai`) foi adicionada às recomendações do VS Code (`.vscode/extensions.json`). A configuração do Ollama como provider de autocomplete e chat inline ainda não foi feita — isso é o objetivo de #85. Quando concluída, Cody AI operará independentemente do Claude Code, consumindo zero tokens do plano Anthropic.

---

## Verificação

```powershell
# Confirmar que Ollama está rodando
Invoke-RestMethod http://localhost:11434/api/tags

# Listar modelos instalados
ollama list

# Testar modelo manualmente
ollama run qwen3.5:7b "Explain what NestJS guards do in one sentence"

# Verificar que settings.local.json NÃO está sendo rastreado pelo git
git status .claude/
```

---

## Wiki

Sem impacto na wiki — este plano foi **deprecado em 2026-10-20** antes de qualquer implementação de código. A documentação da estratégia Multi-LLM será publicada em `docs/wiki/governanca-workflow.md` pelo plano sucessor `plan/EcossistemaMultiLLMSeguro.md`.

---

## Pontos em aberto / próximos passos

- [x] Upgrade de RAM para 16 GB (módulo DDR4 SODIMM 2400 MHz) — concluído 2026-10-20; `qwen3.5:7b` desbloqueado

**Sequência de implementação (dependências em ordem):**

1. [ ] #84 — Migrar Ollama para `qwen3.5:7b` e atualizar `.claude/settings.local.json` *(pré-requisito de #85 e #86)*
2. [ ] #85 — Configurar Cody AI com Ollama local no VS Code *(depende de #84)*
3. [ ] #86 — Avaliar qualidade do 7B em tarefas reais e documentar decisão de roteamento *(depende de #84)*
4. [ ] #60 — Criar conta no OpenRouter e configurar API key *(independente, pode rodar em paralelo a #85/#86)*
