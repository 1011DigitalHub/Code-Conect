# Plano: Página de Login (apps/web)

## Contexto
O `apps/web` hoje só tem um `App.tsx` placeholder. Vamos criar a página de Login do mockup (`public/Group 2086.png`) com Atomic Design e Tailwind v4, seguindo o CLAUDE.md. A página de Cadastro virá depois: ela usa o mesmo layout, mas com outro banner e outros campos. Por isso, layout, divisória social e rodapé vão ser genéricos. Ainda não existe endpoint de auth na API, então o formulário expõe um callback `onSubmit` e a página por enquanto só faz um stub, sem fetch.

Assets em `public/`, usados por URL absoluta (`/Banner_login_page.png`, `/Github-img.png`, `/Gmail-img.png`):
- O banner já inclui o logo "code connect", então não precisa de componente de logo.
- Logos sociais: `Github-img.png` e `Gmail-img.png` têm só o logo, sem texto. O `SocialButton` mostra o logo e, abaixo dele, o nome do provedor em texto.

> **Atualização (2026-09-30), troca das imagens sociais:** a primeira versão usava `Github.png`/`Gmail.png`. Essas imagens tinham só o nome escrito, sem o logo, e o resultado ficou ruim. Trocamos por `Github-img.png`/`Gmail-img.png`, colocamos o nome em texto visível abaixo do logo e apagamos os arquivos antigos de `public/`.

> **Atualização (2026-10-01), tokens no lugar de valores arbitrários:** as classes não usam mais valores arbitrários (`w-[...]`, `bg-[#...]`). Os tamanhos vão para o passo mais próximo da escala do Tailwind e as cores só usam nomes da paleta do projeto (regra registrada no `CLAUDE.md`). Nesta página, o erro do `FormField` e o contorno do `Input` inválido trocaram `red-400` pelo novo token `--color-danger` (passo 2). As mudanças de layout estão no plano `PaginaCadastro.md`.

> **Atualização (2026-10-01), assets otimizados:** `Banner_login_page.png` virou `Banner_login_page.webp` (de 1,29 MB para 55 KB) e o mockup `Group 2086.png` saiu de `public/` para `plan/assets/`, porque não é usado pela aplicação. Detalhes em `MelhoriasLighthouse.md`.

> **Atualização (2026-10-02), ligação com a API:** o campo "Email ou usuário" virou "Email" (`type="email"`), porque `POST /auth/login` só aceita email. O formulário ganhou `submitting` e `error`, e a página chama a API com Axios e vai para `/perfil`. Detalhes em `IntegracaoFrontBack.md`.

## 1. Test runner (exigido pelo CLAUDE.md antes de criar componentes)
- devDeps em `apps/web`: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- `vite.config.ts`: bloco `test` com `environment: 'jsdom'`, `globals: true`, `setupFiles: './src/test/setup.ts'` (esse arquivo importa `@testing-library/jest-dom/vitest`). Usar `/// <reference types="vitest/config" />`.
- `tsconfig.app.json`: incluir `vitest/globals` e `@testing-library/jest-dom` em `types`.
- Scripts: em `apps/web/package.json`, `"test": "vitest run"` e `"test:watch": "vitest"`. Na raiz, `"test:web": "pnpm --filter web test"`.

## 2. Tema (`src/index.css`, bloco `@theme`)
- Cores: `--color-page: #00090E`, `--color-surface: #171D1F`, `--color-primary: #81FE88`, `--color-input: #888888`, `--color-offwhite: #E1E1E1`, `--color-muted: #BCBCBC`, `--color-ink: #132E35` (texto do botão verde), `--color-danger: var(--color-red-400)` (mensagens de erro; adicionado em 2026-10-01). O `@theme` estende a paleta padrão, mas os componentes usam só esses nomes, nunca hex nem cores padrão (`red-400`) direto nas classes.
- Fonte `--font-sans: "Prompt", sans-serif`, carregada via Google Fonts no `index.html`. Também trocar `lang="pt-BR"` e o `<title>`.
- Base: `body` com `bg-page text-offwhite font-sans`.

## 3. Componentes (cada um em `Nome/Nome.tsx` + `Nome.test.tsx` + `index.ts`)

