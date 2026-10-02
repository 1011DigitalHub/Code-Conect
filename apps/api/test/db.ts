import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Empties the test database and restarts the ids at 1.
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRaw`TRUNCATE TABLE users RESTART IDENTITY CASCADE`;
}
