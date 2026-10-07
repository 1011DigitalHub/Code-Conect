import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/users/password.js';

// Mock content for local development: enough posts to fill a feed page and
// exercise pagination, search, likes, comments and — deliberately — every
// thumbnail state the front end has to cope with.
//
// Run with `pnpm db:seed` from the repo root. Re-running is safe: users and
// posts are upserted by their natural keys, likes rely on the composite
// primary key, and comments are replaced only for the posts seeded here.

// Guards run before anything touches the database. This mirrors (and
// inverts) the guard in test/global-setup.ts: that one refuses to run
// against the dev database, this one refuses to run against the test or a
// production one.
function assertSafeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set to seed the database');
  }
  if (url === process.env.TEST_DATABASE_URL) {
    throw new Error(
      'refusing to seed the test database: the e2e suite truncates its tables and asserts on ids starting at 1',
    );
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRODUCTION_SEED !== '1'
  ) {
    throw new Error('refusing to seed a production database');
  }
  const { hostname } = new URL(url);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(hostname) &&
    process.env.ALLOW_REMOTE_SEED !== '1'
  ) {
    throw new Error(`refusing to seed a non-local database (${hostname})`);
  }
  return url;
}

// Everyone shares one obvious development password, so any seeded account
// can be used to log in while working on the feed.
const DEV_PASSWORD = 'CodeConnect123';

const people = [
  { name: 'Ana Souza', email: 'ana.souza@example.com' },
  { name: 'Bruno Lima', email: 'bruno.lima@example.com' },
  { name: 'Carla Mendes', email: 'carla.mendes@example.com' },
];

type SeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  // Author index into `people`.
  author: number;
  // Age of the post in days, so the relative times always look fresh.
  daysAgo: number;
  thumbnailUrl: string | null;
};

// A thumbnail path that intentionally has no file behind it, to exercise the
// runtime onError fallback (as opposed to a null, which never renders an
// <img> at all). Both end up showing the placeholder, by different paths.
const MISSING = '/posts/capa-indisponivel.webp';

const paragraphs = (...lines: string[]) => lines.join('\n\n');

