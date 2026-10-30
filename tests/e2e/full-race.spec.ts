import { expect, test } from '@playwright/test';
import { collectErrors, useLowQuality } from './helpers';

/**
 * Corrida completa no navegador com a IA pilotando o carro do jogador (?autopilot=1)
 * e simulação acelerada pela API de depuração — valida chegada, resultados e recompensas.
 */
test('corrida completa até os resultados, com recompensa aplicada uma única vez', async ({ page }) => {
  const errors = collectErrors(page);
  await useLowQuality(page, {
    lastSetup: { mode: 'quickRace', trackId: 'porto-industrial', vehicleId: 'valkar-sprint-gt', laps: 1, opponents: 2, difficulty: 'easy' },
  });
  await page.goto('/?debug=1&autopilot=1');
  await page.getByTestId('menu-quick').click();
  await page.getByTestId('start-race').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 120_000 });
  const credits0 = await page.evaluate(() => (window as any).__APEX__.store.get().save.profile.credits);
  await page.evaluate(() => (window as any).__APEX__.game.race.session.skipIntro());
  await expect
    .poll(
      async () => {
        await page.evaluate(() => (window as any).__APEX__.setTimeScale(8));
        return page.getByTestId('results').isVisible();
      },
      { timeout: 280_000, intervals: [1000] },
    )
    .toBe(true);
  const outcome = await page.evaluate(() => {
    const s = (window as any).__APEX__.store.get();
    return { valid: s.race.results.valid, credits: s.race.results.rewards.credits, saved: s.save.profile.credits, applied: s.race.outcome.applied };
  });
  expect(outcome.valid).toBe(true);
  expect(outcome.applied).toBe(true);
  expect(outcome.saved).toBe(credits0 + outcome.credits);
  await page.getByTestId('results-menu').click();
  await expect(page.getByTestId('menu-quick')).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-velocity:save') ?? '{}').profile.credits);
  expect(after).toBe(credits0 + outcome.credits);
  expect(errors).toEqual([]);
});
