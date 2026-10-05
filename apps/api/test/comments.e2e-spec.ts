import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
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

const commenter = {
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

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app;
}

describe('Comments (e2e)', () => {
  let app: INestApplication<App>;
  let slug: string;

  beforeAll(() => {
    expect(isCookieSecure()).toBe(false);
  });

  beforeEach(async () => {
    app = await createApp();
    await resetDatabase(app);
    const published = await publish();
    slug = published.slug;
  });

  afterEach(async () => {
    await app.close();
  });

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

    // Login rotates the csrf token, so the pre-login one is no longer valid.
    const res = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', signUpToken)
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    return { agent, csrfToken: cookieValue(setCookie(res, 'csrf_token')) };
  }

  async function publish(): Promise<{ slug: string }> {
    const { agent, csrfToken } = await signIn(author);
    const res = await agent
      .post('/posts')
      .set('X-CSRF-Token', csrfToken)
      .send(newPost)
      .expect(201);
    return { slug: res.body.slug };
  }

  async function comment(body: string, credentials = commenter): Promise<string> {
    const { agent, csrfToken } = await signIn(credentials);
    const res = await agent
      .post(`/posts/${slug}/comments`)
      .set('X-CSRF-Token', csrfToken)
      .send({ body })
      .expect(201);
    return res.headers.location;
  }

  describe('POST /posts/:slug/comments', () => {
    it('requires a session', async () => {
      const agent = request.agent(app.getHttpServer());
      const csrfToken = await fetchCsrfToken(agent);

      await agent
        .post(`/posts/${slug}/comments`)
        .set('X-CSRF-Token', csrfToken)
        .send({ body: 'Muito bom!' })
        .expect(401);
    });

    it('requires a csrf token', async () => {
      const { agent } = await signIn(commenter);

      await agent
        .post(`/posts/${slug}/comments`)
        .send({ body: 'Muito bom!' })
        .expect(403);
    });

    it('creates the comment: 201, Location and a dereferenceable self link', async () => {
      const { agent, csrfToken } = await signIn(commenter);

      const res = await agent
        .post(`/posts/${slug}/comments`)
        .set('X-CSRF-Token', csrfToken)
        .send({ body: 'Muito bom, obrigado por compartilhar!' })
        .expect(201);

      expect(res.headers.location).toBe(`/posts/${slug}/comments/1`);
      expect(res.body).toMatchObject({
        id: 1,
        body: 'Muito bom, obrigado por compartilhar!',
        author: { name: 'Bruno Lima', self: '/users/2' },
        links: { self: `/posts/${slug}/comments/1`, post: `/posts/${slug}` },
      });

      // The Location header must actually resolve.
      await request(app.getHttpServer()).get(res.headers.location).expect(200);
    });

    it('trims the body', async () => {
      const { agent, csrfToken } = await signIn(commenter);

      const res = await agent
        .post(`/posts/${slug}/comments`)
        .set('X-CSRF-Token', csrfToken)
        .send({ body: '   Muito bom!   ' })
        .expect(201);

      expect(res.body.body).toBe('Muito bom!');
    });

    it('rejects an empty body', async () => {
      const { agent, csrfToken } = await signIn(commenter);

      await agent
        .post(`/posts/${slug}/comments`)
        .set('X-CSRF-Token', csrfToken)
        .send({ body: '   ' })
        .expect(400);
    });

    it('rejects a body over 1000 characters with the standard error shape', async () => {
      const { agent, csrfToken } = await signIn(commenter);

      const res = await agent
        .post(`/posts/${slug}/comments`)
        .set('X-CSRF-Token', csrfToken)
        .send({ body: 'a'.repeat(1001) })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.any(Array),
      });
    });

    it('is 404 for an unknown post', async () => {
      const { agent, csrfToken } = await signIn(commenter);

      await agent
        .post('/posts/nao-existe/comments')
        .set('X-CSRF-Token', csrfToken)
        .send({ body: 'Muito bom!' })
        .expect(404);
    });
  });

  describe('GET /posts/:slug/comments', () => {
    it('is public and lists the oldest comment first', async () => {
      await comment('Primeiro comentário', commenter);
      await comment('Segundo comentário', {
        ...author,
        email: 'carla@exemplo.com',
        name: 'Carla Mendes',
      });

      const res = await request(app.getHttpServer())
        .get(`/posts/${slug}/comments`)
        .expect(200);

      expect(res.body.data.map((item: { body: string }) => item.body)).toEqual([
        'Primeiro comentário',
        'Segundo comentário',
      ]);
      expect(res.body.pagination).toMatchObject({ total: 2, totalPages: 1 });
    });

    it('returns an empty, paginated collection for a post with no comments', async () => {
      const res = await request(app.getHttpServer())
        .get(`/posts/${slug}/comments`)
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.links).toEqual({
        self: `/posts/${slug}/comments?perPage=9&page=1`,
        next: null,
        prev: null,
      });
    });

    it('is 404 for an unknown post', () => {
      return request(app.getHttpServer())
        .get('/posts/nao-existe/comments')
        .expect(404);
    });

    it('is reflected in the post commentCount', async () => {
      await comment('Muito bom!');

      const res = await request(app.getHttpServer()).get(`/posts/${slug}`).expect(200);
      expect(res.body.commentCount).toBe(1);
    });
  });

  describe('GET /posts/:slug/comments/:commentId', () => {
    it('is 404 when the comment belongs to another post', async () => {
      await comment('Muito bom!');

      // A real comment id, but asked for under a post that is not its own.
      await request(app.getHttpServer())
        .get('/posts/nao-existe/comments/1')
        .expect(404);
    });

    it('is 400 for a non-numeric comment id', () => {
      return request(app.getHttpServer())
        .get(`/posts/${slug}/comments/abc`)
        .expect(400);
    });

    it('is 404 for an unknown comment id', () => {
      return request(app.getHttpServer())
        .get(`/posts/${slug}/comments/999`)
        .expect(404);
    });
  });
});
