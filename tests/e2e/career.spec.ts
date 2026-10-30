import { expect, test } from '@playwright/test';
import { collectErrors, useLowQuality } from './helpers';

test('carreira: nova carreira, diálogos fixos, evento inicia; campeonatos e estatísticas abrem', async ({ page }) => {
  const errors = collectErrors(page);
  await useLowQuality(page);
  await page.goto('/?debug=1');
  await page.getByTestId('menu-new-career').click();
  await expect(page.getByTestId('dialogue')).toBeVisible();
  // Primeira fala: narração; segunda: Tio Bento (ordem fixa, sem sorteio).
  await expect(page.getByText('Vila Maré. O cheiro de maresia')).toBeVisible();
  await page.getByTestId('dialogue-next').click();
  await expect(page.getByText('Tio Bento').first()).toBeVisible();
  // Avança todo o diálogo de introdução.
  for (let i = 0; i < 6 && (await page.getByTestId('dialogue').isVisible()); i++) await page.getByTestId('dialogue-next').click();
  await expect(page.getByTestId('career-c1-treino')).toBeEnabled();
  await expect(page.getByTestId('career-c1-copa')).toBeDisabled();
  await page.getByTestId('career-c1-treino').click();
  await expect(page.getByTestId('dialogue')).toBeVisible();
  await page.getByTestId('dialogue-next').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press('Escape');
  await page.getByTestId('exit-race').click();
  await page.getByTestId('confirm-exit').click();
  await expect(page.getByTestId('career-c1-treino')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-championships').click();
  await expect(page.getByTestId('champ-start')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-stats').click();
  await page.getByRole('tab', { name: 'Conquistas' }).click();
  await expect(page.getByText('Bandeira quadriculada')).toBeVisible();
  expect(errors).toEqual([]);
});
