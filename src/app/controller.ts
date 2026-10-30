/**
 * Controlador da aplicação: conecta interface (store), jogo (Game) e persistência (SaveManager).
 */
import { applyRaceResults } from '../career/CareerManager';
import { Game, type MessageKind } from '../game/Game';
import type { Settings, SaveData } from '../persistence/SaveSchema';
import { SaveManager } from '../persistence/SaveManager';
import { buildRaceResults } from '../racing/RaceRewards';
import { MODES, type RaceConfig, type RaceResults } from '../racing/RaceTypes';
import { detectWebGL2 } from '../rendering/Renderer';
import { getTrackDefinition } from '../tracks/TrackCatalog';
import { appStore, type Screen } from './appState';
import { buildRaceConfig, type SetupState } from './raceSetup';
import { achievementName, evaluateAchievements } from '../career/Achievements';

let game: Game | null = null;
let saveManager: SaveManager | null = null;
let messageId = 0;
let lastConfig: RaceConfig | null = null;

export function getGame(): Game | null {
  return game;
}

/** Verifica recursos indispensáveis do navegador. */
export function checkCapabilities(): string[] {
  const reasons: string[] = [];
  if (typeof WebAssembly === 'undefined') reasons.push('WebAssembly não está disponível (necessário para a física do jogo).');
  const gl = detectWebGL2();
  if (!gl.supported) reasons.push('WebGL 2 não está disponível ou foi desativado (necessário para os gráficos 3D).');
  if (typeof ResizeObserver === 'undefined') reasons.push('O navegador é antigo demais (ResizeObserver ausente).');
  return reasons;
}

export async function boot(container: HTMLElement): Promise<void> {
  const reasons = checkCapabilities();
  if (reasons.length) {
    appStore.set({ screen: 'unsupported', unsupported: reasons });
    return;
  }
  saveManager = saveManager ?? new SaveManager();
  const loaded = saveManager.load();
  const save = loaded.data;
  const touchDevice = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  appStore.set({
    save,
    warnings: loaded.warnings,
    persistent: loaded.persistent,
    touchDevice,
    bootError: null,
    setup: {
      mode: 'quickRace',
      trackId: getTrackDefinitionSafe(save.lastSetup.trackId),
      vehicleId: save.garage.owned.some((o) => o.id === save.lastSetup.vehicleId) ? save.lastSetup.vehicleId : save.garage.selected,
      laps: save.lastSetup.laps,
      opponents: save.lastSetup.opponents,
      difficulty: save.lastSetup.difficulty,
    },
  });
  try {
    if (game) {
      game.dispose();
      game = null;
    }
    game = await Game.create(container, save.settings, (steps) => appStore.set({ bootSteps: steps }));
    const params = new URLSearchParams(window.location.search);
    if (params.get('autopilot') === '1') game.autopilot = true;
    wireGameEvents(game);
    const selected = save.garage.owned.find((o) => o.id === save.garage.selected) ?? save.garage.owned[0];
    game.showVehicle(selected.id, selected.paint);
    game.setGarageMode('menu', null);
    appStore.set({ screen: 'menu' });
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
    exposeDebug();
  } catch (error) {
    appStore.set({ bootError: error instanceof Error ? error.message : String(error) });
  }
}

function getTrackDefinitionSafe(id: string): string {
  try {
    return getTrackDefinition(id).id;
  } catch {
    return 'costa-azul';
  }
}

function wireGameEvents(g: Game): void {
  g.events.on('message', (m) => pushMessage(m.text, m.kind, m.key, m.duration));
  g.events.on('pauseRequested', () => {
    const race = appStore.get().race;
    if (race && !race.paused) appStore.set({ race: { ...race, paused: true, pauseView: 'main' } });
  });
  g.events.on('phase', (e) => {
    const race = appStore.get().race;
    if (race) appStore.set({ race: { ...race, phase: e.phase } });
  });
  g.events.on('raceFinished', (e) => handleResults(e.results, false));
  g.events.on('raceComplete', (e) => handleResults(e.results, true));
  g.events.on('contextLost', (e) => appStore.set({ contextLost: e.lost }));
  g.events.on('gamepad', (e) => {
    appStore.set({ gamepad: e.connected ? e.id : null });
    pushMessage(e.connected ? 'Controle conectado' : 'Controle desconectado', e.connected ? 'good' : 'warn', 'gamepad', 2200);
  });
}

