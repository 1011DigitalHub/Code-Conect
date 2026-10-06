import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { getCorsOptions } from './cors.js';
import { env } from './env.js';

// Max size of a JSON request body. Every DTO in this API (name, email,
// password) fits in well under 1 KB; 10 KB leaves headroom without leaving
// the implicit, much larger Express default (100 KB) as a free DoS lever.
// NestExpressApplication (not plain INestApplication) is required for
// useBodyParser, which is why every e2e test that calls configureApp creates
// its app with that type too.
const JSON_BODY_LIMIT = '10kb';

// Shared by main.ts and the e2e tests so both run with the same validation,
// CORS, headers, proxy trust and body size limit.
export function configureApp(app: NestExpressApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors(getCorsOptions());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Swagger UI's bundled page uses an inline <script> to init
          // itself; this is otherwise a pure JSON API, so the trade-off is
          // scoped to the one HTML page this service serves. Helmet's
          // default directives use dash-case keys ("script-src"); a
          // camelCase "scriptSrc" override here would add a *second* key
          // instead of replacing this one, and helmet rejects the result as
          // a duplicate directive.
          'script-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );

  // Express's req.ip is otherwise just the socket's peer address — behind a
  // reverse proxy that is the proxy itself, so every real client would share
  // one IP and the rate limiter would limit (or fail to limit) everyone as a
  // single caller. env.trustProxy is a hop count, never `true`: trusting the
  // whole X-Forwarded-For chain would let a client set its own and spoof any
  // IP, defeating the limiter instead of fixing it.
  if (env.trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', env.trustProxy);
  }
}
