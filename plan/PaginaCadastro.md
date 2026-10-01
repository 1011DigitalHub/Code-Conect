# Plano: Página de Cadastro (apps/web)

## Contexto
A página de Login já existe (`LoginPage` + `AuthTemplate`, `LoginForm`, `SocialLogin`, `AuthFooter`, átomos e moléculas). O próximo passo é a página de Cadastro do Figma (`CodeConnect---ALURA`, frame `Cadastro` 155:3469 no desktop, mais as versões tablet 155:3344 e mobile 155:3220). Ela usa o mesmo layout do Login, mudando o banner, o título, os campos (Nome, Email, Senha, Lembrar-me), o botão "Cadastrar →" e o rodapé "Já tem conta? Faça seu login!".

O Login foi feito a partir do mockup `public/Group 2086.png`, não do Figma. Comparei com o frame `Login` do Figma (155:3785) e encontrei diferenças nos componentes compartilhados. Elas serão corrigidas neste mesmo trabalho, e por isso o Login também muda.

Também é a hora de adicionar o `react-router`, como o plano do Login já previa.

> **Atualização (2026-10-01), ajustes durante a implementação:**
> - O check do `Checkbox` passou a ser o SVG exportado do Figma (`public/icons/check.svg`), no lugar do SVG desenhado à mão, para seguir o design à risca.
> - O `Icon` ganhou a prop `size: 'sm' | 'md'`. O padrão `md` tem 24px e é usado no rodapé. O `sm`, de 18px, é a seta dos botões: no Figma ela tem 18px, e passar tudo para 24px deixaria a seta grande demais.
> - O `AuthTemplate` ganhou a prop `bannerFocus: 'center' | 'center-right'`. No desktop, o Figma recorta a foto do Cadastro um pouco à direita do centro (`object-position` ≈ 60%), enquanto a do Login fica centralizada.
> - Os dois símbolos de fundo usam as mesmas SVGs (`public/symbol/`): no Figma eles têm a mesma forma e diferem só por 1px na altura.
> - No `LoginForm` e no `SignUpForm`, a linha "Lembrar-me" fica a 8px do campo de senha, como no Figma (antes eram 16px).

