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
    // Needs tsx rather than node --experimental-strip-types: the generated
    // client is TypeScript that imports its own files with a .js extension,
    // and bare type-stripping does not remap those specifiers.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so the URL may be missing.
    url: process.env.DATABASE_URL ?? '',
  },
});
