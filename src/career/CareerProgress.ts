/**
 * Regras de progresso da carreira e montagem das corridas de carreira/campeonato.
 * Funções puras sobre o SaveData (testáveis).
 */
import { DRIVER_NAMES, pickOpponentVehicles } from '../app/raceSetup';
import type { SaveData } from '../persistence/SaveSchema';
import type { RaceConfig, RaceResults, RacerEntry } from '../racing/RaceTypes';
import { SeededRandom, hashString } from '../utils/rng';
import { assistLevelValue } from '../vehicles/VehicleController';
import { getVehicle } from '../vehicles/VehicleCatalog';
import { CAREER, findCareerEvent, type CareerChapter, type CareerEvent } from './CareerData';
import { getChampionship } from './Championships';
import { levelFromXp } from './Progression';

export type EventStatus = 'locked' | 'available' | 'completed';

export function isChapterUnlocked(save: SaveData, chapterIndex: number): boolean {
  if (!save.career.started) return false;
  if (chapterIndex === 0) return true;
  return save.career.completedChapters.includes(CAREER[chapterIndex - 1].id);
}

export function eventStatus(save: SaveData, eventId: string): EventStatus {
  const found = findCareerEvent(eventId);
  if (!found) return 'locked';
  if (save.career.completedEvents.includes(eventId)) return 'completed';
  if (!isChapterUnlocked(save, found.chapterIndex)) return 'locked';
  const index = found.chapter.events.findIndex((e) => e.id === eventId);
  if (index === 0) return 'available';
  return save.career.completedEvents.includes(found.chapter.events[index - 1].id) ? 'available' : 'locked';
}

/** Próximo evento disponível (para "Continuar carreira"). */
export function nextCareerEvent(save: SaveData): CareerEvent | null {
  for (const chapter of CAREER) for (const event of chapter.events) if (eventStatus(save, event.id) === 'available') return event;
  return null;
}

export function careerFinished(save: SaveData): boolean {
  return CAREER.every((c) => save.career.completedChapters.includes(c.id));
}

export function startNewCareer(save: SaveData): SaveData {
  const next = structuredClone(save);
  next.career = { started: true, chapter: 0, completedEvents: [], eventBest: {}, seenDialogues: [], completedChapters: [] };
  delete next.championships['regional-litoral'];
  return next;
}

export function markDialogueSeen(save: SaveData, id: string): SaveData {
  if (save.career.seenDialogues.includes(id)) return save;
  return { ...save, career: { ...save.career, seenDialogues: [...save.career.seenDialogues, id] } };
}

function playerEntry(save: SaveData): RacerEntry {
  const owned = save.garage.owned.find((o) => o.id === save.garage.selected) ?? save.garage.owned[0];
  return { id: 'player', name: save.profile.driverName, vehicleId: owned.id, paint: owned.paint };
}

export function buildCareerRaceConfig(event: CareerEvent, save: SaveData, seed = Date.now() % 2147483647): RaceConfig {
  const rng = new SeededRandom(hashString(`${event.id}-${seed}`));
  const player = playerEntry(save);
  const opponents: RacerEntry[] = [...event.rivals];
  const needed = Math.max(0, event.fieldSize - 1 - opponents.length);
  const vehicles = pickOpponentVehicles(player.vehicleId, needed, rng, event.difficulty);
  const names = DRIVER_NAMES.filter((n) => !opponents.some((o) => o.name === n));
  for (let i = 0; i < needed; i++) {
    const def = getVehicle(vehicles[i]);
    opponents.push({ id: `career-ai-${i + 1}`, name: names[i % names.length], vehicleId: def.id, paint: def.visual.paints[i % def.visual.paints.length].id });
  }
  return {
    mode: event.mode,
    trackId: event.trackId,
    laps: event.laps,
    player,
    opponents: event.mode === 'career' ? opponents : [],
    difficulty: event.difficulty,
    seed,
    eventId: event.id,
    eventName: event.title,
    objectives: event.objectives,
    rewardBase: event.rewardBase,
    xpBase: event.xpBase,
    timeLimit: event.timeLimit,
    assist: assistLevelValue(save.settings.controls.assist),
  };
}