### Diferenças entre o implementado e o Figma (valem para Login e Cadastro)
| Item | Hoje | Figma |
|---|---|---|
| Título h1 / subtítulo h2 | 36px / 24px | 31px semibold / 22px |
| Input | `rounded-md`, `py-2.5`, 16px, placeholder `ink/70` | 4px de raio, `py-2`, 15px, placeholder `#171D1F` (surface) |
| Checkbox | 20px, borda 1px `muted`, verde quando marcado | borda 2px `#888`, `p-1` e check de 16px verde (`#81FE88`), 28px no total |
| Label "Lembrar-me" | 14px `muted` (#BCBCBC) | 15px `#888` |
| "Esqueci a senha" e texto da divisória | 14px | 15px |
| Button | `rounded-md`, `px-6` | 8px de raio, `px-4 py-3` |
| Nome do SocialButton | 14px | 12.5px |
| Divisória | `border-muted`, gap de 12px até os botões | linha `#E1E1E1`, gap de 8px |
| Ícone do rodapé | 20px | 24px |
| Pergunta do rodapé no Login | 16px | 15px |
| Espaço entre o último campo e o botão | 40px | 32px |
| Rodapé até o bloco de cima | 32px | 24px |
| Card | sem borda, `p-14` | borda de 1px `#00090E`, `px-[78px] py-14`, banner de 407px e coluna do formulário de 410px com `px-8` |
| Fundo da página | liso | dois símbolos "code connect" decorativos (`#132E35`, opacidade 30%): um no canto superior esquerdo, outro no inferior direito |
| Banner | PNG com o logo já embutido; escondido no mobile (`hidden md:block`) | foto mais o logo sobreposto e centralizado embaixo; **aparece em tablet e mobile**, acima do formulário e recortado em paisagem |
| Rodapé | só em coluna e centralizado | Login: em coluna e centralizado. Cadastro: **na mesma linha e alinhado à esquerda** ("Já tem conta? Faça seu login! ⇥"), quebrando em coluna no mobile |

## 1. Roteamento
- Adicionar a dependência `react-router` em `apps/web`.
- `App.tsx` passa a usar `BrowserRouter` + `Routes`: `/` e `/login` levam ao `LoginPage`, e `/cadastro` leva ao `SignUpPage`.
- `TextLink` passa a renderizar o `Link` do react-router, mantendo a prop `href` para não mudar quem já usa o componente. Assim a navegação entre Login e Cadastro não recarrega a página.
- Criar o helper de teste `src/test/renderWithRouter.tsx` (envolve o componente em `MemoryRouter`). Os testes que renderizam links passam a usá-lo: TextLink, AuthFooter, LoginForm, LoginPage e SignUpPage.

## 2. Tema (`src/index.css`)
- Criar tokens de tipografia com os nomes do guia de estilos do Figma, com `--text-*` e line-height 1.5: `--text-subtitle: 1.9375rem` (31px), `--text-paragraph-lg: 1.375rem` (22px), `--text-paragraph-sm: 0.9375rem` (15px), `--text-label: 0.78125rem` (12.5px). Os 18px continuam como `text-lg`.
- As cores não mudam. `#888` (`input`), `#171D1F` (`surface`) e `#132E35` (`ink`) já existem.

## 3. Assets (`public/`)
Baixados uma única vez pelas URLs de asset do Figma MCP:
- `Banner_cadastro_page.png`: foto do Cadastro, sem o logo.
- `Banner_login_page.png`: substituído pela foto do Login **sem** o logo embutido. Agora o logo vem do template, então não aparece duplicado e não é cortado no recorte de tablet e mobile.
- `logo/`: as 3 partes SVG do logo "code connect".
- `symbol/`: as 2 partes SVG do símbolo de fundo.

As SVGs ficam como vieram, sem editar paths, e são montadas pelos componentes abaixo.

## 4. Componentes

**atoms/** (ajustes)
- `Heading`, `Input`, `Checkbox`, `Button`, `TextLink`: estilos alinhados à tabela acima. Usam os tokens novos, sem valores fixos espalhados.
- `Icon`: adicionar `login` (o "⇥" do rodapé do Cadastro). `clipboard` continua sendo o "assignment" do Login. O tamanho passa para `size-6` (24px).
- **Novo** `Logo`: logo "code connect" de 127×40, montado com as 3 SVGs nas posições do Figma, com `role="img"` e `aria-label="Code Connect"`.
- **Novo** `BrandSymbol`: o símbolo decorativo de fundo (2 SVGs), com `aria-hidden`.

**molecules/** (ajustes)
- `CheckboxField`: label com 15px e cor `input`.
- `TextDivider`: linha `offwhite` e texto de 15px.
- `SocialButton`: nome com o token `text-label`.

**organisms/**
- **Novo** `SignUpForm`: estado local de `name`, `email`, `password` e `remember`. Reaproveita `FormField` (`autoComplete` `name`, `email` e `new-password`; email com `type="email"`), `CheckboxField` e o `Button` com o ícone `arrow-right`. Chama `onSubmit({ name, email, password, remember })`. Ele fica separado do `LoginForm` porque os campos e as regras são diferentes; o que se repete entre os dois já está nas moléculas.
- `LoginForm`: só o ajuste de espaçamento (o botão fica a 32px do último campo).
- `AuthFooter`: nova prop `layout: 'stacked' | 'inline'` (padrão `stacked`, que mantém o Login). O `inline` coloca a pergunta e o link na mesma linha, alinhados à esquerda, e quebra em coluna no mobile. Os estilos vêm de um mapa de classes por layout, como os outros variants.
- `SocialLogin`: o gap passa a 8px. O componente serve igual para o Cadastro.

**templates/**
- `AuthTemplate`:
  - **Layout**: em telas grandes (`lg:flex-row`), banner de 407px e coluna de 410px. Em tablet e mobile, banner em cima com recorte paisagem (`object-cover`) e formulário embaixo. Ganha a borda do card e o novo padding.
  - **Banner e fundo**: o banner é a foto com o `Logo` sobreposto embaixo, no centro. Os dois `BrandSymbol` ficam no fundo da página (`absolute`, `pointer-events-none`).
  - **API**: continua a mesma (`bannerSrc`, `bannerAlt`, `title`, `subtitle`, `children`, `footer`).

**pages/**
- **Novo** `src/pages/SignUpPage/` (+ teste + index): monta o `AuthTemplate` com `/Banner_cadastro_page.png`, título "Cadastro", subtítulo "Olá! Preencha seus dados.", `SignUpForm`, `SocialLogin` com os mesmos provedores do Login e `AuthFooter layout="inline"`, com o texto "Já tem conta?", o link "Faça seu login!" para `/login` e o ícone `login`. Os handlers são stubs com `console.info` e um TODO para ligar na API, igual ao Login.
- A lista `socialProviders`, hoje duplicada entre as páginas, vai para `src/pages/socialProviders.ts`.

## 5. Testes essenciais (por role, label ou texto)
- **Logo:** `getByRole('img', { name: 'Code Connect' })`.
- **BrandSymbol:** fica fora da árvore de acessibilidade.
- **Icon:** renderiza `login`.
- **SignUpForm:** digitar nome, email e senha, marcar "Lembrar-me" e clicar em "Cadastrar" chama `onSubmit` com os valores. O campo de senha tem `type="password"`.
- **AuthFooter:** no `inline`, a pergunta e o link aparecem com o `href` certo.
- **AuthTemplate:** além do que já testa, mostra o logo.
- **SignUpPage:** heading "Cadastro"; labels Nome, Email e Senha; botões Cadastrar, Github e Gmail; link "Faça seu login!" para `/login`.
- **Atualizar os testes atuais:** LoginPage, LoginForm, AuthFooter e TextLink passam a usar o `renderWithRouter`. O Checkbox continua alternando.

## 6. Commits (Conventional Commits)
Em `main`, como no Login:
1. `build(web): add react-router`
2. `style(web): add typography tokens from figma style guide`
3. `fix(web): align auth atoms and molecules with figma`
4. `feat(web): add logo and brand symbol atoms` (inclui os assets SVG)
5. `feat(web): add sign-up form organism and inline auth footer`
6. `fix(web): match auth template to figma layout` (banner com logo sobreposto, símbolos e versão responsiva; inclui a troca do `Banner_login_page.png`)
7. `feat(web): add sign-up page and routes`
8. `docs(root): add PaginaCadastro plan`

## Verificação
- `pnpm test:web`, `pnpm lint` e `pnpm build` passam.
- Rodar `pnpm dev:web` e abrir `/login` e `/cadastro` em 1440px, 768px e 360px, comparando com os frames do Figma (Login 155:3785/155:3661/155:3537; Cadastro 155:3469/155:3344/155:3220).
- Conferir que banner, logo, símbolos e ícones sociais carregam do `public/`, sem URL do Figma no código.
- Navegar entre as páginas pelos links do rodapé sem recarregar a página.
- Percorrer tudo com Tab e conferir que o submit loga os valores.