// Titles must be unique: the browser accessibility suite tabs through every
// control and collects their accessible names into a Set, and the per-card
// controls are named after their post.
const posts: SeedPost[] = [
  {
    slug: 'componentes-react-na-pratica',
    title: 'Componentes React na prática',
    excerpt:
      'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade do código.',
    content: paragraphs(
      'Começar pelo componente menor costuma ser mais fácil do que tentar adivinhar a estrutura toda de uma vez.',
      'Na prática, eu escrevo a tela inteira num arquivo só, vejo quais pedaços se repetem e só então extraio. Extrair cedo demais produz componentes com props que ninguém entende.',
      'O teste é simples: se você precisa de um comentário para explicar o que a prop faz, provavelmente o componente está fazendo duas coisas.',
    ),
    author: 0,
    daysAgo: 1,
    thumbnailUrl: null,
  },
  {
    slug: 'por-que-acessibilidade-e-requisito',
    title: 'Por que acessibilidade é requisito, não extra',
    excerpt:
      'Trocar uma div por um button resolve foco, teclado e leitor de tela de uma vez. HTML semântico é o atalho.',
    content: paragraphs(
      'Quase todo problema de acessibilidade que encontrei em revisão começou com uma div clicável.',
      'O botão nativo já vem com foco, resposta ao Enter e ao Espaço, papel anunciado pelo leitor de tela e estado desabilitado. Reproduzir isso à mão dá trabalho e quase sempre fica incompleto.',
      'Comece pelo elemento certo e use ARIA só quando nenhum elemento nativo servir.',
    ),
    author: 1,
    daysAgo: 2,
    thumbnailUrl: MISSING,
  },
  {
    slug: 'full-text-search-no-postgres',
    title: 'Full-text search no PostgreSQL sem extensão',
    excerpt:
      'tsvector, GIN e websearch_to_tsquery resolvem busca com stemming em português sem instalar nada a mais.',
    content: paragraphs(
      'O PostgreSQL já vem com a configuração "portuguese", então buscar "componente" e achar "componentes" não exige extensão nenhuma.',
      'O truque é guardar o tsvector numa coluna gerada e indexá-la com GIN. Assim o banco mantém o vetor em sincronia a cada escrita, sem trigger.',
      'Para a consulta, websearch_to_tsquery é mais seguro que to_tsquery: ele não levanta erro com pontuação solta, só devolve uma busca vazia.',
    ),
    author: 0,
    daysAgo: 3,
    thumbnailUrl: null,
  },
  {
    slug: 'cookies-httponly-contra-xss',
    title: 'Cookies httpOnly contra XSS',
    excerpt:
      'Guardar o token no localStorage entrega a sessão para qualquer script injetado. O cookie httpOnly não.',
    content: paragraphs(
      'Um token no localStorage é legível por qualquer JavaScript que rode na página, inclusive o que você não escreveu.',
      'O cookie httpOnly é invisível para a página, então um XSS não consegue copiar a sessão. O preço é precisar de proteção contra CSRF, porque agora o navegador manda o cookie sozinho.',
      'Double submit assinado e ligado à sessão resolve, e dá para testar de ponta a ponta.',
    ),
    author: 2,
    daysAgo: 4,
    thumbnailUrl: MISSING,
  },
  {
    slug: 'testes-que-valem-o-esforco',
    title: 'Testes que valem o esforço',
    excerpt:
      'Teste pelo que a pessoa vê: papel, rótulo e texto. Teste amarrado em classe CSS quebra a cada refatoração.',
    content: paragraphs(
      'Um teste que procura por classe CSS falha quando você troca o Tailwind de lugar, mesmo que a tela continue funcionando.',
      'Procurar por papel e rótulo acessível testa a mesma coisa que o leitor de tela enxerga, então o teste passa a cobrir acessibilidade de graça.',
      'Quando o teste fica difícil de escrever, normalmente é o componente que está pedindo para ser dividido.',
    ),
    author: 1,
    daysAgo: 6,
    thumbnailUrl: null,
  },
  {
    slug: 'idempotencia-em-apis-rest',
    title: 'Idempotência em APIs REST',
    excerpt:
      'PUT e DELETE podem repetir sem estragar nada. Use isso e o clique duplo deixa de ser um erro 409.',
    content: paragraphs(
      'Curtir um post é o exemplo clássico: com POST, o segundo clique vira violação de unicidade e a pessoa vê um erro por nada.',
      'Tratando a curtida como um recurso singleton do usuário autenticado, PUT cria ou não faz nada e DELETE remove ou não faz nada. Os dois devolvem 204 sempre.',
      'O front fica mais simples também: o delta é sempre mais ou menos um, então a atualização otimista é correta por construção.',
    ),
    author: 0,
    daysAgo: 8,
    thumbnailUrl: null,
  },
  {
    slug: 'tailwind-com-tokens-de-tema',
    title: 'Tailwind com tokens de tema',
    excerpt:
      'Valor arbitrário na classe espalha o design pelo código. Token nomeado por papel mantém tudo num lugar.',
    content: paragraphs(
      'Escrever bg-[#81FE88] funciona até o dia em que a cor muda e você precisa achar as trinta ocorrências.',
      'Nomear por papel, e não por matiz, ajuda ainda mais: surface, danger e primary sobrevivem a uma troca de paleta; verde-claro não.',
      'No Tailwind v4 isso vive num bloco @theme no CSS, sem arquivo de configuração.',
    ),
    author: 2,
    daysAgo: 11,
    thumbnailUrl: MISSING,
  },
  {
    slug: 'monorepo-com-pnpm-workspaces',
    title: 'Monorepo com pnpm workspaces',
    excerpt:
      'Dois apps, um lockfile e scripts na raiz que delegam com --filter. Simples o bastante para não atrapalhar.',
    content: paragraphs(
      'A parte que mais ajuda não é compartilhar código, é compartilhar versão de dependência e um comando só para subir tudo.',
      'Scripts na raiz que chamam pnpm --filter mantêm a memória muscular: pnpm dev, pnpm test, pnpm build, sem lembrar onde cada app está.',
      'Quando aparecer código de verdade para compartilhar, aí sim vale criar um pacote.',
    ),
    author: 1,
    daysAgo: 14,
    thumbnailUrl: null,
  },
  {
    slug: 'migrations-que-nao-dao-medo',
    title: 'Migrations que não dão medo',
    excerpt:
      'Migration versionada no git e nunca editada depois de aplicada. O resto é consequência dessa única regra.',
    content: paragraphs(
      'A regra é só uma: depois que a migration rodou em qualquer lugar que não seja a sua máquina, ela é imutável.',
      'Precisa corrigir? Nova migration. Editar a antiga quebra o histórico de quem já aplicou e o shadow database acusa divergência.',
      'A exceção é antes de aplicar: gerar com --create-only, editar o SQL à mão e só então aplicar.',
    ),
    author: 0,
    daysAgo: 18,
    thumbnailUrl: MISSING,
  },
  {
    slug: 'lighthouse-no-ci',
    title: 'Lighthouse no CI, não no navegador',
    excerpt:
      'Medir na sua máquina mede sua máquina. No CI, com build de produção e três execuções, a nota significa algo.',
    content: paragraphs(
      'Auditar o servidor de desenvolvimento produz achados que não existem em produção: bundle sem minificar, código morto, LCP lento.',
      'Extensão de navegador atrapalha ainda mais, porque adiciona tarefa longa e quebra o bfcache.',
      'No CI, build de produção servido estático e três execuções por rota dá um número comparável entre commits.',
    ),
    author: 2,
    daysAgo: 23,
    thumbnailUrl: null,
  },
  {
    slug: 'placeholder-sem-layout-shift',
    title: 'Placeholder sem layout shift',
    excerpt:
      'Reserve a caixa da imagem antes de saber se ela existe. SVG inline com proporção fixa não pede requisição.',
    content: paragraphs(
      'Imagem sem largura e altura declaradas empurra o conteúdo quando carrega, e o CLS registra isso.',
      'Para o caso de não haver imagem, um SVG inline com viewBox na mesma proporção reserva o mesmo espaço sem nenhuma requisição de rede.',
      'E vale cobrir os dois casos: capa ausente no banco e capa que existe mas falha ao carregar.',
    ),
    author: 1,
    daysAgo: 29,
    thumbnailUrl: MISSING,
  },
  {
    slug: 'esm-no-node-com-typescript',
    title: 'ESM no Node com TypeScript',
    excerpt:
      'Import relativo precisa da extensão .js mesmo escrevendo .ts. Estranha uma vez, depois vira automático.',
    content: paragraphs(
      'Com "type": "module" e module: nodenext, o especificador do import é resolvido como o Node resolveria em tempo de execução.',
      'Isso significa escrever ./app.service.js dentro de um arquivo .ts, porque é o .js que vai existir depois da compilação.',
      'Parece errado à primeira vista, mas é a regra que mantém o mesmo código funcionando compilado e sob um runner de testes.',
    ),
    author: 0,
    daysAgo: 40,
    thumbnailUrl: null,
  },
];