export function buildChampionshipRaceConfig(championshipId: string, save: SaveData, seed = Date.now() % 2147483647): RaceConfig {
  const def = getChampionship(championshipId);
  const progress = save.championships[championshipId];
  const roundIndex = Math.min(progress?.round ?? 0, def.rounds.length - 1);
  const round = def.rounds[roundIndex];
  const lengthFactor = round.laps * 0.9 + 0.6;
  return {
    mode: 'championship',
    trackId: round.trackId,
    laps: round.laps,
    player: playerEntry(save),
    opponents: def.field,
    difficulty: def.difficulty,
    seed,
    eventId: `${championshipId}:${roundIndex}`,
    eventName: `${def.name} — etapa ${roundIndex + 1}/${def.rounds.length}`,
    objectives: [{ type: 'position', value: 3, label: 'Terminar a etapa no pódio' }],
    rewardBase: Math.round(1500 * lengthFactor),
    xpBase: Math.round(220 * lengthFactor),
    assist: assistLevelValue(save.settings.controls.assist),
  };
}

export function isChampionshipUnlocked(save: SaveData, championshipId: string): boolean {
  const def = getChampionship(championshipId);
  if (def.careerOnly) {
    const event = CAREER.flatMap((c) => c.events).find((e) => e.championshipId === championshipId);
    return !!event && eventStatus(save, event.id) !== 'locked';
  }
  return levelFromXp(save.profile.xp) >= def.unlockLevel;
}

export interface CareerOutcome {
  save: SaveData;
  completedEvent: CareerEvent | null;
  completedChapter: CareerChapter | null;
  bonusCredits: number;
}

function completeEvent(save: SaveData, event: CareerEvent): CareerOutcome {
  if (save.career.completedEvents.includes(event.id)) return { save, completedEvent: null, completedChapter: null, bonusCredits: 0 };
  const next = structuredClone(save);
  next.career.completedEvents.push(event.id);
  next.profile.credits += event.completionBonus.credits;
  next.profile.xp += event.completionBonus.xp;
  next.profile.reputation += event.completionBonus.reputation;
  let bonusCredits = event.completionBonus.credits;
  let completedChapter: CareerChapter | null = null;
  const found = findCareerEvent(event.id)!;
  const chapterDone = found.chapter.events.every((e) => next.career.completedEvents.includes(e.id));
  if (chapterDone && !next.career.completedChapters.includes(found.chapter.id)) {
    next.career.completedChapters.push(found.chapter.id);
    next.career.chapter = Math.min(CAREER.length - 1, found.chapterIndex + 1);
    next.profile.credits += found.chapter.chapterBonus.credits;
    next.profile.xp += found.chapter.chapterBonus.xp;
    next.profile.reputation += found.chapter.chapterBonus.reputation;
    bonusCredits += found.chapter.chapterBonus.credits;
    completedChapter = found.chapter;
  }
  return { save: next, completedEvent: event, completedChapter, bonusCredits };
}

/** Aplica o resultado de um evento de carreira (objetivos cumpridos → conclusão com bônus, uma única vez). */
export function applyCareerEventResult(save: SaveData, eventId: string, results: RaceResults): CareerOutcome {
  const found = findCareerEvent(eventId);
  if (!found || found.event.championshipId) return { save, completedEvent: null, completedChapter: null, bonusCredits: 0 };
  let next = save;
  const best = save.career.eventBest[eventId];
  if (results.player.finished && (best === undefined || results.player.position < best)) {
    next = { ...save, career: { ...save.career, eventBest: { ...save.career.eventBest, [eventId]: results.player.position } } };
  }
  const achieved = results.player.finished && results.objectives.length > 0 && results.objectives.every((o) => o.achieved);
  if (!achieved) return { save: next, completedEvent: null, completedChapter: null, bonusCredits: 0 };
  return completeEvent(next, found.event);
}

/** Conclusão do evento de carreira ligado a um campeonato (ex.: regional), conforme a posição final. */
export function applyCareerChampionshipResult(save: SaveData, championshipId: string, finalPosition: number): CareerOutcome {
  const event = CAREER.flatMap((c) => c.events).find((e) => e.championshipId === championshipId);
  if (!event) return { save, completedEvent: null, completedChapter: null, bonusCredits: 0 };
  const objective = event.objectives.find((o) => o.type === 'position');
  if (objective && finalPosition > objective.value) return { save, completedEvent: null, completedChapter: null, bonusCredits: 0 };
  return completeEvent(save, event);
}
