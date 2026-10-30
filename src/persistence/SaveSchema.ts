/**
 * Esquema versionado do progresso salvo.
 * - Cada campo é validado individualmente: um campo ausente/corrompido volta ao padrão SEM apagar o resto.
 * - Migrações por versão permitem evoluir o formato sem perder progresso.
 * - Nenhum segredo ou dado sensível é armazenado.
 */
import type { DifficultyId } from '../ai/Difficulty';
import { STARTER_VEHICLE_ID } from '../vehicles/VehicleCatalog';
import {
  isRecord,
  readBoolean,
  readEnum,
  readInteger,
  readNumber,
  readOptionalNumber,
  readRecord,
  readString,
  readStringArray,
  type UnknownRecord,
} from '../utils/validation';

export const SAVE_VERSION = 1;

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type LevelSetting = 'low' | 'medium' | 'high';
export type ParticleSetting = 'off' | 'low' | 'medium' | 'high';
export type DrawDistance = 'near' | 'medium' | 'far';
export type CameraView = 'chase' | 'chaseFar' | 'hood' | 'cockpit' | 'cinematic';
export type TouchMode = 'auto' | 'on' | 'off';
export type AssistLevel = 'off' | 'low' | 'medium' | 'high';

export interface Settings {
  graphics: {
    preset: QualityPreset;
    renderScale: number;
    shadows: ShadowQuality;
    drawDistance: DrawDistance;
    particles: ParticleSetting;
    effects: LevelSetting;
    /** 0 = sincronizado com o monitor (requestAnimationFrame). */
    fpsLimit: 0 | 30 | 60;
    showFps: boolean;
  };
  controls: {
    steeringSensitivity: number;
    assist: AssistLevel;
    touch: TouchMode;
    gamepadDeadzone: number;
  };
  camera: {
    defaultView: CameraView;
    distance: number;
    height: number;
    fov: number;
    shake: number;
  };
  audio: {
    master: number;
    engine: number;
    sfx: number;
    ui: number;
    ambience: number;
  };
  gameplay: {
    units: 'kmh' | 'mph';
    minimalHud: boolean;
    showMinimap: boolean;
    autoPause: boolean;
  };
  language: 'pt-BR';
}

export interface OwnedVehicle {
  id: string;
  paint: string;
  ownedPaints: string[];
}

export interface TrackRecord {
  bestLap: number | null;
  bestLapVehicle: string | null;
  bestRace: number | null;
  bestDrift: number | null;
}

export interface RaceHistoryEntry {
  id: string;
  date: string;
  mode: string;
  trackId: string;
  vehicleId: string;
  position: number;
  racers: number;
  totalTime: number | null;
  bestLap: number | null;
  credits: number;
  xp: number;
}

export interface ChampionshipProgress {
  round: number;
  points: Record<string, number>;
  completed: boolean;
  finalPosition: number | null;
}

export interface SaveData {
  version: number;
  createdAt: string;
  updatedAt: string;
  settings: Settings;
  profile: {
    driverName: string;
    credits: number;
    xp: number;
    reputation: number;
  };
  career: {
    started: boolean;
    chapter: number;
    completedEvents: string[];
    eventBest: Record<string, number>;
    seenDialogues: string[];
    completedChapters: string[];
  };
  garage: {
    owned: OwnedVehicle[];
    selected: string;
  };
  records: Record<string, TrackRecord>;
  stats: {
    racesStarted: number;
    racesFinished: number;
    wins: number;
    podiums: number;
    distanceKm: number;
    driftPoints: number;
    bestDriftChain: number;
    collisions: number;
    timeDrivingSec: number;
    topSpeedKmh: number;
  };
  history: RaceHistoryEntry[];
  achievements: Record<string, string>;
  championships: Record<string, ChampionshipProgress>;
  /** Identificadores de resultados já recompensados (evita recompensas duplicadas). */
  rewardedResults: string[];
  lastSetup: {
    mode: string;
    trackId: string;
    vehicleId: string;
    laps: number;
    opponents: number;
    difficulty: DifficultyId;
  };
}

