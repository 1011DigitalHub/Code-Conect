import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

try {
  process.loadEnvFile();
} catch {
  // No .env file: TEST_DATABASE_URL must come from the environment.
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Migrates the test database and refuses to run against the dev one.
    globalSetup: './test/global-setup.ts',
    // The app under test talks to the test database only.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
    // Test files share one database and truncate it.
    fileParallelism: false,
  },
});
