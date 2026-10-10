# Frontend: Acessibilidade (WCAG 2.2 AA) e SEO

> **Publico-alvo:** analistas juniores / trainees.

---

## Conceito Teorico

### O que e WCAG e por que AA?

**WCAG** (Web Content Accessibility Guidelines) e o conjunto de diretrizes internacionais de acessibilidade web, publicado pelo W3C. A versao 2.2 tem tres niveis de conformidade:

- **A** — criterios minimos. Sem eles, o conteudo e inacessivel para alguns usuarios.
- **AA** — criterios intermediarios. E o nivel exigido pela maioria das legislacoes de acessibilidade (incluindo a LBI brasileira, Lei 13.146/2015) e o padrao da industria.
- **AAA** — criterios mais exigentes. Dificeis de satisfazer universalmente; nao sao requisito do projeto.

O Code Connect adota **WCAG 2.2 nivel AA** como contrato: uma feature que quebra um criterio AA nao esta pronta, mesmo que funcione.

### Por que acessibilidade ajuda a todos

Acessibilidade nao serve so a usuarios com deficiencia permanente. O mesmo criterio que beneficia um usuario com baixa visao (contraste 4.5:1) tambem ajuda alguem lendo o celular ao sol. O mesmo criterio que beneficia um usuario com mobilidade reduzida (navegacao por teclado) tambem ajuda um desenvolvedor preenchendo formularios sem tirar as maos do teclado.

A abordagem de **duas camadas de testes automatizados** do projeto garante que regressoes sejam pegas cedo, antes que cheguem ao browser do usuario.

### O que e SEO e por que importa para uma SPA?

**SEO** (Search Engine Optimization) e o conjunto de praticas que tornam um site descobrivel e bem ranqueado em buscadores. Para uma SPA (Single Page Application) React, ha desafios especificos:

- O HTML inicial servido pelo servidor e quasi-vazio (so tem `<div id="root">`). O conteudo e injetado por JavaScript apos o carregamento.
- Crawlers modernos (Google, Bing) conseguem executar JavaScript, mas levam mais tempo e tem um budget de processamento limitado.
- **Metadados de pagina** (`<title>`, `<meta name="description">`) precisam ser atualizados via JavaScript para cada rota — o HTML static nao e suficiente.

O projeto resolve isso com `usePageMeta`, sem Server-Side Rendering.

---

## Aplicacao no Code Connect

### A piramide de testes de acessibilidade

O projeto usa duas camadas, complementares:

| Camada | Ferramenta | Ambiente | Pega |
|--------|-----------|----------|------|
| Componente | Vitest + axe-core | jsdom | Estrutura HTML, ARIA, labels, ordem de headings |
| Pagina | Playwright + axe-core | Chromium real | Contraste de cores, tamanho de alvo, reflow, text-spacing |

Nenhuma camada substitui a outra. jsdom nao tem layout — nao da para calcular contraste de cores sem pixels reais. O Playwright nao testa componentes isolados — e mais lento e menos granular para desenvolvimento.

### Camada 1: `expectNoA11yViolations` nos testes de componente

O arquivo `apps/web/src/test/axe.ts` encapsula a verificacao axe:

```typescript
// axe.ts (linhas 6-16)
const RULES_NEEDING_A_BROWSER = ['color-contrast', 'target-size']

export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: WCAG_AA_TAGS },
    rules: Object.fromEntries(RULES_NEEDING_A_BROWSER.map((id) => [id, { enabled: false }])),
  })
  const report = formatViolations(results.violations)
  expect(report, report.join('\n')).toEqual([])
}
```

As regras `color-contrast` e `target-size` sao desabilitadas aqui porque jsdom nao tem layout — rodadas num DOM sem renderizacao real, essas regras produzem falsos positivos. Elas sao verificadas pela camada Playwright.

Os `WCAG_AA_TAGS` cobrem todos os criterios A e AA das versoes 2.0, 2.1 e 2.2:

```typescript
// wcag.ts (linha 3)
export const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
```

Todo arquivo `*.test.tsx` de componente tem um caso dedicado:
```typescript
it('has no WCAG 2.2 AA violations', async () => {
  // renderiza o componente e chama expectNoA11yViolations
})
```

### Camada 2: Playwright em browser real (a11y.e2e.ts)

O `apps/web/e2e/a11y.e2e.ts` itera sobre todas as rotas publicas definidas em `e2e/routes.ts` e verifica quatro criterios por rota:

**1. Nenhuma violacao axe AA (incluindo contraste e tamanho de alvo):**
```typescript
// a11y.e2e.ts (linhas 23-27)
test('has no WCAG 2.2 AA violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
  const report = formatViolations(results.violations)
  expect(report, report.join('\n')).toEqual([])
})
```