export function pushMessage(text: string, kind: MessageKind = 'info', key?: string, duration = 2200): void {
  const now = performance.now();
  appStore.set((s) => {
    const filtered = s.messages.filter((m) => m.expires > now && (!key || m.key !== key));
    return { messages: [...filtered, { id: ++messageId, text, kind, key, expires: now + duration }].slice(-5) };
  });
}

export function pruneMessages(): void {
  const now = performance.now();
  const { messages } = appStore.get();
  if (messages.some((m) => m.expires <= now)) appStore.set({ messages: messages.filter((m) => m.expires > now) });
}

let saveTimer: number | null = null;

/** Atualiza o estado e grava no armazenamento (com agrupamento de escritas rápidas, ex.: sliders). */
export function persist(save: SaveData, immediate = false): void {
  appStore.set({ save });
  if (!saveManager) return;
  const write = () => {
    saveTimer = null;
    if (saveManager && !saveManager.save(appStore.get().save)) {
      pushMessage('Não foi possível salvar o progresso (armazenamento cheio ou bloqueado).', 'bad', 'save', 4000);
    }
  };
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  if (immediate) write();
  else saveTimer = window.setTimeout(write, 250);
}

/** Garante que gravações pendentes sejam concluídas (ex.: ao fechar a página). */
export function flushSave(): void {
  if (saveTimer === null || !saveManager) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  saveManager.save(appStore.get().save);
}

export function navigate(screen: Screen): void {
  const state = appStore.get();
  game?.audio.playUi(screen === 'menu' ? 'back' : 'click');
  if (screen === 'settings') appStore.set({ settingsReturn: state.screen === 'settings' ? state.settingsReturn : state.screen });
  appStore.set({ screen });
  if (!game) return;
  if (screen === 'garage') {
    // A garagem conecta os controles de órbita na própria tela.
  } else if (screen !== 'race' && screen !== 'loading') {
    game.setGarageMode('menu', null);
    const save = appStore.get().save;
    const selected = save.garage.owned.find((o) => o.id === save.garage.selected) ?? save.garage.owned[0];
    game.showVehicle(selected.id, selected.paint);
  }
}

export function uiSound(kind: Parameters<Game['audio']['playUi']>[0]): void {
  game?.audio.playUi(kind);
}

/** Libera o áudio no primeiro gesto do usuário. */
export function unlockAudio(): void {
  game?.audio.unlock();
}

export function updateSettings(mutator: (settings: Settings) => Settings): void {
  const save = appStore.get().save;
  const settings = mutator(structuredClone(save.settings));
  const next = { ...save, settings };
  persist(next);
  game?.applySettings(settings);
}

export function updateSetup(partial: Partial<SetupState>): void {
  appStore.set((s) => ({ setup: { ...s.setup, ...partial } }));
}

export async function startRace(config: RaceConfig, title?: string): Promise<void> {
  if (!game) return;
  lastConfig = config;
  const trackName = getTrackDefinition(config.trackId).name;
  appStore.set({ screen: 'loading', loadSteps: [], loadError: null, loadTitle: title ?? `${MODES[config.mode].label} — ${trackName}`, messages: [], race: null });
  const save = appStore.get().save;
  try {
    const personalBest = save.records[config.trackId]?.bestLap ?? null;
    await game.startRace(config, (steps) => appStore.set({ loadSteps: steps }), personalBest);
    appStore.set({
      screen: 'race',
      race: { config, paused: false, pauseView: 'main', results: null, final: false, outcome: null, phase: game.race?.session.phase ?? 'intro', showResults: false },
    });
    pushMessage('Pressione qualquer tecla de direção para pular a apresentação', 'info', 'intro', 2600);
  } catch (error) {
    appStore.set({ loadError: error instanceof Error ? error.message : String(error) });
  }
}

export function retryLastRace(): void {
  if (lastConfig) void startRace({ ...lastConfig, seed: Date.now() % 2147483647 });
}

