import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { cookieValue, fetchCsrfToken, setCookie } from '../cookies.js';

export type Agent = ReturnType<typeof request.agent>;

export interface Credentials {
  name: string;
  email: string;
  password: string;
}

// Signs a user up and logs them in. Returns the agent (with the session cookie
// in its jar) and the csrf token minted for that session — login rotates it,
// so the pre-login token is no longer valid.
export async function loginAs(
  app: NestExpressApplication,
  credentials: Credentials,
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
