# Frontend: Atomic Design e Arquitetura de Componentes

> **Público-alvo:** analistas juniores / trainees.

## Conceito Teórico

### O que é Atomic Design?

Imagine que você está construindo com peças de LEGO. Existem peças minúsculas (tijolos, pinos), peças médias feitas de tijolos colados (um muro, uma janela) e estruturas grandes formadas por essas peças médias (uma casa). A metodologia **Atomic Design**, criada por Brad Frost, usa exatamente essa lógica para organizar interfaces de usuário.

A hierarquia tem cinco níveis:

| Nível | Analogia | Responsabilidade |
|-------|----------|-----------------|
| **Atoms** (átomos) | Tijolo individual | O menor elemento de UI impossível de dividir mais: um botão, um campo de texto, um ícone. |
| **Molecules** (moléculas) | Janela = vidro + marco + dobradiça | Dois ou mais átomos com uma função coesa: um campo de formulário com label + input + mensagem de erro. |
| **Organisms** (organismos) | Fachada completa | Uma seção autônoma e reutilizável: um card de post, uma barra lateral de navegação. |
| **Templates** (templates) | Planta arquitetônica | Define o layout da página — onde fica o menu, onde fica o conteúdo principal — sem dados reais. |
| **Pages** (páginas) | Casa mobiliada | Une o template com dados reais; é quem chama a API e passa tudo para baixo. |

### A Regra de Importação: por que um nível inferior nunca importa de um superior?

A regra mais importante do Atomic Design é: **um componente só pode importar de níveis iguais ou inferiores, nunca superiores**.

- Um átomo **não** importa uma molécula.
- Uma molécula **não** importa um organismo.
- Um organismo **não** importa um template.

**Por quê?** Imagine que o `Button` (átomo) importasse `FormField` (molécula). Se você quiser usar `Button` em outro projeto, seria forçado a arrastar `FormField` junto, mesmo sem precisar dela. A dependência "de baixo para cima" cria acoplamento desnecessário e torna os componentes menores impossíveis de reusar isoladamente.

A direção correta é sempre de cima para baixo: templates e páginas montam organismos, organismos montam moléculas, moléculas montam átomos. Cada nível sabe o que está "abaixo" dele, mas é completamente cego ao que está "acima".

### Separação de Responsabilidades: quem busca os dados?

Uma dúvida comum é: *onde eu coloco a chamada `axios.get('/api/posts')`?* A resposta no Code Connect é: **exclusivamente nas páginas**.

- **Átomos, moléculas, organismos e templates** recebem dados via props. Eles apenas renderizam.
- **Páginas** são as únicas que chamam hooks de dados (`useFeed`, `useSession`, etc.), que por sua vez chamam o `src/api/`.

**Por quê essa separação?** Porque um organismo que busca dados por conta própria se torna impossível de testar sem uma rede real, impossível de reusar com dados diferentes e cria acoplamento com a API que deveria ser invisível para ele. A página funciona como o "gerente de projeto": ela busca tudo, distribui para os componentes certos e mantém o estado.

---

## Aplicação no Code Connect

### Convenção de Pasta: ComponentName/ComponentName.tsx + index.ts

Cada componente vive em sua própria pasta com três arquivos:

```
Button/
  Button.tsx        ← implementação
  Button.test.tsx   ← testes unitários
  index.ts          ← re-exporta: export { Button } from './Button'
```

O `index.ts` é a "porta de entrada" pública. Ao importar `Button`, o consumidor escreve:

```ts
import { Button } from '../../atoms/Button'
// e não:
import { Button } from '../../atoms/Button/Button'
```

Isso cria um contrato: o que está no `index.ts` é a API pública do componente. A implementação interna pode mudar sem quebrar quem importa.

---

### Átomo: `Button` com CVA

**CVA (class-variance-authority)** é uma biblioteca que resolve o problema de gerenciar variantes de estilo sem espalhar condicionais por todo o código.

Sem CVA, você poderia escrever algo assim:

```tsx
// ❌ Frágil: condicionais soltas, fácil errar
function Button({ variant, fullWidth, children }) {
  let className = 'inline-flex rounded-lg px-4 py-3 font-semibold'
  if (variant === 'primary') className += ' bg-primary text-ink'
  if (variant === 'ghost') className += ' bg-transparent text-offwhite'
  if (fullWidth) className += ' w-full'
  return <button className={className}>{children}</button>
}
```

Com CVA, as variantes são declaradas como **dados estruturados**:

