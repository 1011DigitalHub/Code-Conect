# Ecossistema Multi-LLM: Ollama + OpenRouter

> Status: implementado (2026-10-14). Ollama instalado e modelo `qwen3.5:4b` validado localmente.

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

## Componentes implementados

### Ollama (LLM local)

**O que é:** Runtime open-source para executar LLMs localmente. Expõe uma API REST na porta `11434`, compatível com os formatos OpenAI e Anthropic.

**Como integra com Claude Code:** via variáveis de ambiente que redirecionam a SDK Anthropic para o servidor local.

**Modelo em uso:** `qwen3.5:4b` (~3.3 GB, Qwen da Alibaba Cloud) — adequado para hardware com 8 GB RAM, rodando em CPU.

**Modelo pós-upgrade de RAM (16 GB):** `qwen3.5:7b` (~4.5 GB) — qualidade significativamente maior, ainda CPU-only mas mais capaz.

### OpenRouter (gateway multi-modelo)

**O que é:** Gateway na nuvem que centraliza acesso a dezenas de provedores (Anthropic, Google, Mistral, Qwen, etc.) em uma única API. Oferece modelos gratuitos (com rate limit) e modelos pagos a custo por token.

**Como integra com Claude Code:** mesma configuração de variáveis de ambiente — a SDK aponta para `https://openrouter.ai/api/v1` em vez da Anthropic.

**Vantagem principal:** acesso a modelos Claude via créditos OpenRouter (potencialmente mais barato que plano direto) e acesso a modelos gratuitos como fallback.

---

## Configuração do Claude Code

O arquivo `.claude/settings.local.json` na raiz do projeto controla qual provedor está ativo. **Este arquivo é pessoal e não é commitado** (já está no `.gitignore`).

### Modo Ollama local (Fase 1 — 8 GB RAM)

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3.5:4b",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3.5:4b",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen3.5:4b"
  }
}
```

### Modo Ollama local (Fase 2 — pós-upgrade 16 GB RAM)

Mesma configuração, trocar os três model IDs para `qwen3.5:7b`.

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

---

## Hardware e modelos

**Hardware atual do projeto:** Ryzen 5 PRO 5675U, 8 GB DDR4 SODIMM (1 de 2 slots em uso), GPU integrada Radeon 496 MB.

| Configuração | Modelo local viável | RAM disponível para modelo | Qualidade |
|---|---|---|---|
| 8 GB RAM (atual) | `qwen3.5:4b` | ~4 GB | Básica — tarefas simples |
| 16 GB RAM (pós-upgrade) | `qwen3.5:7b` | ~10 GB | Razoável — componentes e testes |
| 32 GB RAM + GPU 24 GB | `qwen3.6:27b` | ~20 GB | Boa — próxima a Claude Sonnet |

**Upgrade planejado:** adicionar 1 módulo DDR4 SODIMM 2400 MHz 8 GB no slot livre (~R$ 100-150). Com 16 GB e dual-channel, o modelo 7B roda com folga e a GPU integrada também se beneficia.

---

## Extensão de IDE

A extensão **Cody AI** (`sourcegraph.cody-ai`) foi adicionada às recomendações do VS Code (`.vscode/extensions.json`). Ela conecta diretamente ao Ollama local (`http://localhost:11434`) para autocomplete e chat inline, sem afetar o Claude Code.

---

## Verificação

```powershell
# Confirmar que Ollama está rodando
Invoke-RestMethod http://localhost:11434/api/tags

# Listar modelos instalados
ollama list

# Testar modelo manualmente
ollama run qwen3.5:4b "Explain what NestJS guards do in one sentence"

# Verificar que settings.local.json NÃO está sendo rastreado pelo git
git status .claude/
```

---

## Pontos em aberto / próximos passos

- [ ] Upgrade de RAM para 16 GB (módulo DDR4 SODIMM 2400 MHz) — desbloqueia `qwen3.5:7b`
- [ ] Criar conta no OpenRouter e configurar API key para a Fase 3
- [ ] Avaliar Cody AI após configurar Ollama como provider no VS Code
- [ ] Após upgrade, medir qualidade do 7B em tarefas reais do projeto e decidir se é viável como fallback rotineiro
