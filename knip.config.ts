import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    'apps/api': {
      entry: ['src/main.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/generated/**'],
    },
    'apps/web': {
      entry: ['src/main.tsx'],
      project: ['src/**/*.{ts,tsx}'],
    },
  },
}

export default config
