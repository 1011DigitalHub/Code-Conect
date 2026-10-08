import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Empties the test database and restarts the ids at 1.
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  // Every table is named explicitly rather than relying on CASCADE: CASCADE
  // deletes the dependent rows but does not restart *their* identity
  // sequences, so post and comment ids would drift between test files.
  await prisma.$executeRaw`TRUNCATE TABLE likes, comments, posts, users RESTART IDENTITY CASCADE`;
}
