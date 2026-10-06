import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts on purpose: tests need neither the PWA plugin nor Tailwind, and
// loading the service-worker build for every unit test only makes them slower.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/testing/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/data/**'],
      exclude: ['src/**/*.test.ts', 'src/testing/**', 'src/data/seed/**'],
    },
  },
})
