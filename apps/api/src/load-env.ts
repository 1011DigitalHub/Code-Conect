// Imported first in main.ts: ESM evaluates imports in order, so the variables
// are set before any module reads process.env at load time.
try {
  process.loadEnvFile();
} catch (error) {
  // No .env file is fine — that's production, where the host sets the real
  // environment variables. Anything else (permission denied, a directory
  // where the file should be, ...) is a real problem and must not be
  // swallowed indistinguishably from "there's just no file".
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}
