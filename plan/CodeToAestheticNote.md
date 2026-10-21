# Plano: Code-to-Aesthetic-Note

> Automação para gerar infográficos estilo "caderno de estudos" a partir dos Markdown da Wiki (`docs/wiki/`) e incorporá-los de volta via GitHub Actions.

## Motivação

As 13 páginas da wiki são texto puro. Infográficos visuais no estilo caderno pautado tornam o conteúdo mais acessível e memorável para o público-alvo (analistas juniores / trainees), sem custo (100% open-source).

## Etapas

### 1. Infraestrutura de Assets

- Fonte **Caveat** (Google Fonts, OFL) commitada em `docs/wiki/assets/fonts/`
- Fonte monospace **DejaVu Sans Mono** do sistema (Ubuntu runners); fallback para `ImageFont.load_default()` se indisponível
- Fundo de caderno pautado gerado programaticamente (creme + linhas azuis + margem vermelha)

### 2. Engine Visual (Python)

**Arquivo:** `scripts/generate_infographic.py`

- Regex para extrair: título (H1), resumo (blockquote), até 3 blocos de código fenced
- Pillow renderiza: título em caneta navy, resumo com marca-texto amarelo neon, post-its escuros rotacionados para código
- Correções do comitê: (1) fallback de fonte, (2) pre-flight layout, (3) rotação RGBA+BICUBIC, (4) injeção idempotente via Python
- Dependência: `Pillow>=11.1.0,<14.0.0` em `scripts/requirements-infographic.txt`

### 3. Pipeline CI/CD

**Arquivo:** `.github/workflows/wiki-infographics.yml`

- Gatilho: `push` → `main` em `docs/wiki/*.md` (exceto Home.md) + `workflow_dispatch`
- Permissão: `contents: write` (menor privilégio)
- Steps: detectar arquivos alterados → setup Python 3.12 → instalar Pillow → gerar PNGs → injetar tags → commit + push (bot)
- Prevenção de loop: GITHUB_TOKEN não dispara workflows + path filter + diff check

### 4. Acoplamento Visual

- Markers HTML `<!-- infographic-start/end -->` delimitam a tag de imagem
- Injeção idempotente feita pelo script Python (`--inject`)
- Posição: após o footer italic existente de cada wiki page

## Commits

| # | Mensagem | Arquivos |
|---|---|---|
| 1 | `chore(root): add Caveat handwriting font for wiki infographics` | `docs/wiki/assets/fonts/Caveat-Regular.ttf`, `OFL-Caveat.txt` |
| 2 | `feat(root): add Python engine for notebook-style wiki infographics` | `scripts/generate_infographic.py`, `requirements-infographic.txt` |
| 3 | `ci(root): add wiki-infographics workflow for automated generation` | `.github/workflows/wiki-infographics.yml`, `.gitignore` |

## Wiki

- **Sem novas páginas wiki** — os infográficos são imagens incorporadas, não páginas
- **13 páginas modificadas automaticamente** pelo pipeline (tag de imagem injetada no footer após primeiro `workflow_dispatch`)
- `docs/wiki/assets/` criado para armazenar PNGs gerados e fontes

## Verificação

- [x] Script gera PNG corretamente (`arquitetura-backend` → 182 KB, 1200×956 px)
- [x] Fonte Caveat carrega e renderiza acentos portugueses
- [x] Injeção de markers funciona e é idempotente
- [x] Infográfico mostra: fundo pautado, título caligráfico, marca-texto amarelo, post-its com código
- [ ] Workflow executa no GitHub Actions após merge do PR
- [ ] `workflow_dispatch` com `regenerate_all` processa todas as 13 páginas

## Status

🟡 Implementado — aguardando PR review e merge para ativação do pipeline.