export function createDefaultSettings(): Settings {
  return {
    graphics: { preset: 'high', renderScale: 1, shadows: 'medium', drawDistance: 'far', particles: 'medium', effects: 'medium', fpsLimit: 0, showFps: false },
    controls: { steeringSensitivity: 1, assist: 'medium', touch: 'auto', gamepadDeadzone: 0.12 },
    camera: { defaultView: 'chase', distance: 1, height: 1, fov: 68, shake: 0.6 },
    audio: { master: 0.8, engine: 0.8, sfx: 0.8, ui: 0.6, ambience: 0.5 },
    gameplay: { units: 'kmh', minimalHud: false, showMinimap: true, autoPause: true },
    language: 'pt-BR',
  };
}

export function createDefaultSave(now = new Date()): SaveData {
  const iso = now.toISOString();
  return {
    version: SAVE_VERSION,
    createdAt: iso,
    updatedAt: iso,
    settings: createDefaultSettings(),
    profile: { driverName: 'Piloto', credits: 15000, xp: 0, reputation: 0 },
    career: { started: false, chapter: 0, completedEvents: [], eventBest: {}, seenDialogues: [], completedChapters: [] },
    garage: { owned: [{ id: STARTER_VEHICLE_ID, paint: 'glacier', ownedPaints: ['glacier', 'onyx'] }], selected: STARTER_VEHICLE_ID },
    records: {},
    stats: {
      racesStarted: 0,
      racesFinished: 0,
      wins: 0,
      podiums: 0,
      distanceKm: 0,
      driftPoints: 0,
      bestDriftChain: 0,
      collisions: 0,
      timeDrivingSec: 0,
      topSpeedKmh: 0,
    },
    history: [],
    achievements: {},
    championships: {},
    rewardedResults: [],
    lastSetup: { mode: 'quickRace', trackId: 'costa-azul', vehicleId: STARTER_VEHICLE_ID, laps: 3, opponents: 5, difficulty: 'normal' },
  };
}

// ---------------------------------------------------------------------------
// Validação campo a campo
// ---------------------------------------------------------------------------

export function validateSettings(raw: unknown): Settings {
  const d = createDefaultSettings();
  if (!isRecord(raw)) return d;
  const g = readRecord(raw, 'graphics');
  const c = readRecord(raw, 'controls');
  const cam = readRecord(raw, 'camera');
  const a = readRecord(raw, 'audio');
  const gp = readRecord(raw, 'gameplay');
  const fps = readNumber(g, 'fpsLimit', 0);
  return {
    graphics: {
      preset: readEnum(g, 'preset', ['low', 'medium', 'high', 'ultra', 'custom'] as const, d.graphics.preset),
      renderScale: readNumber(g, 'renderScale', d.graphics.renderScale, 0.5, 1.5),
      shadows: readEnum(g, 'shadows', ['off', 'low', 'medium', 'high'] as const, d.graphics.shadows),
      drawDistance: readEnum(g, 'drawDistance', ['near', 'medium', 'far'] as const, d.graphics.drawDistance),
      particles: readEnum(g, 'particles', ['off', 'low', 'medium', 'high'] as const, d.graphics.particles),
      effects: readEnum(g, 'effects', ['low', 'medium', 'high'] as const, d.graphics.effects),
      fpsLimit: fps === 30 || fps === 60 ? fps : 0,
      showFps: readBoolean(g, 'showFps', d.graphics.showFps),
    },
    controls: {
      steeringSensitivity: readNumber(c, 'steeringSensitivity', d.controls.steeringSensitivity, 0.5, 1.5),
      assist: readEnum(c, 'assist', ['off', 'low', 'medium', 'high'] as const, d.controls.assist),
      touch: readEnum(c, 'touch', ['auto', 'on', 'off'] as const, d.controls.touch),
      gamepadDeadzone: readNumber(c, 'gamepadDeadzone', d.controls.gamepadDeadzone, 0.02, 0.4),
    },
    camera: {
      defaultView: readEnum(cam, 'defaultView', ['chase', 'chaseFar', 'hood', 'cockpit', 'cinematic'] as const, d.camera.defaultView),
      distance: readNumber(cam, 'distance', d.camera.distance, 0.7, 1.5),
      height: readNumber(cam, 'height', d.camera.height, 0.7, 1.5),
      fov: readNumber(cam, 'fov', d.camera.fov, 50, 95),
      shake: readNumber(cam, 'shake', d.camera.shake, 0, 1),
    },
    audio: {
      master: readNumber(a, 'master', d.audio.master, 0, 1),
      engine: readNumber(a, 'engine', d.audio.engine, 0, 1),
      sfx: readNumber(a, 'sfx', d.audio.sfx, 0, 1),
      ui: readNumber(a, 'ui', d.audio.ui, 0, 1),
      ambience: readNumber(a, 'ambience', d.audio.ambience, 0, 1),
    },
    gameplay: {
      units: readEnum(gp, 'units', ['kmh', 'mph'] as const, d.gameplay.units),
      minimalHud: readBoolean(gp, 'minimalHud', d.gameplay.minimalHud),
      showMinimap: readBoolean(gp, 'showMinimap', d.gameplay.showMinimap),
      autoPause: readBoolean(gp, 'autoPause', d.gameplay.autoPause),
    },
    language: 'pt-BR',
  };
}

