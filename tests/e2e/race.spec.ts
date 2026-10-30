import { expect, test } from '@playwright/test';
import { collectErrors, debugState, useLowQuality } from './helpers';

test('corrida: largada, aceleração real, pausa congela o tempo e sair com confirmação', async ({ page }) => {
  const errors = collectErrors(page);
  await useLowQuality(page);
  await page.goto('/?debug=1');
  await page.getByTestId('menu-quick').click();
  await page.getByTestId('track-costa-azul').click();
  await page.getByTestId('start-race').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press('KeyW');
  await expect.poll(async () => (await debugState(page))?.phase, { timeout: 120_000 }).toBe('racing');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await debugState(page))?.speedKmh ?? 0, { timeout: 180_000 }).toBeGreaterThan(15);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  const t1 = (await debugState(page))?.raceTime ?? 0;
  await page.waitForTimeout(1500);
  const t2 = (await debugState(page))?.raceTime ?? 0;
  expect(t2).toBeCloseTo(t1, 5);
  await page.getByTestId('exit-race').click();
  await page.getByTestId('confirm-exit').click();
  await expect(page.getByTestId('menu-quick')).toBeVisible();
  expect(errors).toEqual([]);
});
