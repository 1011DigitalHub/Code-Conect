import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './env.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  if (env.swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(env.port);
}
await bootstrap();