type Interaction = {
  // Post slug.
  post: string;
  // Author indexes into `people`.
  comments: { author: number; body: string }[];
  likes: number[];
};

// Spread unevenly on purpose: some posts have no comments and no likes, so
// the empty states are visible without having to delete anything.
const interactions: Interaction[] = [
  {
    post: 'componentes-react-na-pratica',
    comments: [
      { author: 1, body: 'Boa! O teste do comentário na prop é um ótimo critério.' },
      { author: 2, body: 'Eu costumava extrair cedo demais e me arrependia sempre.' },
      { author: 1, body: 'Tem exemplo de um componente que ficou com props demais?' },
    ],
    likes: [1, 2],
  },
  {
    post: 'por-que-acessibilidade-e-requisito',
    comments: [
      { author: 0, body: 'A div clicável é mesmo a origem de quase tudo.' },
      { author: 2, body: 'Vale lembrar do Espaço, que muita gente esquece de tratar.' },
    ],
    likes: [0, 2],
  },
  {
    post: 'full-text-search-no-postgres',
    comments: [
      { author: 2, body: 'Não sabia que a configuração portuguese já vinha pronta.' },
      { author: 1, body: 'O detalhe do regconfig em coluna gerada me pegou também.' },
    ],
    likes: [1],
  },
  {
    post: 'cookies-httponly-contra-xss',
    comments: [
      { author: 0, body: 'Boa explicação do porquê o CSRF aparece junto.' },
      { author: 1, body: 'Assinar o token e amarrar na sessão fez diferença aqui.' },
      { author: 0, body: 'Usamos SameSite=Strict e ainda assim o double submit ajudou.' },
    ],
    likes: [0, 1, 2],
  },
  {
    post: 'testes-que-valem-o-esforco',
    comments: [{ author: 2, body: 'Testar por papel cobrindo acessibilidade é o melhor efeito colateral.' }],
    likes: [0],
  },
  {
    post: 'idempotencia-em-apis-rest',
    comments: [
      { author: 1, body: 'O argumento do clique duplo convence na hora.' },
      { author: 2, body: 'Singleton resolve bem. Eu tinha feito como coleção e dava 409.' },
    ],
    likes: [1, 2],
  },
  {
    post: 'tailwind-com-tokens-de-tema',
    comments: [{ author: 0, body: 'Nomear por papel e não por matiz é o ponto principal.' }],
    likes: [],
  },
  {
    post: 'monorepo-com-pnpm-workspaces',
    comments: [],
    likes: [0, 2],
  },
  {
    post: 'migrations-que-nao-dao-medo',
    comments: [{ author: 1, body: 'O --create-only salvou a migration com coluna gerada aqui.' }],
    likes: [],
  },
  {
    post: 'lighthouse-no-ci',
    comments: [
      { author: 0, body: 'Medir com extensão ligada já me rendeu muito achado falso.' },
      { author: 1, body: 'Três execuções por rota reduziu bem a variação.' },
    ],
    likes: [0],
  },
  { post: 'placeholder-sem-layout-shift', comments: [], likes: [] },
  {
    post: 'esm-no-node-com-typescript',
    comments: [{ author: 2, body: 'Escrever .js no .ts ainda me parece errado, mas funciona.' }],
    likes: [2],
  },
];

function daysAgoToDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function main(): Promise<void> {
  const url = assertSafeTarget();

  // The excerpt doubles as the post page's meta description, which the web
  // SEO suite checks is 50 to 160 characters. Assert here so a miscounted
  // seed fails loudly instead of producing a page that fails that suite.
  for (const post of posts) {
    const { length } = post.excerpt;
    if (length < 50 || length > 160) {
      throw new Error(
        `excerpt of "${post.slug}" is ${length} characters; it must be 50 to 160`,
      );
    }
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const passwordHash = await hashPassword(DEV_PASSWORD);

    const userIds: number[] = [];
    for (const person of people) {
      const user = await prisma.user.upsert({
        where: { email: person.email },
        // Keep an existing account's password as it is, so a developer who
        // changed it locally does not get it reset on every seed.
        update: { name: person.name },
        create: { ...person, passwordHash },
      });
      userIds.push(user.id);
    }

    // The fixtures below reference people by their index in `people`. A bad
    // index is a typo in the fixture data, so fail loudly instead of writing
    // a row with an undefined author.
    const userIdAt = (index: number): number => {
      const id = userIds[index];
      if (id === undefined) throw new Error(`seed: no seeded user at index ${index}`);
      return id;
    };

    const postIdBySlug = new Map<string, number>();
    for (const post of posts) {
      const created = await prisma.post.upsert({
        where: { slug: post.slug },
        // createdAt is deliberately not updated: re-seeding should not
        // reshuffle the feed order.
        update: {
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          thumbnailUrl: post.thumbnailUrl,
        },
        create: {
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          thumbnailUrl: post.thumbnailUrl,
          authorId: userIdAt(post.author),
          createdAt: daysAgoToDate(post.daysAgo),
        },
      });
      postIdBySlug.set(post.slug, created.id);
    }

    let commentCount = 0;
    let likeCount = 0;
    for (const interaction of interactions) {
      const postId = postIdBySlug.get(interaction.post);
      if (postId === undefined) {
        throw new Error(`interactions reference unknown post "${interaction.post}"`);
      }

      // Scoped to the seeded posts only, so comments a developer wrote on
      // their own posts survive a re-seed.
      await prisma.comment.deleteMany({ where: { postId } });
      if (interaction.comments.length > 0) {
        await prisma.comment.createMany({
          data: interaction.comments.map((comment, index) => ({
            postId,
            authorId: userIdAt(comment.author),
            body: comment.body,
            // Spread the thread out after the post was published.
            createdAt: new Date(Date.now() - (interaction.comments.length - index) * 3_600_000),
          })),
        });
        commentCount += interaction.comments.length;
      }

      if (interaction.likes.length > 0) {
        // The composite primary key makes this naturally idempotent.
        const result = await prisma.like.createMany({
          data: interaction.likes.map((person) => ({
            postId,
            userId: userIdAt(person),
          })),
          skipDuplicates: true,
        });
        likeCount += result.count;
      }
    }

    const withoutThumbnail = posts.filter((post) => post.thumbnailUrl === null).length;
    console.log(
      [
        `seeded ${userIds.length} users, ${posts.length} posts, ${commentCount} comments, ${likeCount} new likes`,
        `thumbnails: ${withoutThumbnail} null, ${posts.length - withoutThumbnail} pointing at a missing file`,
        `every account's password is "${DEV_PASSWORD}"`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
