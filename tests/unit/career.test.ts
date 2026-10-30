import { describe, expect, it } from 'vitest';
import { CAREER, CHARACTERS } from '../../src/career/CareerData';
import { applyCareerChampionshipResult, applyCareerEventResult, buildCareerRaceConfig, eventStatus, isChapterUnlocked, startNewCareer } from '../../src/career/CareerProgress';
import { applyChampionshipRound, getChampionship, POINTS_TABLE, standings } from '../../src/career/Championships';
import { createDefaultSave } from '../../src/persistence/SaveSchema';
import type { RaceResults, RacerResult } from '../../src/racing/RaceTypes';

function fakeResults(resultId: string, order: string[], achieved: boolean): RaceResults {
  const results: RacerResult[] = order.map((id, i) => ({
    id,
    name: id,
    vehicleId: 'valkar-sprint-gt',
    isPlayer: id === 'player',
    position: i + 1,
    finished: true,
    dnf: false,
    totalTime: 100 + i,
    bestLap: 50,
    lapTimes: [50, 50],
    gapToLeader: i,
    progress: 0,
    driftScore: 9000,
    rival: false,
  }));
  const player = results.find((r) => r.isPlayer)!;
  return {
    resultId,
    config: {} as RaceResults['config'],
    trackName: 'x',
    results,
    player,
    objectives: [{ objective: { type: 'position', value: 3, label: 'x' }, achieved }],
    rewards: { credits: 0, xp: 0, reputation: 0, breakdown: [] },
    valid: true,
    driftScore: 0,
    bestDriftChain: 0,
    collisions: 0,
    distance: 0,
    topSpeed: 0,
    durationSeconds: 0,
  };
}

describe('Carreira', () => {
  it('conteúdo fixo: todos os diálogos usam personagens existentes e não há sorteio', () => {
    for (const chapter of CAREER) {
      for (const line of [...chapter.intro, ...chapter.outro, ...chapter.events.flatMap((e) => [...e.before, ...e.after])]) {
        expect(line.speaker === 'player' || line.speaker in CHARACTERS).toBe(true);
        expect(line.text.length).toBeGreaterThan(3);
      }
    }
    const save = startNewCareer(createDefaultSave());
    const a = buildCareerRaceConfig(CAREER[0].events[1], save, 42);
    const b = buildCareerRaceConfig(CAREER[0].events[1], save, 42);
    expect(a.opponents).toEqual(b.opponents);
  });

  it('desbloqueio sequencial de eventos e capítulos', () => {
    let save = startNewCareer(createDefaultSave());
    expect(eventStatus(save, 'c1-treino')).toBe('available');
    expect(eventStatus(save, 'c1-copa')).toBe('locked');
    expect(isChapterUnlocked(save, 1)).toBe(false);
    const res = applyCareerEventResult(save, 'c1-treino', fakeResults('r1', ['player'], true));
    save = res.save;
    expect(res.completedEvent?.id).toBe('c1-treino');
    expect(eventStatus(save, 'c1-treino')).toBe('completed');
    expect(eventStatus(save, 'c1-copa')).toBe('available');
  });

  it('bônus de conclusão é pago uma única vez; objetivo não cumprido não conclui', () => {
    let save = startNewCareer(createDefaultSave());
    const failed = applyCareerEventResult(save, 'c1-treino', fakeResults('r0', ['player'], false));
    expect(failed.completedEvent).toBeNull();
    const credits0 = save.profile.credits;
    save = applyCareerEventResult(save, 'c1-treino', fakeResults('r1', ['player'], true)).save;
    const bonus = CAREER[0].events[0].completionBonus.credits;
    expect(save.profile.credits).toBe(credits0 + bonus);
    const again = applyCareerEventResult(save, 'c1-treino', fakeResults('r2', ['player'], true));
    expect(again.completedEvent).toBeNull();
    expect(again.save.profile.credits).toBe(save.profile.credits);
  });

  it('concluir todos os eventos do capítulo libera o próximo e paga o bônus de capítulo', () => {
    let save = startNewCareer(createDefaultSave());
    let chapterDone = null;
    for (const event of CAREER[0].events) {
      const out = applyCareerEventResult(save, event.id, fakeResults(`r-${event.id}`, ['player', 'a', 'b'], true));
      save = out.save;
      chapterDone = out.completedChapter ?? chapterDone;
    }
    expect(chapterDone?.id).toBe('cap-1');
    expect(isChapterUnlocked(save, 1)).toBe(true);
    expect(eventStatus(save, 'c2-drift')).toBe('available');
  });
});

describe('Campeonatos', () => {
  it('pontua cada etapa uma única vez e encerra com prêmio e posição final reais', () => {
    let save = createDefaultSave();
    const def = getChampionship('copa-litoral');
    const field = def.field.map((f) => f.id);
    const credits0 = save.profile.credits;
    const r1 = fakeResults('e1', ['player', ...field], true);
    let update = applyChampionshipRound(save, def.id, r1);
    save = update.save;
    expect(save.championships[def.id].points.player).toBe(POINTS_TABLE[0]);
    // Mesmo resultado novamente: ignorado.
    update = applyChampionshipRound(save, def.id, r1);
    expect(update.applied).toBe(false);
    save = applyChampionshipRound(save, def.id, fakeResults('e2', [field[0], 'player', ...field.slice(1)], true)).save;
    update = applyChampionshipRound(save, def.id, fakeResults('e3', ['player', ...field], true));
    save = update.save;
    expect(update.finished).toBe(true);
    expect(save.championships[def.id].points.player).toBe(25 + 18 + 25);
    expect(update.finalPosition).toBe(1);
    expect(save.profile.credits).toBe(credits0 + def.rewards[0].credits);
    const table = standings(def, save.championships[def.id], 'P');
    expect(table[0].isPlayer).toBe(true);
    // Campeonato encerrado não aceita novas etapas.
    expect(applyChampionshipRound(save, def.id, fakeResults('e4', ['player', ...field], true)).applied).toBe(false);
  });

  it('campeonato regional conclui o evento da carreira quando o jogador termina no top 3', () => {
    let save = startNewCareer(createDefaultSave());
    for (const event of CAREER[0].events) save = applyCareerEventResult(save, event.id, fakeResults(`a-${event.id}`, ['player'], true)).save;
    save = applyCareerEventResult(save, 'c2-drift', fakeResults('d', ['player'], true)).save;
    save = applyCareerEventResult(save, 'c2-serra', fakeResults('s', ['player'], true)).save;
    expect(eventStatus(save, 'c2-regional')).toBe('available');
    expect(applyCareerChampionshipResult(save, 'regional-litoral', 5).completedEvent).toBeNull();
    const out = applyCareerChampionshipResult(save, 'regional-litoral', 2);
    expect(out.completedEvent?.id).toBe('c2-regional');
    expect(out.completedChapter?.id).toBe('cap-2');
    expect(isChapterUnlocked(out.save, 2)).toBe(true);
  });
});
