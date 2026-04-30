import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@shared': new URL('./src/shared/', import.meta.url).pathname,
      '@curation': new URL('./src/curation/', import.meta.url).pathname,
      '@business-ideas': new URL('./src/business-ideas/', import.meta.url).pathname,
    },
  },
});