export async function startFromSetup(): Promise<void> {
  const state = appStore.get();
  const setup = state.setup;
  const save = { ...state.save, lastSetup: { mode: setup.mode, trackId: setup.trackId, vehicleId: setup.vehicleId, laps: setup.laps, opponents: setup.opponents, difficulty: setup.difficulty } };
  persist(save);
  appStore.set({ pendingEvent: null });
  await startRace(buildRaceConfig(setup, save));
}

export function pauseRace(): void {
  const race = appStore.get().race;
  if (!game || !race || race.paused) return;
  game.setPaused(true);
  appStore.set({ race: { ...race, paused: true, pauseView: 'main' } });
  uiSound('click');
}

export function resumeRace(): void {
  const race = appStore.get().race;
  if (!game || !race) return;
  game.setPaused(false);
  appStore.set({ race: { ...race, paused: false, pauseView: 'main' } });
  uiSound('back');
}

export function setPauseView(view: 'main' | 'settings' | 'confirmExit' | 'confirmRestart'): void {
  const race = appStore.get().race;
  if (race) appStore.set({ race: { ...race, pauseView: view } });
  uiSound('click');
}

export function restartRace(): void {
  const race = appStore.get().race;
  if (!game || !race) return;
  game.restartRace();
  appStore.set({ race: { ...race, paused: false, pauseView: 'main', results: null, final: false, outcome: null, showResults: false }, messages: [] });
}

export function exitRace(): void {
  if (!game) return;
  const race = appStore.get().race;
  // Treino livre: registra estatísticas da sessão ao sair (sem recompensas).
  if (race && !race.results && game.race && MODES[race.config.mode].hasFinish === false && game.race.session.raceTime > 5) {
    const results = buildRaceResults(game.race.session, getTrackDefinition(race.config.trackId).name, null);
    const outcome = applyRaceResults(appStore.get().save, results, evaluateAchievements);
    if (outcome.applied) persist(outcome.save);
  }
  game.exitRace();
  const pending = appStore.get().pendingEvent;
  appStore.set({ race: null, messages: [] });
  navigate(pending?.kind === 'career' ? 'career' : pending?.kind === 'championship' ? 'championships' : 'menu');
}

function handleResults(results: RaceResults, final: boolean): void {
  const state = appStore.get();
  const race = state.race;
  if (!race) return;
  // Aplicação idempotente: o mesmo resultado nunca é recompensado duas vezes.
  const outcome = applyRaceResults(state.save, results, evaluateAchievements);
  if (outcome.applied) {
    persist(outcome.save, true);
    if (outcome.levelUp) pushMessage(`Nível ${outcome.levelUp} alcançado!`, 'good', 'level', 3500);
    for (const id of outcome.unlockedAchievements) pushMessage(`Conquista desbloqueada: ${achievementName(id)}`, 'good', `ach-${id}`, 3200);
  }
  appStore.set({
    race: {
      ...race,
      results,
      final,
      outcome: race.outcome && !outcome.applied ? race.outcome : { applied: outcome.applied, levelUp: outcome.levelUp, newRecord: outcome.newRecord, achievements: outcome.unlockedAchievements },
      showResults: true,
    },
  });
}

/** Avança a simulação até os adversários concluírem (resultados finais reais). */
export function fastForwardRace(): void {
  game?.setTimeScale(6);
  pushMessage('Concluindo a corrida dos adversários…', 'info', 'ff', 2000);
}

export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, danger = false): void {
  appStore.set({ confirm: { title, message, confirmLabel, onConfirm, danger } });
}

export function closeConfirm(): void {
  appStore.set({ confirm: null });
}

export function resetProgress(): void {
  if (!saveManager) return;
  const fresh = saveManager.reset();
  appStore.set({ save: fresh });
  game?.applySettings(fresh.settings);
  navigate('menu');
  pushMessage('Progresso redefinido', 'warn', 'reset', 2500);
}

function exposeDebug(): void {
  const params = new URLSearchParams(window.location.search);
  if (!import.meta.env.DEV && params.get('debug') !== '1') return;
  (window as unknown as { __APEX__: unknown }).__APEX__ = {
    get game() {
      return game;
    },
    state: () => game?.debugState(),
    store: appStore,
    setTimeScale: (n: number) => game?.setTimeScale(n),
  };
}
