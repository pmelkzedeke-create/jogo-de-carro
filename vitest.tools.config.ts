import { defineConfig } from 'vitest/config';

// Configuração para ferramentas de desenvolvimento (ex.: gerar mapas das pistas).
export default defineConfig({
  test: {
    include: ['scripts/**/*.tool.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
