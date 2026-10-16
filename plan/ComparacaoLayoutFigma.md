# Comparação de Layout: Feed vs. Figma frame 155-3100

## Objetivo

Comparar a implementação atual do feed (feed/detalhe/sidebar) contra o frame Figma
`155-3100` (arquivo `gW885OUfpvfMnZoHnzLwFQ`) nos breakpoints 1440px, 768px e 360px,
classificar divergências e corrigir as relevantes usando apenas tokens/classes Tailwind
do design system.

Issue de referência: #51.

## Frame Figma lido em 2026-10-16

- **URL:** `figma.com/design/gW885OUfpvfMnZoHnzLwFQ/CodeConnect---ALURA?node-id=155-3100`
- **Ferramenta:** `get_design_context` com skill `figma-design-to-code`
- **Breakpoint exibido no frame:** desktop 1440px

### Medidas extraídas do Figma

| Elemento | Valor Figma |
|---|---|
| Padding vertical do frame | `py-[56px]` |
| Sidebar width | `w-[177px]` (max-w-282px) |
| Sidebar padding | `px-[16px] py-[40px]` |
| Sidebar border-radius | `rounded-[8px]` |
| Gap logo → nav (sidebar) | `gap-[80px]` |
| Nav item layout | vertical: ícone 32px acima de texto 22px, gap-8 |
| Coluna de conteúdo | `w-[996px]` |
| Gap search ↔ cards | `gap-[56px]` |
| Grid de cards | `flex flex-wrap gap-[24px]` → 2 colunas (486×2 + 24 = 996) |
| Card width | `w-[486px]` |
| Card radius | `rounded-[8px]` (tl/tr em cima, bl/br em baixo) |
| Thumbnail area | `h-[240px] p-[24px] bg-[#888]` inset (sem bleed) |
| Thumbnail radius | `rounded-[8px]` interior |
| Card body padding | `p-[16px]` |
| Card body gap | `gap-[16px]` entre seções |
| Título ↔ Excerpt gap | `gap-[8px]` dentro do bloco de texto |
| Card title size | 18px Prompt SemiBold ("Paragraph Semibold") |
| Card excerpt size | 15px Prompt Regular ("Paragraph Small") |
| Cores confirmadas | `#171d1f` surface ✅, `#bcbcbc` muted ✅, `#81fe88` primary ✅ |

> **Nota sobre o breakpoint:** o frame Figma mostra apenas o layout desktop (1440px
> com 2 colunas de cards). Não há frames separados para 768px ou 360px no mesmo
> node. As regras responsivas da implementação (md:, xl:) são inferidas do design e
> das decisões de plano.

## Tabela de divergências (preenchida após leitura do Figma)

