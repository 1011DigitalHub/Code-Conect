import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './env.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Makes a real SIGTERM/SIGINT call app.close(), which runs every
  // OnModuleDestroy hook (PrismaService disconnects cleanly) instead of the
  // process dying with open connections. Only meaningful for a real process;
  // the e2e tests close the app themselves and don't go through main.ts.
  app.enableShutdownHooks();

  configureApp(app);
  if (env.swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(env.port);
}
await bootstrap();
