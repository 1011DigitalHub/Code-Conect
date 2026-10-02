/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the API. Defaults to http://localhost:3000 (see src/api/client.ts).
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
