import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Don't start the full server; tests import modules directly
    setupFiles: ['src/__tests__/setup.ts'],
  },
})
