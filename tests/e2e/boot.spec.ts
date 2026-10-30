import { expect, test } from '@playwright/test';
import { collectErrors, useLowQuality } from './helpers';

test('carrega o menu, a garagem e persiste configurações', async ({ page }) => {
  const errors = collectErrors(page);
  await useLowQuality(page);
  await page.goto('/?debug=1');
  await expect(page.getByTestId('menu-quick')).toBeVisible();
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  await page.getByTestId('menu-garage').click();
  await expect(page.getByText('Garagem', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-settings').click();
  await page.getByRole('tab', { name: 'Jogo' }).click();
  await page.getByRole('radio', { name: 'mph' }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId('menu-quick')).toBeVisible();
  const units = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-velocity:save') ?? '{}').settings.gameplay.units);
  expect(units).toBe('mph');
  expect(errors).toEqual([]);
});