```tsx
// ✅ CVA: variantes como dados
const button = cva(
  // classes base (sempre aplicadas)
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 ...',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-ink hover:brightness-95 ...',
        ghost:   'bg-transparent text-offwhite hover:text-primary ...',
      },
      fullWidth: {
        true:  'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', fullWidth: false },
  },
)
```

Benefícios:

1. **TypeScript automático**: `VariantProps<typeof button>` gera o tipo das props sem esforço manual.
2. **Conflitos eliminados**: CVA combina classes sem duplicatas.
3. **Legibilidade**: um novo dev olha a definição e entende todos os estados possíveis de uma vez.
4. **`className` bloqueado**: o tipo `ButtonProps` usa `Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>`, impedindo que quem chama `Button` passe classes avulsas e quebre o sistema de design.

O `Button` também aceita `type = 'button'` como padrão — diferente do HTML nativo, que usa `type="submit"` como default dentro de `<form>`. Esse detalhe evita submissões acidentais de formulário.

---

### Átomo: `Input` com a variante `invalid`

O `Input` segue o mesmo padrão CVA, mas com uma variante booleana `invalid`:

```tsx
const input = cva(
  'w-full rounded bg-input px-4 py-2 ...',
  {
    variants: {
      invalid: {
        true:  'outline-2 outline-danger',
        false: '',
      },
    },
    defaultVariants: { invalid: false },
  },
)

export function Input({ invalid, ...props }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={input({ invalid })} {...props} />
}
```

Dois pontos importantes:

1. **`aria-invalid`**: O atributo de acessibilidade é derivado automaticamente de `invalid`. Leitores de tela anunciam "campo inválido" quando o usuário navega com Tab.
2. **`undefined` em vez de `false`**: `aria-invalid={false}` seria renderizado como `aria-invalid="false"` no HTML, o que não é semanticamente neutro em todos os leitores de tela. `undefined` remove o atributo completamente.

---

### Átomo: `TextLink` com validação de origem

O `TextLink` usa o componente `<Link>` do React Router para navegação client-side (sem recarregar a página), mas adiciona uma camada de segurança crítica:

```tsx
const ORIGIN_CHECK_BASE = 'https://textlink.invalid'

export function TextLink({ href, variant, ...props }: TextLinkProps) {
  let resolvedOrigin: string
  try {
    resolvedOrigin = new URL(href, ORIGIN_CHECK_BASE).origin
  } catch {
    resolvedOrigin = ''
  }
  if (!href.startsWith('/') || resolvedOrigin !== ORIGIN_CHECK_BASE) {
    throw new Error(`TextLink: href must be a same-origin path starting with "/", got "${href}"`)
  }

  return <Link to={href} className={textLink({ variant })} {...props} />
}
```

**Por que isso protege contra XSS via href dinâmico?**

O feed constrói URLs a partir de dados da API: `/posts/${post.slug}`. Se um dado malicioso chegasse como `javascript:alert(1)` ou `//evil.example`, o `<Link>` do React Router executaria ou redirecionaria para o destino sem reclamar.

A abordagem do Code Connect **não** usa uma lista negra de prefixos proibidos (que é fácil de burlar com variantes como `//evil.example`, `/\evil.example`, ou `/\t/evil.example`). Em vez disso, ela valida pelo **resultado da resolução**: passa o `href` pelo mesmo parser de URL que o navegador usa e exige que o destino final seja na mesma origem-base fictícia. Se o href não começar com `/` ou sair da origem, a exceção é lançada no momento do render — falhando ruidosamente em vez de silenciosamente se tornar um vetor de ataque.

---

### Átomo: `CodeBlock` — código sem markup

O `CodeBlock` renderiza um trecho de código como texto puro dentro de `<pre><code>`, sem interpretação de HTML e sem syntax highlighting.

```tsx
// apps/web/src/components/atoms/CodeBlock/CodeBlock.tsx
export function CodeBlock({ code }: CodeBlockProps) {
  return (
    <pre className="bg-surface overflow-x-auto rounded-lg p-4">
      <code className="font-mono text-sm text-offwhite whitespace-pre">{code}</code>
    </pre>
  )
}
```

Decisões de design:

- **Sem `dangerouslySetInnerHTML`**: o conteúdo vem da API como texto bruto. Renderizá-lo via `dangerouslySetInnerHTML` abriria um vetor de XSS — `<script>alert(1)</script>` seria executado. React escapa automaticamente strings em `{code}`.
- **Sem syntax highlighting**: a biblioteca mais leve (Prism, highlight.js) adiciona dezenas de kB ao bundle para um benefício estético, não funcional. O requisito do Figma é exibir o código com fidelidade tipográfica, não colorizá-lo.
- **`font-mono`**: usa o token `--font-mono: "Roboto Mono", monospace` definido em `index.css`. O token permite trocar a fonte em um único lugar se o design evoluir.
- **`overflow-x-auto`**: linhas longas de código não quebram o layout — o bloco rola horizontalmente em vez de ultrapassar a borda da coluna.