function validateRecords(raw: UnknownRecord): Record<string, TrackRecord> {
  const out: Record<string, TrackRecord> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 100)) {
    if (!isRecord(value)) continue;
    out[key.slice(0, 64)] = {
      bestLap: readOptionalNumber(value, 'bestLap', 1, 36000),
      bestLapVehicle: typeof value.bestLapVehicle === 'string' ? value.bestLapVehicle.slice(0, 64) : null,
      bestRace: readOptionalNumber(value, 'bestRace', 1, 360000),
      bestDrift: readOptionalNumber(value, 'bestDrift', 0, 1e9),
    };
  }
  return out;
}

function validateHistory(raw: unknown): RaceHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RaceHistoryEntry[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!isRecord(item)) continue;
    out.push({
      id: readString(item, 'id', '', 80),
      date: readString(item, 'date', '', 40),
      mode: readString(item, 'mode', 'quickRace', 40),
      trackId: readString(item, 'trackId', '', 64),
      vehicleId: readString(item, 'vehicleId', '', 64),
      position: readInteger(item, 'position', 1, 1, 64),
      racers: readInteger(item, 'racers', 1, 1, 64),
      totalTime: readOptionalNumber(item, 'totalTime', 0, 360000),
      bestLap: readOptionalNumber(item, 'bestLap', 0, 36000),
      credits: readInteger(item, 'credits', 0, 0, 1e7),
      xp: readInteger(item, 'xp', 0, 0, 1e7),
    });
  }
  return out;
}

function validateOwned(raw: unknown): OwnedVehicle[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OwnedVehicle[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!isRecord(item)) continue;
    const id = readString(item, 'id', '', 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, paint: readString(item, 'paint', '', 64), ownedPaints: readStringArray(item, 'ownedPaints', 32) });
  }
  return out;
}

function validateChampionships(raw: UnknownRecord): Record<string, ChampionshipProgress> {
  const out: Record<string, ChampionshipProgress> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 50)) {
    if (!isRecord(value)) continue;
    const pointsRaw = readRecord(value, 'points');
    const points: Record<string, number> = {};
    for (const [racer, pts] of Object.entries(pointsRaw).slice(0, 32)) {
      if (typeof pts === 'number' && Number.isFinite(pts) && pts >= 0) points[racer.slice(0, 64)] = Math.round(pts);
    }
    out[key.slice(0, 64)] = {
      round: readInteger(value, 'round', 0, 0, 50),
      points,
      completed: readBoolean(value, 'completed', false),
      finalPosition: readOptionalNumber(value, 'finalPosition', 1, 64),
    };
  }
  return out;
}

/** Migrações entre versões (atualmente apenas v1). */
function migrate(raw: UnknownRecord): UnknownRecord {
  const version = readInteger(raw, 'version', 1, 0, 1000);
  if (version > SAVE_VERSION) {
    // Versão futura: tentamos ler os campos conhecidos sem descartar o arquivo.
    return raw;
  }
  return raw;
}

export interface ValidationResult {
  data: SaveData;
  warnings: string[];
}

