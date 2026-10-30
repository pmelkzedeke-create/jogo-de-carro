import type { Page } from '@playwright/test';

/** Qualidade gráfica baixa para ambientes sem GPU (ex.: CI com renderização por software). */
export async function useLowQuality(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((payload) => {
    if (localStorage.getItem('apex-velocity:save')) return;
    localStorage.setItem(
      'apex-velocity:save',
      JSON.stringify({
        version: 1,
        settings: { graphics: { preset: 'low', renderScale: 0.4, shadows: 'off', drawDistance: 'near', particles: 'low', effects: 'low', fpsLimit: 0, showFps: false } },
        ...payload,
      }),
    );
  }, extra);
}

export interface DebugState {
  state: string;
  paused: boolean;
  phase?: string;
  raceTime?: number;
  speedKmh?: number;
  gear?: number;
  lap?: number;
  progress?: number;
  position?: number;
  finished?: boolean;
  complete?: boolean;
}

export function debugState(page: Page): Promise<DebugState | undefined> {
  return page.evaluate(() => (window as unknown as { __APEX__?: { state(): DebugState } }).__APEX__?.state());
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
