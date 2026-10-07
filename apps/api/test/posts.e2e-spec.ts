import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.js';
import { isCookieSecure } from './../src/auth/cookie.constants.js';
import { cookieValue, fetchCsrfToken, setCookie } from './cookies.js';
import { resetDatabase } from './db.js';

type Agent = ReturnType<typeof request.agent>;

const author = {
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  password: 'senha-segura-123',
};

const reader = {
  name: 'Bruno Lima',
  email: 'bruno@exemplo.com',
  password: 'senha-segura-456',
};

const newPost = {
  title: 'Componentes React na prática',
  excerpt:
    'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade do código.',
  content: 'Começar pelo componente menor costuma ser mais fácil de manter.',
};

async function createApp(): Promise<NestExpressApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app;
}

describe('Posts (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(() => {
    // Same premise as the auth suite: a Secure cookie would never be
    // replayed by supertest's jar over http, turning every test below into
    // an unexplained 401.
    expect(isCookieSecure()).toBe(false);
  });

  beforeEach(async () => {
    app = await createApp();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  // Signs a user up and logs them in. Returns the agent (whose jar now holds
  // the session cookie) and the csrf token minted for that session — login
  // rotates it, so the pre-login token is no longer valid.
  async function signIn(
    credentials: typeof author,
  ): Promise<{ agent: Agent; csrfToken: string }> {
    const agent = request.agent(app.getHttpServer());
    const signUpToken = await fetchCsrfToken(agent);
    await agent
      .post('/users')
      .set('X-CSRF-Token', signUpToken)
      .send(credentials)
      .expect(201);

    const res = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', signUpToken)
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    return { agent, csrfToken: cookieValue(setCookie(res, 'csrf_token')) };
  }

  async function publish(
    overrides: Partial<typeof newPost> = {},
    credentials = author,
  ): Promise<{ agent: Agent; csrfToken: string; slug: string }> {
    const { agent, csrfToken } = await signIn(credentials);
    const res = await agent
      .post('/posts')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...newPost, ...overrides })
      .expect(201);
    return { agent, csrfToken, slug: res.body.slug };
  }

  describe('GET /posts', () => {
    it('is public: an anonymous visitor gets an empty, paginated feed', async () => {
      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toEqual({
        page: 1,
        perPage: 9,
        total: 0,
        totalPages: 1,
      });
      expect(res.body.links).toEqual({
        self: '/posts?perPage=9&page=1',
        next: null,
        prev: null,
      });
    });

    it('returns the newest post first', async () => {
      await publish({ title: 'Primeiro post' });
      await publish({ title: 'Segundo post' }, reader);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body.data.map((post: { title: string }) => post.title)).toEqual([
        'Segundo post',
        'Primeiro post',
      ]);
    });

    it('never ships the post body in the feed', async () => {
      await publish();

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body.data[0]).not.toHaveProperty('content');
    });

    it('reports likedByMe false anonymously and true for the person who liked', async () => {
      const { agent, csrfToken, slug } = await publish();
      await agent.put(`/posts/${slug}/like`).set('X-CSRF-Token', csrfToken).expect(204);

      const anonymous = await request(app.getHttpServer()).get('/posts').expect(200);
      expect(anonymous.body.data[0]).toMatchObject({ likeCount: 1, likedByMe: false });

      const authenticated = await agent.get('/posts').expect(200);
      expect(authenticated.body.data[0]).toMatchObject({
        likeCount: 1,
        likedByMe: true,
      });
    });

    it('rejects an unknown query parameter', () => {
      // Pins the forbidNonWhitelisted behaviour: ?utm_source=x is a 400, not
      // a silently ignored parameter. The web client only ever sends
      // q/page/perPage.
      return request(app.getHttpServer())
        .get('/posts?q=react&utm_source=newsletter')
        .expect(400);
    });

    it('rejects a perPage above the maximum', () => {
      return request(app.getHttpServer()).get('/posts?perPage=500').expect(400);
    });
  });

  describe('GET /posts?q=', () => {
    beforeEach(async () => {
      await publish({
        title: 'Componentes React na prática',
        excerpt:
          'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade.',
        content: 'Extrair cedo demais produz componentes difíceis de entender.',
      });
      await publish(
        {
          title: 'Full-text search no PostgreSQL',
          excerpt:
            'tsvector, GIN e websearch_to_tsquery resolvem busca com stemming em português sem instalar nada.',
          content: 'A configuração portuguese já vem com o banco.',
        },
        reader,
      );
    });

    it('matches on a stemmed word, so the singular finds the plural', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts?q=componente')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Componentes React na prática');
      expect(res.body.pagination.total).toBe(1);
    });

    it('matches a word that only appears in the body', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts?q=stemming')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Full-text search no PostgreSQL');
    });

    it('keeps the term on the collection links', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts?q=componente')
        .expect(200);

      expect(res.body.links.self).toContain('q=componente');
    });

    it('treats a blank term as no filter at all', async () => {
      const res = await request(app.getHttpServer()).get('/posts?q=%20%20').expect(200);

      expect(res.body.data).toHaveLength(2);
    });

    it('answers punctuation-only input with an empty result, not an error', async () => {
      // websearch_to_tsquery yields an empty query here. to_tsquery would
      // have raised, which would surface as a 500.
      const res = await request(app.getHttpServer()).get('/posts?q=!!!').expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toMatchObject({ total: 0, totalPages: 1 });
    });

    it('returns an empty result for a term nothing matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts?q=kubernetes')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /posts', () => {
    it('requires a session', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);

      await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send(newPost)
        .expect(401);
    });

    it('requires a csrf token', async () => {
      const { agent } = await signIn(author);

      await agent.post('/posts').send(newPost).expect(403);
    });

    it('creates the post: 201, Location and a slug from the title', async () => {
      const { agent, csrfToken } = await signIn(author);

      const res = await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send(newPost)
        .expect(201);

      expect(res.body.slug).toBe('componentes-react-na-pratica');
      expect(res.headers.location).toBe('/posts/componentes-react-na-pratica');
      expect(res.body).toMatchObject({
        title: newPost.title,
        content: newPost.content,
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
        thumbnailUrl: null,
        author: { name: 'Ana Souza', self: '/users/1' },
        links: {
          self: '/posts/componentes-react-na-pratica',
          comments: '/posts/componentes-react-na-pratica/comments',
          like: '/posts/componentes-react-na-pratica/like',
          author: '/users/1',
        },
      });
    });

    it('suffixes the slug when two posts share a title', async () => {
      await publish();
      const { agent, csrfToken } = await signIn(reader);

      const res = await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send(newPost)
        .expect(201);

      expect(res.body.slug).toBe('componentes-react-na-pratica-2');
    });

    it('rejects an excerpt that is too short to be a meta description', async () => {
      const { agent, csrfToken } = await signIn(author);

      await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newPost, excerpt: 'Curto demais.' })
        .expect(400);
    });

    it('rejects a thumbnail that is neither an http url nor a site-relative path', async () => {
      const { agent, csrfToken } = await signIn(author);

      await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        // The point of this case is that the API rejects this value; no-script-url
        // exists to stop a javascript: URL being *used*, not asserted against.
        // eslint-disable-next-line no-script-url
        .send({ ...newPost, thumbnailUrl: 'javascript:alert(1)' })
        .expect(400);
    });

    it('accepts a site-relative thumbnail path', async () => {
      const { agent, csrfToken } = await signIn(author);

      const res = await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newPost, thumbnailUrl: '/posts/capa.webp' })
        .expect(201);

      expect(res.body.thumbnailUrl).toBe('/posts/capa.webp');
    });

    it('rejects an undeclared field', async () => {
      const { agent, csrfToken } = await signIn(author);

      await agent
        .post('/posts')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...newPost, authorId: 99 })
        .expect(400);
    });
  });

  describe('GET /posts/:slug', () => {
    it('returns the post with its body', async () => {
      const { slug } = await publish();

      const res = await request(app.getHttpServer()).get(`/posts/${slug}`).expect(200);

      expect(res.body).toMatchObject({ slug, content: newPost.content });
    });

    it('is 404 for an unknown slug', () => {
      return request(app.getHttpServer()).get('/posts/nao-existe').expect(404);
    });
  });

  describe('PUT and DELETE /posts/:slug/like', () => {
    it('is idempotent: liking twice leaves one like and answers 204 both times', async () => {
      const { agent, csrfToken, slug } = await publish();

      await agent.put(`/posts/${slug}/like`).set('X-CSRF-Token', csrfToken).expect(204);
      await agent.put(`/posts/${slug}/like`).set('X-CSRF-Token', csrfToken).expect(204);

      const res = await agent.get(`/posts/${slug}`).expect(200);
      expect(res.body.likeCount).toBe(1);
      expect(res.body.likedByMe).toBe(true);
    });

    it('is idempotent: unliking what was never liked answers 204', async () => {
      const { agent, csrfToken, slug } = await publish();

      await agent
        .delete(`/posts/${slug}/like`)
        .set('X-CSRF-Token', csrfToken)
        .expect(204);

      const res = await agent.get(`/posts/${slug}`).expect(200);
      expect(res.body.likeCount).toBe(0);
    });

    it('removes the like', async () => {
      const { agent, csrfToken, slug } = await publish();

      await agent.put(`/posts/${slug}/like`).set('X-CSRF-Token', csrfToken).expect(204);
      await agent
        .delete(`/posts/${slug}/like`)
        .set('X-CSRF-Token', csrfToken)
        .expect(204);

      const res = await agent.get(`/posts/${slug}`).expect(200);
      expect(res.body).toMatchObject({ likeCount: 0, likedByMe: false });
    });

    it('counts likes from different people', async () => {
      const { slug } = await publish();
      const other = await signIn(reader);

      await other.agent
        .put(`/posts/${slug}/like`)
        .set('X-CSRF-Token', other.csrfToken)
        .expect(204);

      const res = await request(app.getHttpServer()).get(`/posts/${slug}`).expect(200);
      expect(res.body.likeCount).toBe(1);
    });

    it('requires a session', async () => {
      const { slug } = await publish();
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);

      await agent.put(`/posts/${slug}/like`).set('X-CSRF-Token', csrfToken).expect(401);
      await agent
        .delete(`/posts/${slug}/like`)
        .set('X-CSRF-Token', csrfToken)
        .expect(401);
    });

    it('is 404 for an unknown slug', async () => {
      const { agent, csrfToken } = await signIn(author);

      await agent
        .put('/posts/nao-existe/like')
        .set('X-CSRF-Token', csrfToken)
        .expect(404);
    });
  });

  describe('GET /api/docs-json', () => {
    it('documents the posts and comments paths', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/posts',
          '/posts/{slug}',
          '/posts/{slug}/like',
          '/posts/{slug}/comments',
          '/posts/{slug}/comments/{commentId}',
        ]),
      );
      expect(res.body.paths['/posts'].post.responses).toHaveProperty('429');
      expect(res.body.paths['/posts/{slug}/like'].put.responses).toHaveProperty('204');
    });
  });
});
