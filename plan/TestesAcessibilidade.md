# Plano: Testes de Acessibilidade (apps/web)

## Contexto
O projeto precisa atender à **WCAG 2.2 nível AA** (que inclui o nível A). Até aqui, as páginas de Login e Cadastro foram feitas pensando em acessibilidade (labels, `alt`, foco visível), mas nada verificava isso automaticamente. Este primeiro passo cria os testes automatizados para levantar os problemas. As correções ficam para um passo seguinte, que será registrado neste mesmo arquivo.

> **Atualização (2026-10-01), título corrigido:** o único problema levantado (2.4.2, título igual nas duas rotas) foi corrigido com o hook `src/pages/usePageTitle.ts` (+ teste). Ele define `document.title` como `<Página> | Code Connect`, e `LoginPage` e `SignUpPage` o chamam; os testes das duas páginas conferem o título. Não usamos o `<title>` do React 19, como estava proposto: o `index.html` já tem um `<title>`, e o navegador continuaria mostrando o primeiro. Agora as 30 verificações do navegador passam (2 rotas × 5 verificações × 3 larguras). Por causa dos travamentos do ambiente, elas foram confirmadas rodando um teste por vez.

> **Atualização (2026-10-01), `usePageMeta`:** o hook passou a se chamar `usePageMeta(página, descrição)` e também define a meta description (ver `MelhoriasLighthouse.md`). A lista de rotas saiu do `e2e/a11y.e2e.ts` e foi para `e2e/routes.ts`, compartilhada com a nova suíte `e2e/seo.e2e.ts`.

O jsdom do Vitest não calcula layout nem cores. Por isso, contraste, tamanho de alvo, reflow e foco visível só podem ser medidos num navegador real. Daí as duas camadas abaixo.

## 1. Camada de componentes (Vitest + axe-core)
- devDep `axe-core`.
- `src/test/wcag.ts`: lista de tags WCAG A/AA (`wcag2a` … `wcag22aa`) e um formatador das violações. É compartilhado pelas duas camadas.
- `src/test/axe.ts`: `expectNoA11yViolations(container)` roda o axe com essas tags. Contraste e tamanho de alvo ficam desligados aqui, porque dependem de layout.
- Cada um dos 20 arquivos de teste de componente e de página ganhou o caso `has no WCAG 2.2 AA violations`.

## 2. Camada de navegador (Playwright + @axe-core/playwright)
- devDeps `@playwright/test` e `@axe-core/playwright`, mais o Chromium (`pnpm --filter web exec playwright install chromium`).
- `playwright.config.ts`: roda sobre o build de produção (`vite build` + `vite preview` em `127.0.0.1:5174`) em três projetos, desktop 1440px, tablet 768px e mobile 320px. Usa `channel: 'chromium'` e `workers: 1` (ver "Problemas do ambiente").
- `e2e/a11y.e2e.ts` testa, para `/login` e `/cadastro`:
  - axe com todas as regras AA, incluindo contraste (1.4.3, 1.4.11) e tamanho de alvo (2.5.8);
  - 1.4.10 Reflow: sem rolagem horizontal;
  - 1.4.12 Espaçamento de texto: nenhum texto cortado com o espaçamento aumentado;
  - 2.4.2 Título da página: no formato `<Página> | Code Connect`;
  - 2.1.1 Teclado e 2.4.7 Foco visível: todo controle é alcançável com Tab e mostra o foco.
- Scripts: `test:a11y` em `apps/web` e `test:web:a11y` na raiz. `test-results/` e `playwright-report/` foram para o `.gitignore`.
- `tsconfig.node.json` passa a incluir `playwright.config.ts` e `e2e/`, com a lib `DOM` para os callbacks de `page.evaluate`.

## 3. Validação dos próprios testes
Antes de confiar nos resultados, conferi que as duas camadas reprovam violações conhecidas:
- Vitest: `<img>` sem `alt`, `<input>` sem label e `<button>` vazio geraram `image-alt`, `label` e `button-name`.
- Playwright: com elementos injetados na página, os testes acusaram `color-contrast`, `target-size`, overflow de 1560px e foco sem indicador.

## 4. Levantamento (2026-10-01)
| Verificação | Login | Cadastro |
|---|---|---|
| Componentes, axe A/AA (20 arquivos) | ok | ok |
| axe AA no navegador (contraste, alvo etc.), 3 larguras | ok | ok |
| 1.4.10 Reflow, 3 larguras | ok | ok |
| 1.4.12 Espaçamento de texto, 3 larguras | ok | ok |
| 2.1.1 / 2.4.7 Teclado e foco visível, 3 larguras | ok | ok |
| **2.4.2 Título da página** | **falha**: o título é "Code Connect" | **falha**: o título é "Code Connect" |

**Problema encontrado:** as duas rotas usam o mesmo `<title>` do `index.html`, que não identifica a página. Correção proposta (próximo passo): cada página define `document.title` (`Login | Code Connect`, `Cadastro | Code Connect`), por exemplo com o elemento `<title>` do React 19 dentro da página.

**Fora do alcance dos testes automáticos** (para a verificação manual):
- leitor de tela (NVDA);
- zoom de 200% (1.4.4);
- ordem de leitura e de foco fazendo sentido (1.3.2, 2.4.3);
- identificação e sugestão de erros nos formulários (3.3.1, 3.3.3). Os formulários ainda não validam campos; o `FormField` já tem a prop `error` com `role="alert"` e `aria-describedby`.

## 5. Problemas do ambiente (Windows)
- O Chromium "headless shell" para de responder ao segundo `Tab` quando o foco está num input. Resolvido com `channel: 'chromium'` (headless novo).
- Navegadores em paralelo travam o runner, por isso `workers: 1`. A suíte inteira leva cerca de 25s.
- Depois de um teste que falha, o runner pode travar ao reiniciar o navegador. Para listar todas as falhas, rode um teste por vez com `-g`.
- O servidor de dev do Vite escutava só em `::1` e a checagem de prontidão do Playwright travava em `localhost`. Por isso host e URL ficam fixos em `127.0.0.1`.

## 6. Commits (Conventional Commits)
1. `build(web): add axe-core and playwright for accessibility tests` (deps, config, scripts, `.gitignore`, `tsconfig.node.json`)
2. `test(web): check wcag 2.2 aa in component tests` (helpers e caso axe nos 20 arquivos)
3. `test(web): add browser accessibility suite for auth pages` (`e2e/a11y.e2e.ts`)
4. `docs(root): make wcag 2.2 aa the accessibility standard` (`CLAUDE.md`, este plano e o script `test:web:a11y` na raiz)

## Verificação
- `pnpm test:web`: 54 testes passam, incluindo os 20 casos axe e o teste do `usePageTitle`.
- `pnpm test:web:a11y`: todas as verificações passam depois da correção do título (antes, só o teste de título falhava, nas duas rotas).
- `pnpm lint` e `pnpm build` passam (o `tsc -b` agora também verifica `e2e/`).
