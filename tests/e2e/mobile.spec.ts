import { expect, test } from '@playwright/test';
import { collectErrors, useLowQuality } from './helpers';

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test('celular na horizontal: menus cabem e controles de toque aparecem na corrida', async ({ page }) => {
  const errors = collectErrors(page);
  await useLowQuality(page, { settings: { controls: { touch: 'on' }, graphics: { preset: 'low', renderScale: 0.4, shadows: 'off', drawDistance: 'near', particles: 'off', effects: 'low', fpsLimit: 0, showFps: false } } });
  await page.goto('/?debug=1');
  await expect(page.getByTestId('menu-quick')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.getByTestId('menu-quick').tap();
  await page.getByTestId('start-race').tap();
  await expect(page.getByTestId('touch-controls')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel('Acelerador')).toBeVisible();
  await expect(page.getByLabel('Direção')).toBeVisible();
  expect(errors).toEqual([]);
});