Quando usar: sempre que precisar exibir um bloco de código de largura fixa, preservando espaçamento e quebras de linha sem qualquer risco de execução de markup.

---

### Molécula: `FormField` compondo átomos

O `FormField` é o exemplo clássico de molécula: ele pega `Input` (átomo) e `Label` (átomo) e os une com uma função coesa — um campo de formulário completo com label, dica e mensagem de erro.

```tsx
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
      {hint  && <p id={hintId}  className="text-label text-muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  )
}
```

Decisões de design:

- **`aria-describedby`** aponta para os IDs dos elementos de dica/erro, permitindo que leitores de tela leiam "Email inválido" quando o foco vai para o `input`.
- **`role="alert"`** na mensagem de erro faz o leitor de tela anunciar o erro imediatamente, mesmo que o foco não esteja naquele elemento.
- **`id` obrigatório**: a prop `id` é `string` (não opcional), porque sem ela o `htmlFor` do `Label` quebra a associação acessível.

---

### Molécula: `LikeButton` com union discriminada — quando NÃO usar CVA

O `LikeButton` é um caso onde CVA **não** é a ferramenta certa. Não há variantes de estilo — há dois **comportamentos completamente diferentes** dependendo do estado de autenticação:

- **Usuário deslogado**: renderiza um `TextLink` para `/login`.
- **Usuário logado**: renderiza um `Button` com estado `aria-pressed`.

A solução é uma **union discriminada** no TypeScript:

```tsx
type LikeButtonBase = { count: number; postTitle: string }

export type LikeButtonProps = LikeButtonBase &
  (
    | { authenticated: true;  liked: boolean; pending?: boolean; onToggle: () => void }
    | { authenticated: false }
  )
```

Isso significa que, quando `authenticated === false`, TypeScript **proíbe** o código de passar `liked`, `pending` ou `onToggle` — o compilador torna o estado inválido irrepresentável. Não é possível esquecer de tratar um dos casos porque o `if (!props.authenticated)` esgota a primeira branch, e o restante da função tem acesso garantido às props do usuário logado.

**Por que `TextLink` para deslogado, e não um `Button` desabilitado?**

Um botão `disabled` ainda existe no DOM e é contado pelos seletores de acessibilidade, mas não pode receber foco. Isso quebraria auditorias que verificam "todos os controles interativos são alcançáveis por Tab". Um link para `/login` é semanticamente correto (leva o usuário a uma ação) e é focalizável.

---

### Organismo: `PostCard` sem `dangerouslySetInnerHTML`

O `PostCard` exibe o conteúdo de um post. Uma abordagem ingênua poderia renderizar HTML diretamente:

```tsx
// ❌ Nunca faça isso com conteúdo vindo de API
<div dangerouslySetInnerHTML={{ __html: post.body }} />
```

`dangerouslySetInnerHTML` com conteúdo de usuário é um vetor direto de XSS: se o banco de dados contiver `<script>alert(1)</script>`, esse script seria executado no navegador de cada visitante.

O Code Connect trata o conteúdo de posts de forma segura: o `excerpt` é texto plano e renderizado como `<p>{post.excerpt}</p>`. O componente **nunca usa `dangerouslySetInnerHTML`** porque o conteúdo renderizável vem da API já como texto — o backend é responsável por entregar o texto seguro, e o frontend apenas exibe strings.

O `PostCard` também concentra decisões de acessibilidade ligadas a desempenho:

```tsx
// Sem line-clamp: um clip fixo corta texto quando o usuário aumenta
// o espaçamento de linha via WCAG 1.4.12 — o suite de a11y detecta isso.
<p className="text-paragraph-sm text-muted">{post.excerpt}</p>
```

O `PostCard` também segue o layout do Figma: a thumbnail é *flush* ao topo do card (sem padding externo acima dela). O padding e o gap ficam no wrapper do conteúdo abaixo da thumbnail:

```tsx
<article className="flex flex-col rounded-2xl bg-surface">
  <PostThumbnail ... />
  <div className="flex flex-col gap-4 p-4">
    <h2>...</h2>
    <p>...</p>
  </div>
</article>
```

O tipo `PostCardPost` é declarado **localmente** no arquivo, não importado de `src/api/`:

```tsx
export type PostCardPost = {
  slug: string
  title: string
  excerpt: string
  // ...
}
```

