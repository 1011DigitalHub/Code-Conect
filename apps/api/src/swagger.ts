import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Code Connect API')
    .setDescription('Cadastro, login e dados do usuário logado.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // UI at /docs, JSON at /docs-json.
  SwaggerModule.setup('docs', app, document);
}
