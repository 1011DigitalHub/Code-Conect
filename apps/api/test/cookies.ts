import type { Response } from 'supertest';

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