| # | Elemento | Figma | Implementação | Delta | Classificação | Arquivo:linha | Ação tomada |
|---|---|---|---|---|---|---|---|
| 1 | Padding acima da thumbnail | 0px (thumbnail flush) | 16px (`p-4` no article) | 16px | **CORRIGIR** | `PostCard.tsx:48` | ✅ Corrigido: removido `p-4` do article, adicionado wrapper `div.p-4` abaixo da thumbnail |
| 2 | Gap do content column | 56px (`gap-[56px]`) | 32px (`gap-8`) | 24px | **CORRIGIR** | `FeedTemplate.tsx:30` | ✅ Corrigido: `gap-8` → `gap-14` |
| 3 | Padding vertical `<main>` (desktop) | 56px (`py-[56px]` no frame) | 40px (`md:py-10`) | 16px | **CORRIGIR** | `FeedTemplate.tsx:29` | ✅ Corrigido: `md:py-10` → `md:py-14` |
| 4 | Padding vertical sidebar (desktop) | 40px (`py-[40px]`) | 24px (`py-6`) | 16px | **CORRIGIR** | `Sidebar.tsx:25` | ✅ Corrigido: adicionado `md:py-10` |
| 5 | Gap logo → nav sidebar (desktop) | 80px (`gap-[80px]`) | 24px (`gap-6`) | 56px | **CORRIGIR** | `Sidebar.tsx:25` | ✅ Corrigido: adicionado `md:gap-20` |
| 6 | Gap interno card body | 16px (`gap-[16px]`) | 12px (`gap-3`) | 4px | ACEITAR (≤8px) — mas corrigido ao restructurar | `PostCard.tsx:80` | ✅ Ajustado para `gap-4` (16px) no wrapper |
| 7 | Raio do card | 8px (`rounded-[8px]`) | 16px (`rounded-2xl`) | 8px | ACEITAR (= threshold; spec do plano usou `rounded-2xl`) | `PostCard.tsx:48` | — sem mudança |
| 8 | Tamanho título do card | 18px (Paragraph SemiBold) | 22px (`text-paragraph-lg`) | 4px | ACEITAR (≤8px) | `PostCard.tsx:66` | — sem mudança |
| 9 | Gap do grid entre cards | 24px | 24px (`gap-6`) | 0px | ACEITAR ✅ | `PostList.tsx:29` | — sem mudança |
| 10 | Largura coluna de conteúdo | 996px | `max-w-5xl` (1024px) | 28px | ACEITAR (sem token para 996px; valor arbitrário proibido) | `FeedTemplate.tsx:30` | — sem mudança |
| 11 | Largura sidebar (desktop) | 177px | 256px (`w-64`) | 79px | ACEITAR — nav horizontal×vertical é decisão de a11y do plano (tab stops, Esc handling) | `Sidebar.tsx:25` | — sem mudança |
| 12 | Layout nav items | vertical (ícone acima de texto) | horizontal (ícone + texto inline) | estrutural | ACEITAR — decisão de a11y do plano (nomes acessíveis únicos, contagem de tab controlada) | `NavItem.tsx` | — sem mudança |
| 13 | Tags no card | presentes (React, Front-end…) | ausentes | feature | ACEITAR — tags não estão no schema da API (`Post` model) | — | — sem mudança |
| 14 | Ações do card | code / share / comment | like (curtida) / comment | funcional | ACEITAR — spec de requisitos: curtida é a ação principal | `PostCard.tsx` | — sem mudança |
| 15 | Clamp título/resumo | Figma mostra altura uniforme dos cards | sem clamp | ∞ | ACEITAR — remoção deliberada por WCAG 1.4.12 (ver atualização 2026-10-05 em PaginaFeed.md) | `PostCard.tsx:72` | — sem mudança |
| 16 | "Publicar" button na sidebar | botão verde outlined | `NavItem` "Novo post" | estrutural | ACEITAR — plano usou NavItem para consistência e menor contagem de tab stops | `Sidebar.tsx` | — sem mudança |
| 17 | Thumbnail design | inset em `bg-[#888]` com padding interno | full-bleed `aspect-video` | estrutural | ACEITAR — design Figma é placeholder de editor de código; nosso approach funciona com imagens WebP reais | `PostThumbnail.tsx` | — sem mudança |

## Regras que prevalecem sobre o Figma

| Regra | Critério | Impacto |
|---|---|---|
| Sem `line-clamp` | WCAG 1.4.12 Text Spacing | Cards com altura variável — aceitável |
| Alvo de toque ≥ 40px | WCAG 2.5.8 Target Size | Button ghost padding garante ≥ 40px de área |
| Contraste ≥ 4.5:1 | WCAG 1.4.3 Contrast | Cores do projeto verificadas; nenhuma nova cor introduzida |
| Nenhum controle `disabled` na renderização inicial | Tab accessibility | LikeButton deslogado usa link, não botão disabled |

## Resultado final (2026-10-16)

**5 itens CORRIGIR aplicados** (usando apenas tokens Tailwind, sem valores arbitrários):
1. PostCard: thumbnail flush ao topo, content wrapper `div.flex.flex-col.gap-4.p-4`
2. FeedTemplate: `gap-8` → `gap-14` (content column)
3. FeedTemplate: `md:py-10` → `md:py-14` (main padding vertical desktop)
4. Sidebar: `md:py-10` adicionado (padding vertical desktop)
5. Sidebar: `md:gap-20` adicionado (gap logo→nav desktop)

**9 itens ACEITAR** (delta ≤ 8px, sem token disponível, ou decisão de a11y/funcionalidade)

**0 itens BLOQUEADO** (Figma lido com sucesso em 2026-10-16)
