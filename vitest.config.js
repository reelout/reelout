import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: 'threads',
    coverage: { provider: 'istanbul', skipFull: true },
    restoreMocks: true,
    unstubEnvs: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'typescript',
          typecheck: {
            enabled: true,
            only: true,
            checker: 'tsc6',
            include: ['**/*.{test,spec}.ts'],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: ['**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
