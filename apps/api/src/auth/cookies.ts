import type { Request } from 'express';

// Express 5 does not parse cookies on its own (res.cookie() is native, but
// reading req.cookies needs the cookie-parser middleware), and
// test/app.e2e-spec.ts and test/guard.e2e-spec.ts build their app without
// configureApp(), so a guard that only read req.cookies would throw there.
// This reads the raw `Cookie` header as a fallback, so it works whether or
// not cookie-parser ran.
export function readCookie(req: Request, name: string): string | undefined {
  const parsed = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    name
  ];
  if (parsed) return parsed;

  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
