import { defineConfig } from '@playwright/test';

/**
 * Testes de ponta a ponta no navegador.
 * - Por padrão usa o Chromium do Playwright (instale com: npx playwright install chromium).
 * - Para usar outro executável: PW_CHROMIUM_PATH=/caminho/chromium e, se necessário, PW_CHROMIUM_ARGS="--flag1 --flag2".
 * - E2E_BASE_URL permite testar um servidor já em execução (ex.: dev server ou deploy de preview).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const extraArgs = (process.env.PW_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    viewport: { width: 960, height: 540 },
    launchOptions: {
      executablePath,
      args: ['--ignore-gpu-blocklist', '--use-gl=angle', ...extraArgs],
    },
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --host 127.0.0.1',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