**atoms/**
- `Button`: props `variant: 'primary'` (fácil de estender), `fullWidth`, `icon?: ReactNode`, `type`. Os estilos vêm de um mapa de classes por variant.
- `Input`: repassa as props nativas de input (`forwardRef` não é necessário no React 19, `ref` já é prop). Fundo `bg-input`, texto escuro.
- `Label`: `htmlFor` + children.
- `Checkbox`: input checkbox estilizado com borda verde e check.
- `TextLink`: `<a>` com `variant: 'underline' | 'primary'` (o "Esqueci a senha" é sublinhado; o "Crie seu cadastro!" é verde).
- `Heading`: `level` 1/2 mapeado para tamanho ("Login" é h1, "Boas-vindas…" é o subtítulo).
- `Icon`: SVGs inline `arrow-right` e `clipboard`, com prop `name` e `aria-hidden`.

**molecules/**
- `FormField`: Label + Input + texto de erro opcional (`role="alert"`). Recebe `id`, `label` e o resto das props de input.
- `CheckboxField`: Checkbox + rótulo ("Lembrar-me").
- `SocialButton`: `<button>` em coluna, com o logo (`<img alt="">`, decorativo, `size-8`) e o nome em texto (`text-sm`) logo abaixo. O nome visível é o nome acessível do botão. Props: `name`, `icon` e `onClick`.
- `TextDivider`: linha, texto e linha ("ou entre com outras contas").

**organisms/**
- `LoginForm`: estado local de email/usuário, senha e lembrar-me. Renderiza os campos, a linha "Lembrar-me / Esqueci a senha" e o botão "Login →". Chama `onSubmit({ login, password, remember })` e recebe `forgotPasswordHref`.
- `SocialLogin`: TextDivider + lista de SocialButton vinda de uma prop `providers` (`[{ id, name, icon }]`), com `onSelect(id)`. Serve igual para o Cadastro.
- `AuthFooter`: `question` ("Ainda não tem conta?"), `linkLabel`, `href` e ícone. No Cadastro vira "Já tem conta? Faça login".

**templates/**
- `AuthTemplate`: card `bg-surface rounded-3xl` centralizado. À esquerda, `bannerSrc`/`bannerAlt`, com o banner escondido no mobile (`hidden md:block`). À direita, `title`, `subtitle` e `children`. Recebe `footer?` como slot. Todo o conteúdo específico (formulário, social, rodapé) entra por children/slots, então o Cadastro só troca banner, título e formulário.

**pages/**
- `src/pages/LoginPage/LoginPage.tsx` (+ test + index): monta o AuthTemplate com o banner de login, `LoginForm`, `SocialLogin` com Github/Gmail e `AuthFooter` apontando para `/cadastro`. Por enquanto os handlers de submit e social são stubs (`console.info`, com um TODO para ligar na API).
- `App.tsx` renderiza `<LoginPage />`. Ainda não vou adicionar router; quando o Cadastro chegar, introduzimos o `react-router`.

## 4. Testes essenciais (sempre por role, label ou texto)
- Button chama `onClick`. Input aceita digitação. Checkbox alterna. TextLink tem `href`. Icon renderiza oculto para leitores de tela.
- FormField associa o label ao input (`getByLabelText`) e mostra o erro. SocialButton: o nome aparece como texto visível, o logo tem o `src` certo e `alt=""`, e o clique dispara `onClick`.
- LoginForm: digitar, marcar e submeter chama `onSubmit` com os valores. SocialLogin: clicar em "Github" chama `onSelect('github')`. AuthFooter: link com texto e href.
- AuthTemplate renderiza título, subtítulo, banner (`getByRole('img', { name })`) e children. LoginPage renderiza o heading "Login", os campos e os botões Github/Gmail, carregando `/Github-img.png` e `/Gmail-img.png`.

## 5. Commits (Conventional Commits, um por passo lógico)
1. `build(web): set up vitest and testing library` (+ `chore(root): add test:web script`)
2. `style(web): add code connect theme tokens and font`
3. `feat(web): add auth atoms` · `feat(web): add auth molecules` · `feat(web): add login organisms` · `feat(web): add auth template` · `feat(web): add login page`

## Wiki

> **Nota retroativa (2026-10-20):** seção adicionada ao aplicar o plano `WikiObrigatorioNosPlanos.md`, que tornou a seção Wiki obrigatória em todos os planos. O conteúdo abaixo descreve o que deveria ter sido documentado na wiki quando este plano foi executado.

**Página afetada:** `Componentes-e-Design-System` (wiki do repositório)

- Nova seção **"Átomos de Autenticação"** listando `Button`, `Input`, `Label`, `Checkbox`, `TextLink`, `Heading` e `Icon` com props principais e variantes.
- Nova seção **"Moléculas de Autenticação"** listando `FormField`, `CheckboxField`, `SocialButton` e `TextDivider` com responsabilidades de composição.
- Nova seção **"Template `AuthTemplate`"** explicando o padrão de slot `children` / `footer` que permite reaproveitar o layout entre Login e Cadastro sem duplicar HTML.
- Tabela de tokens de cor do tema (`--color-page`, `--color-surface`, `--color-primary`, `--color-danger`, etc.) mapeados para seus valores hex originais — base para futuros planos de página que precisem referenciar a paleta.

## Verificação
- `pnpm test:web`: todos os testes passam.
- `pnpm lint` e `pnpm build` (o `tsc -b` precisa passar).
- `pnpm dev:web`: abrir no navegador e comparar com o mockup (desktop e largura mobile). Também testar navegação por teclado (Tab passa por campos, checkbox, links e botões) e conferir que o submit loga os valores.