**2. Reflow sem scrolling horizontal (WCAG 1.4.10):**
Verifica que em viewport de 320px o conteudo nao extrapola a largura. Um usuario com baixa visao que usa 400% de zoom tem efetivamente um viewport estreito.

**3. Text Spacing sem cortes (WCAG 1.4.12):**
```typescript
// a11y.e2e.ts (linhas 7-14)
const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`
```
O teste injeta esse CSS via `page.addStyleTag` e verifica que nenhum texto fica `overflow: hidden` ou cortado. E por isso que `style-src` permite `'unsafe-inline'` no CSP — restricao de ferramenta de teste, nao de feature. `script-src` continua sem `'unsafe-inline'`.

**4. Titulo de pagina (WCAG 2.4.2):**
```typescript
await expect(page).toHaveTitle(new RegExp(`^${route.name}\\b.*Code Connect`))
```
Cada pagina precisa ter um titulo que comece com o nome da pagina e contenha "Code Connect".

### O `e2e/routes.ts`: fonte unica de verdade

```typescript
// routes.ts (linhas 11-20)
export const routes = [
  { name: 'Feed', path: '/' },
  { name: 'Login', path: '/login' },
  { name: 'Cadastro', path: '/cadastro' },
  { name: 'Componentes React na prática', path: '/posts/componentes-react-na-pratica' },
  { name: 'Página não encontrada', path: '/essa-rota-nao-existe' },
]
```

Este arquivo e importado por `a11y.e2e.ts`, `seo.e2e.ts`, `security.e2e.ts` e pelo `lighthouserc.cjs` do Lighthouse CI. **Toda nova rota publica deve ser adicionada aqui** — sem isso, ela nao e auditada por nenhuma dessas suites automaticamente.

Rotas privadas (`/perfil`, `/posts/novo`) sao ausentes propositalmente: elas redirecionam visitantes anonimos para `/login`, entao uma auditoria anonima mediria a tela de login, nao a pagina real.

### Formularios acessiveis: o componente `FormField`

O projeto encapsula o padrao de campo acessivel no `FormField`:

```typescript
// FormField.tsx (linhas 11-37)
export function FormField({ id, label, error, hint, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId  = `${id}-hint`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && <p id={hintId} className="text-label text-muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  )
}
```

O que este componente garante automaticamente:
- `<Label htmlFor={id}>` — associacao programatica entre label e input (WCAG 1.3.1 e 3.3.2)
- `aria-describedby` — o input anuncia o erro e/ou hint para leitores de tela
- `role="alert"` no elemento de erro — o leitor de tela anuncia o erro imediatamente quando ele aparece (sem o usuario navegar ate ele)
- `invalid={Boolean(error)}` — o `Input` adiciona `aria-invalid="true"` quando ha erro, alem de estilos visuais

Nao use apenas cor para indicar erro — o `aria-invalid` e o `role="alert"` garantem que a informacao chega por mais de um canal.

### Metadados de pagina: `usePageMeta`

```typescript
// usePageMeta.ts (linhas 8-20)
export function usePageMeta(page: string, description: string) {
  useEffect(() => {
    document.title = `${page} | ${SITE_NAME}`

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.append(meta)
    }
    meta.content = description
  }, [page, description])
}
```

Cada pagina chama este hook com o titulo da pagina e uma descricao unica de 50-160 caracteres em pt-BR. O hook:
1. Define `document.title` no formato `<Pagina> | Code Connect` — criterio WCAG 2.4.2 (Page Titled)
2. Atualiza o `<meta name="description">` — relevante para SEO (Google usa a descricao no snippet de busca)

**Por que `useEffect` e nao `<title>` do React 19?** O `index.html` ja tem um `<title>` e uma `<meta name="description">` padrao. O React 19 tem suporte nativo a `<title>` em componentes, mas `document.title` via `useEffect` e mais simples e mais testavel neste projeto.

O `e2e/seo.e2e.ts` verifica que a descricao tem entre 50 e 160 caracteres e que ha exatamente uma `<meta name="description">` por pagina.

### Verificacao de headers de seguranca

O `e2e/security.e2e.ts` verifica que os headers configurados em `vite.config.ts`'s `preview.headers` estao presentes e corretos. O ponto mais importante:

```typescript
// security.e2e.ts (linha 31)
expect(directives['script-src']).not.toContain("'unsafe-inline'")
```

O Lighthouse **nao pega** uma CSP ausente ou quebrada — o audit de CSP e informacional, nao pontuado. Esta suite e a unica guarda automatizada real para isso.

### Metas do Lighthouse e como medir

| Categoria | Meta |
|-----------|------|
| Performance | ≥ 90 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| TBT | ≤ 200 ms |

O Lighthouse CI roda no workflow `lighthouse.yml` em todo PR que toca `apps/web/**`. Localmente, a CLI do Lighthouse trava nesta maquina Windows; use o Chrome DevTools (F12 → Lighthouse) em vez disso.

**Importante**: sempre medir no **build de producao** (`pnpm web build` → `vite preview`). O `vite dev` serve bundles nao-minificados que produzem falsos alertas de performance.

---

## Erros Comuns e Armadilhas

### 1. Adicionar uma nova rota sem atualizar `e2e/routes.ts`

A nova pagina nao sera auditada por nenhuma das tres suites (`a11y`, `seo`, `security`) nem pelo Lighthouse CI. E uma regressao silenciosa: CI continua verde, mas a nova rota nunca e verificada. Toda rota publica nova entra em `routes.ts` no mesmo PR.

### 2. Usar `aria-label` quando ha texto visivel

`aria-label` substitui o texto visivel para leitores de tela. Se o elemento ja tem texto visivel (um botao com o texto "Enviar"), adicionar `aria-label="Enviar formulario"` faz o leitor de tela anunciar algo diferente do que o usuario vidente le. Use `aria-labelledby` para referenciar texto existente, ou simplesmente deixe o texto visivel ser o nome acessivel.

### 3. Remover o outline de foco sem alternativa

```css
/* Nao faca isso */
button:focus { outline: none; }
```

O focus ring e o mecanismo pelo qual usuarios de teclado sabem onde estao. O projeto usa `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary` — o outline aparece apenas com navegacao por teclado, nao com o clique do mouse. Nunca remova sem adicionar um replacement visual.

### 4. Nao verificar as "duas fontes de verdade" de acessibilidade

Alguns erros so aparecem em contexto de pagina real (contraste dependendo do background real, tamanho de alvo com padding computado). Outros so aparecem no componente isolado (label faltando, ARIA mal formado). Os dois niveis sao necessarios; nenhum substitui o outro.

### 5. Auditar o `vite dev` no Lighthouse

O servidor de dev serve bundles de desenvolvimento nao-minificados (varios MB). O Lighthouse vai reclamar de "Minify JavaScript", "Unused JavaScript" e "Total byte weight" que nao existem no build de producao. Sempre use `pnpm web build` + `vite preview`.

### 6. Colocar a descricao meta fora do range 50-160 caracteres

`seo.e2e.ts` falha se a descricao tiver menos de 50 ou mais de 160 caracteres. Muito curta: o Google ignora ou gera a propria. Muito longa: o Google trunca no snippet. Escreva a descricao unica por pagina, em pt-BR, descrevendo o conteudo especifico daquela tela.

### 7. Bloquear o zoom no viewport meta

```html
<!-- Nao faca isso -->
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
```

`user-scalable=no` impede que usuarios com baixa visao aumentem o zoom — violacao do criterio WCAG 1.4.4 (Resize Text). O `index.html` do projeto nao tem essa restricao e nao deve tela-la.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Tags WCAG AA para axe (`WCAG_AA_TAGS`) | `apps/web/src/test/wcag.ts` | linha 3 |
| `expectNoA11yViolations` (regras desabilitadas em jsdom) | `apps/web/src/test/axe.ts` | linhas 6-16 |
| Suite Playwright: axe, reflow, text-spacing, titulo | `apps/web/e2e/a11y.e2e.ts` | todos |
| CSS de Text Spacing injetado pelo Playwright | `apps/web/e2e/a11y.e2e.ts` | linhas 7-14 |
| `e2e/routes.ts` (fonte unica para a11y, seo, security, Lighthouse) | `apps/web/e2e/routes.ts` | todos |
| Suite SEO: descricao 50-160 chars, robots.txt, llms.txt | `apps/web/e2e/seo.e2e.ts` | todos |
| Suite de headers de seguranca (CSP, HSTS, etc.) | `apps/web/e2e/security.e2e.ts` | todos |
| `script-src` sem `unsafe-inline` (verificacao real de CSP) | `apps/web/e2e/security.e2e.ts` | linha 31 |
| `usePageMeta` (title + meta description por rota) | `apps/web/src/pages/usePageMeta.ts` | todos |
| `FormField` (label + aria-describedby + role="alert") | `apps/web/src/components/molecules/FormField/FormField.tsx` | linhas 11-37 |
| Headers de seguranca no `vite preview` | `apps/web/vite.config.ts` | linhas 22-38 |
| Metas do Lighthouse CI e como medir | `.github/ai-guidelines/frontend-ux-seo.md` | secao "Performance and SEO" |
| Regras WCAG e HTML semantico | `.github/ai-guidelines/frontend-ux-seo.md` | secao "Rules when building UI" |

---

_Ultima atualizacao: 2026-10-09 | Gerado a partir do codigo-fonte._
