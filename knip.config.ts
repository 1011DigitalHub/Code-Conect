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
      // tslib is a TypeScript runtime helper used by emitted code, not by
      // source files directly; it can't be detected by static import analysis.
      ignoreDependencies: ['tslib'],
    },
    'apps/web': {
      project: ['src/**/*.{ts,tsx}'],
    },
  },
}

export default config
