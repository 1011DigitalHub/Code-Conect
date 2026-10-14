import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    // Contains a multi-line shell string with emojis that breaks Knip's YAML parser
    '.github/workflows/validate-wiki.yml',
  ],
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
