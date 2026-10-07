import request, { type Response } from 'supertest';

// Pulls one Set-Cookie line (the raw header, with all its attributes) out of
// a supertest response.
export function setCookie(res: Response, name: string): string {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const found = raw.find((cookie) => cookie.startsWith(`${name}=`));
  if (!found) throw new Error(`no ${name} cookie in the response`);
  return found;
}

// Extracts just the value out of a raw Set-Cookie line.
export function cookieValue(raw: string): string {
  return decodeURIComponent(raw.slice(raw.indexOf('=') + 1, raw.indexOf(';')));
}

// Fetches a fresh csrf_token via GET /auth/csrf using the given agent (so
// the cookie lands in its jar, same as a browser would), and returns the
// value to send back in the X-CSRF-Token header of the next unsafe request.
// Every unsafe method is CSRF-protected now, including the @Public() ones
// (login, sign-up), so any e2e test that POSTs needs this first.
export async function fetchCsrfToken(
  agent: ReturnType<typeof request.agent>,
): Promise<string> {
  const res = await agent.get('/auth/csrf');
  return cookieValue(setCookie(res, 'csrf_token'));
}
