import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getCorsOptions } from './cors.js';

// Shared by main.ts and the e2e tests so both run with the same validation and CORS.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors(getCorsOptions());
}
