import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE, CSRF_HEADER } from './auth/cookie.constants.js';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Code Connect API')
    .setDescription('Cadastro, login, dados do usuário logado e feed de posts com busca, curtidas e comentários.')
    .setVersion('1.0')
    // The session: an httpOnly cookie set by POST /auth/login.
    .addCookieAuth(
      ACCESS_TOKEN_COOKIE,
      { type: 'apiKey', in: 'cookie', name: ACCESS_TOKEN_COOKIE },
      'cookie',
    )
    // Required alongside the cookie on every unsafe method (see CsrfGuard).
    // Swagger UI can't fetch GET /auth/csrf and fill this in automatically;
    // "Authorize" with the value read from document.cookie after login.
    .addApiKey({ type: 'apiKey', in: 'header', name: CSRF_HEADER }, 'csrf')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // UI at /api/docs, JSON at /api/docs-json.
  SwaggerModule.setup('api/docs', app, document);
}
