import { defineConfig } from 'prisma/config';

// Loads apps/api/.env when it exists; otherwise uses the host's variables.
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so the URL may be missing.
    url: process.env.DATABASE_URL ?? '',
  },
});