Isso satisfaz a regra de que organismos nunca importam de `src/api/`. O tipo local é estruturalmente compatível com o tipo da API, então uma página pode passar um objeto de API diretamente sem conversão — mas o organismo não precisa "saber" que existe uma API.

---

### Template: `FeedTemplate` contém apenas layout

O `FeedTemplate` define a estrutura visual compartilhada entre páginas:

```tsx
export function FeedTemplate({ title, authenticated, onSignOut, children }: FeedTemplateProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar authenticated={authenticated} onSignOut={onSignOut} />
      <main className="flex-1 px-4 py-6 md:px-8 md:py-14">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-14">
          {title && <Heading level={1}>{title}</Heading>}
          {children}
        </div>
      </main>
    </div>
  )
}
```

Repare no que o template **não faz**:
- Não chama `useSession()`, `useFeed()` ou qualquer hook de dados.
- Não conhece posts, paginação ou termos de busca.
- Recebe `authenticated` e `onSignOut` como props — a página decide o que fazer.

O comentário do código é explícito: *"It holds layout only."* O template é a "planta arquitetônica" — define onde ficam as paredes, mas não decide quem vai morar lá.

---

### Página: `FeedPage` dona do data fetching

A `FeedPage` é onde tudo se une. Ela é a única responsável por:

1. Definir metadados da página (`usePageMeta`).
2. Ler parâmetros de URL (`useSearchParams`).
3. Chamar hooks de dados (`useFeed`, `useSession`).
4. Gerenciar estados derivados (loading, error, empty).
5. Compor o template com os organismos corretos.

```tsx
export function FeedPage() {
  usePageMeta('Feed', 'Veja os posts da comunidade ...')

  const [searchParams, setSearchParams] = useSearchParams()
  const session = useSession()
  const feed    = useFeed({ q, page, onUnauthorized: session.forgetSession })

  return (
    <FeedTemplate title="Feed" authenticated={session.isAuthenticated} onSignOut={...}>
      <SearchField ... />
      <PostList posts={feed.posts} ... />
      <Pagination ... />
    </FeedTemplate>
  )
}
```

A `FeedPage` também gerencia a região `aria-live` para anúncios de busca. Isso vive na página, não no `SearchField`, porque "3 posts encontrados para X" é informação de nível de página — o `SearchField` não sabe quantos resultados a API retornou.

---

## Erros Comuns e Armadilhas

### 1. Passar `className` diretamente para um átomo CVA

```tsx
// ❌ Não compila: 'className' foi removido do tipo via Omit
<Button className="mt-4">Entrar</Button>

// ✅ Use uma div/wrapper externo se precisar de margem
<div className="mt-4">
  <Button>Entrar</Button>
</div>
```

O `Omit<..., 'className'>` no tipo é intencional. Se o consumidor pudesse passar `className`, poderia sobrescrever as classes do sistema de design e criar inconsistências visuais silenciosas.

### 2. Chamar a API dentro de um organismo

```tsx
// ❌ Organismo que busca dados por conta própria
export function PostCard({ slug }: { slug: string }) {
  const { data } = useQuery(['post', slug], () => api.getPost(slug)) // ERRADO
  // ...
}
```

Isso impossibilita testar o `PostCard` sem um servidor real e viola a separação de responsabilidades. A página é quem busca; o organismo apenas exibe.

### 3. Usar `dangerouslySetInnerHTML` com dados de API

```tsx
// ❌ XSS garantido se o banco tiver conteúdo malicioso
<div dangerouslySetInnerHTML={{ __html: post.body }} />
```

Se você precisar renderizar HTML formatado de uma fonte confiável e controlada (ex.: um editor interno), use uma biblioteca de sanitização como `DOMPurify`. Nunca coloque conteúdo bruto de usuário diretamente.

### 4. Criar um `TextLink` com URL absoluta ou externa

```tsx
// ❌ Lança erro em runtime
<TextLink href="https://google.com">Google</TextLink>

// ❌ Também lança erro — não começa com '/'
<TextLink href="login">Login</TextLink>

// ✅ Sempre caminhos relativos de mesma origem
<TextLink href="/login">Login</TextLink>
```

### 5. Importar de um nível superior

```tsx
// ❌ Átomo importando de molécula — viola a hierarquia
// apps/web/src/components/atoms/Button/Button.tsx
import { FormField } from '../../molecules/FormField'
```

Se um átomo "precisa" de uma molécula, é sinal de que você identificou errado o nível — o componente provavelmente é uma molécula.

