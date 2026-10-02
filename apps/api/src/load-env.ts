// Imported first in main.ts: ESM evaluates imports in order, so the variables
// are set before any module reads process.env at load time.
try {
  process.loadEnvFile();
} catch {
  // No .env file: use the host's variables, as in production.
}
