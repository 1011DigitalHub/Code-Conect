import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

// Vite dev server and the `vite preview` port used by the Playwright suites.
const DEV_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5174';

export function getCorsOrigins(): string[] {
  const configured =
    process.env.CORS_ORIGINS ??
    (process.env.NODE_ENV === 'production' ? '' : DEV_ORIGINS);
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Only the known web origins may read responses in the browser, and only
// those origins get Access-Control-Allow-Credentials — never combined with a
// wildcard. The session travels in an httpOnly cookie, so the browser must
// be told to send/receive credentials; Authorization is no longer in the
// allowlist since AuthGuard dropped the Bearer bridge. In production without
// CORS_ORIGINS the list is empty, so every origin is refused.
export function getCorsOptions(): CorsOptions {
  return {
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['Location', 'Retry-After'],
    maxAge: 600,
    credentials: true,
  };
}