### 6. Usar `authenticated={false}` sem passar as props extras no `LikeButton`

```tsx
// ❌ TypeScript vai aceitar isso, mas é erro semântico:
// authenticated={true} exige liked, onToggle, etc.
<LikeButton authenticated={true} count={5} postTitle="Post" />
// ^ Erro de compilação: faltam 'liked' e 'onToggle'

// ✅
<LikeButton authenticated={true} liked={false} count={5} postTitle="Post" onToggle={fn} />
```

A union discriminada foi criada exatamente para que o compilador pegue esses erros antes do runtime.

### 7. `role="alert"` em elementos que entram no DOM vazio

```tsx
// ❌ O alert é anunciado quando entra no DOM — se entrar vazio, o leitor de tela ignora
{error && <p role="alert">{error}</p>}

// ✅ O elemento só entra no DOM quando tem conteúdo — FormField faz isso corretamente
```

Elementos `role="alert"` devem ter conteúdo no momento em que são inseridos. Um elemento que entra vazio e recebe texto depois frequentemente não é reanunciado.

---

## Rastreabilidade

| Conceito | Arquivo | Linha/Trecho |
|----------|---------|--------------|
| Hierarquia Atomic Design (rotas por página) | [apps/web/src/App.tsx](../../apps/web/src/App.tsx) | L1–57 |
| CVA com variantes `primary` / `ghost` | [apps/web/src/components/atoms/Button/Button.tsx](../../apps/web/src/components/atoms/Button/Button.tsx) | L4–25 |
| `Omit<..., 'className'>` bloqueando sobreposição | [apps/web/src/components/atoms/Button/Button.tsx](../../apps/web/src/components/atoms/Button/Button.tsx) | L27–30 |
| CVA com variante booleana `invalid` + `aria-invalid` | [apps/web/src/components/atoms/Input/Input.tsx](../../apps/web/src/components/atoms/Input/Input.tsx) | L4–23 |
| Validação de origem via WHATWG URL parser (XSS) | [apps/web/src/components/atoms/TextLink/TextLink.tsx](../../apps/web/src/components/atoms/TextLink/TextLink.tsx) | L27–58 |
| CVA com variantes `underline` / `primary` | [apps/web/src/components/atoms/TextLink/TextLink.tsx](../../apps/web/src/components/atoms/TextLink/TextLink.tsx) | L5–18 |
| Molécula compondo Label + Input + mensagem de erro | [apps/web/src/components/molecules/FormField/FormField.tsx](../../apps/web/src/components/molecules/FormField/FormField.tsx) | L1–37 |
| `aria-describedby` e `role="alert"` no FormField | [apps/web/src/components/molecules/FormField/FormField.tsx](../../apps/web/src/components/molecules/FormField/FormField.tsx) | L11–36 |
| Union discriminada `authenticated` no LikeButton | [apps/web/src/components/molecules/LikeButton/LikeButton.tsx](../../apps/web/src/components/molecules/LikeButton/LikeButton.tsx) | L4–23 |
| Link em vez de botão desabilitado (a11y) | [apps/web/src/components/molecules/LikeButton/LikeButton.tsx](../../apps/web/src/components/molecules/LikeButton/LikeButton.tsx) | L37–48 |
| Tipo `PostCardPost` local (não importado de `src/api/`) | [apps/web/src/components/organisms/PostCard/PostCard.tsx](../../apps/web/src/components/organisms/PostCard/PostCard.tsx) | L8–20 |
| Ausência de `dangerouslySetInnerHTML` | [apps/web/src/components/organisms/PostCard/PostCard.tsx](../../apps/web/src/components/organisms/PostCard/PostCard.tsx) | L48–101 |
| Sem `line-clamp` (WCAG 1.4.12) | [apps/web/src/components/organisms/PostCard/PostCard.tsx](../../apps/web/src/components/organisms/PostCard/PostCard.tsx) | L63–68 |
| Template contém apenas layout, sem data fetching | [apps/web/src/components/templates/FeedTemplate/FeedTemplate.tsx](../../apps/web/src/components/templates/FeedTemplate/FeedTemplate.tsx) | L1–37 |
| Página como dona do data fetching e estado | [apps/web/src/pages/FeedPage/FeedPage.tsx](../../apps/web/src/pages/FeedPage/FeedPage.tsx) | L1–106 |
| `aria-live` para anúncios de busca (nível de página) | [apps/web/src/pages/FeedPage/FeedPage.tsx](../../apps/web/src/pages/FeedPage/FeedPage.tsx) | L51–73 |

---

_Última atualização: 2026-10-09 | Gerado a partir do código-fonte._