export function validateSave(input: unknown): ValidationResult {
  const warnings: string[] = [];
  const d = createDefaultSave();
  if (!isRecord(input)) {
    warnings.push('Dados salvos inválidos; um novo perfil foi criado.');
    return { data: d, warnings };
  }
  const raw = migrate(input);
  const profile = readRecord(raw, 'profile');
  const career = readRecord(raw, 'career');
  const garage = readRecord(raw, 'garage');
  const stats = readRecord(raw, 'stats');
  const lastSetup = readRecord(raw, 'lastSetup');

  let owned = validateOwned(garage.owned);
  if (owned.length === 0) {
    warnings.push('Garagem vazia ou corrompida; o carro inicial foi restaurado.');
    owned = d.garage.owned;
  }
  const selectedRaw = readString(garage, 'selected', d.garage.selected, 64);
  const selected = owned.some((o) => o.id === selectedRaw) ? selectedRaw : owned[0].id;

  const eventBestRaw = readRecord(career, 'eventBest');
  const eventBest: Record<string, number> = {};
  for (const [k, v] of Object.entries(eventBestRaw).slice(0, 200)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 64) eventBest[k.slice(0, 64)] = Math.round(v);
  }

  const achievementsRaw = readRecord(raw, 'achievements');
  const achievements: Record<string, string> = {};
  for (const [k, v] of Object.entries(achievementsRaw).slice(0, 200)) {
    if (typeof v === 'string') achievements[k.slice(0, 64)] = v.slice(0, 40);
  }

  const data: SaveData = {
    version: SAVE_VERSION,
    createdAt: readString(raw, 'createdAt', d.createdAt, 40),
    updatedAt: readString(raw, 'updatedAt', d.updatedAt, 40),
    settings: validateSettings(raw.settings),
    profile: {
      driverName: readString(profile, 'driverName', d.profile.driverName, 24).trim() || d.profile.driverName,
      credits: readInteger(profile, 'credits', d.profile.credits, 0, 1e9),
      xp: readInteger(profile, 'xp', d.profile.xp, 0, 1e9),
      reputation: readInteger(profile, 'reputation', d.profile.reputation, 0, 1e9),
    },
    career: {
      started: readBoolean(career, 'started', false),
      chapter: readInteger(career, 'chapter', 0, 0, 100),
      completedEvents: readStringArray(career, 'completedEvents', 500),
      eventBest,
      seenDialogues: readStringArray(career, 'seenDialogues', 500),
      completedChapters: readStringArray(career, 'completedChapters', 100),
    },
    garage: { owned, selected },
    records: validateRecords(readRecord(raw, 'records')),
    stats: {
      racesStarted: readInteger(stats, 'racesStarted', 0, 0, 1e7),
      racesFinished: readInteger(stats, 'racesFinished', 0, 0, 1e7),
      wins: readInteger(stats, 'wins', 0, 0, 1e7),
      podiums: readInteger(stats, 'podiums', 0, 0, 1e7),
      distanceKm: readNumber(stats, 'distanceKm', 0, 0, 1e7),
      driftPoints: readInteger(stats, 'driftPoints', 0, 0, 1e12),
      bestDriftChain: readInteger(stats, 'bestDriftChain', 0, 0, 1e12),
      collisions: readInteger(stats, 'collisions', 0, 0, 1e9),
      timeDrivingSec: readNumber(stats, 'timeDrivingSec', 0, 0, 1e9),
      topSpeedKmh: readNumber(stats, 'topSpeedKmh', 0, 0, 600),
    },
    history: validateHistory(raw.history),
    achievements,
    championships: validateChampionships(readRecord(raw, 'championships')),
    rewardedResults: readStringArray(raw, 'rewardedResults', 400),
    lastSetup: {
      mode: readString(lastSetup, 'mode', d.lastSetup.mode, 32),
      trackId: readString(lastSetup, 'trackId', d.lastSetup.trackId, 64),
      vehicleId: readString(lastSetup, 'vehicleId', d.lastSetup.vehicleId, 64),
      laps: readInteger(lastSetup, 'laps', d.lastSetup.laps, 1, 20),
      opponents: readInteger(lastSetup, 'opponents', d.lastSetup.opponents, 0, 7),
      difficulty: readEnum(lastSetup, 'difficulty', ['easy', 'normal', 'hard'] as const, d.lastSetup.difficulty),
    },
  };
  return { data, warnings };
}
