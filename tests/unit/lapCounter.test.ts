import { describe, expect, it } from 'vitest';
import { GateTracker, type GateCrossing, type GatePlane } from '../../src/racing/CheckpointSystem';
import { LapCounter } from '../../src/racing/LapCounter';
import { computeRaceProgress, rankEntries } from '../../src/racing/RaceClassification';

/** Circuito retangular sintético: portais ao longo de um quadrado de 400 m (sentido anti-horário visto de cima). */
function squareGates(): GatePlane[] {
  // Percurso: (0,0)->(400,0)->(400,400)->(0,400)->(0,0); portais nos pontos médios e cantos.
  const defs: Array<[number, number, number, number]> = [
    [200, 0, 1, 0], // 0 largada: no meio do lado inferior, sentido +x
    [400, 200, 0, 1], // 1: lado direito, sentido +z
    [200, 400, -1, 0], // 2: lado superior, sentido -x
    [0, 200, 0, -1], // 3: lado esquerdo, sentido -z
  ];
  return defs.map(([x, z, nx, nz], index) => ({
    index,
    position: { x, y: 0, z },
    normal: { x: nx, y: 0, z: nz },
    right: { x: nz, y: 0, z: -nx },
    up: { x: 0, y: 1, z: 0 },
    halfWidth: 15,
    height: 10,
  }));
}

/** Gera posições ao longo do quadrado a partir de uma distância (perímetro 1600 m, origem no portal 0). */
function pointAt(distance: number): { x: number; y: number; z: number } {
  const d = ((distance % 1600) + 1600) % 1600;
  const along = (d + 200) % 1600; // origem do percurso em (0,0)
  if (along < 400) return { x: along, y: 0.5, z: 0 };
  if (along < 800) return { x: 400, y: 0.5, z: along - 400 };
  if (along < 1200) return { x: 400 - (along - 800), y: 0.5, z: 400 };
  return { x: 0, y: 0.5, z: 400 - (along - 1200) };
}

function drive(tracker: GateTracker, counter: LapCounter, from: number, to: number, startTime: number, speed = 50) {
  const events: ReturnType<LapCounter['handleCrossing']>[] = [];
  const crossings: GateCrossing[] = [];
  const step = 0.4 * Math.sign(to - from);
  let t = startTime;
  for (let d = from; step > 0 ? d <= to : d >= to; d += step) {
    t += Math.abs(step) / speed;
    crossings.length = 0;
    tracker.update(pointAt(d), crossings);
    for (const c of crossings) events.push(counter.handleCrossing(c, t));
  }
  return { events, time: t };
}

describe('GateTracker + LapCounter', () => {
  it('conta voltas válidas e termina a corrida', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 3, 'green');
    tracker.reset(pointAt(-20));
    counter.start(0);
    const { events } = drive(tracker, counter, -20, 1600 * 3 + 10, 0);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'start')).toHaveLength(1);
    expect(types.filter((t) => t === 'lap')).toHaveLength(2);
    expect(types.filter((t) => t === 'finish')).toHaveLength(1);
    expect(counter.finished).toBe(true);
    expect(counter.lapsCompleted).toBe(3);
    expect(counter.lapTimes).toHaveLength(3);
    // Volta 1 inclui o trecho do grid até a linha (20 m), as demais têm 1600 m a 50 m/s = 32 s.
    expect(counter.lapTimes[1]).toBeCloseTo(32, 0);
    expect(counter.lapTimes[2]).toBeCloseTo(32, 0);
    expect(counter.bestLap).toBeCloseTo(32, 0);
  });

  it('não conta volta em sentido contrário', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 3);
    tracker.reset(pointAt(-20));
    counter.start(0);
    // Larga para frente, cruza a linha, depois dá meia-volta e percorre o circuito ao contrário.
    drive(tracker, counter, -20, 50, 0);
    expect(counter.progress).toBe(1);
    drive(tracker, counter, 50, -1600 * 2, 10);
    expect(counter.lapsCompleted).toBe(0);
    expect(counter.progress).toBe(0);
    expect(counter.finished).toBe(false);
  });

  it('ignora checkpoints pulados (atalho) e não valida a volta', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 2);
    tracker.reset(pointAt(-20));
    counter.start(0);
    drive(tracker, counter, -20, 450, 0); // cruza largada (0) e portal 1 (em 400)
    expect(counter.progress).toBe(2);
    // "Atalho": teleporta para depois do portal 2, sem cruzá-lo, e segue até a linha.
    tracker.reset(pointAt(900));
    const { events } = drive(tracker, counter, 900, 1650, 20);
    // Cruzou o portal 3 e a linha sem ter cruzado o portal 2: nada disso conta.
    expect(events.every((e) => e.type === 'ignored')).toBe(true);
    expect(counter.lapsCompleted).toBe(0);
    expect(counter.nextGate).toBe(2);
  });

  it('não conta o mesmo cruzamento duas vezes com oscilação sobre a linha (debounce)', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates, { hysteresis: 0.25 });
    const counter = new LapCounter(gates.length, true, 3);
    tracker.reset(pointAt(-5));
    counter.start(0);
    const crossings: GateCrossing[] = [];
    let t = 0;
    // Oscila ±0.2 m em torno da linha (dentro da histerese) muitas vezes.
    for (let i = 0; i < 200; i++) {
      crossings.length = 0;
      tracker.update(pointAt(i % 2 === 0 ? 0.2 : -0.2), crossings);
      for (const c of crossings) counter.handleCrossing(c, (t += 0.01));
    }
    expect(counter.progress).toBe(0);
    // Agora cruza de verdade, depois oscila acima da histerese repetidamente.
    const events: string[] = [];
    for (let i = 0; i < 50; i++) {
      crossings.length = 0;
      tracker.update(pointAt(i % 2 === 0 ? 1 : -1), crossings);
      for (const c of crossings) events.push(counter.handleCrossing(c, (t += 0.01)).type);
    }
    // Cada ida e volta é um avanço seguido de um recuo: o progresso nunca passa de 1.
    expect(counter.progress).toBeLessThanOrEqual(1);
    expect(counter.lapsCompleted).toBe(0);
    expect(events.filter((e) => e === 'lap' || e === 'finish')).toHaveLength(0);
  });

  it('recuar sobre a linha desfaz a volta concluída', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 3);
    tracker.reset(pointAt(-20));
    counter.start(0);
    drive(tracker, counter, -20, 1610, 0);
    expect(counter.lapsCompleted).toBe(1);
    drive(tracker, counter, 1610, 1590, 40);
    expect(counter.lapsCompleted).toBe(0);
    expect(counter.lapTimes).toHaveLength(0);
    drive(tracker, counter, 1590, 1620, 41);
    expect(counter.lapsCompleted).toBe(1);
    expect(counter.lapTimes).toHaveLength(1);
  });

  it('recuperação (teleporte) não altera voltas nem progresso', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 3);
    tracker.reset(pointAt(-20));
    counter.start(0);
    drive(tracker, counter, -20, 600, 0);
    const progress = counter.progress;
    // Recupera para um ponto seguro entre o último portal (1 em 400) e o próximo (2 em 800).
    tracker.reset(pointAt(560));
    const crossings: GateCrossing[] = [];
    tracker.update(pointAt(560.3), crossings);
    expect(crossings).toHaveLength(0);
    expect(counter.progress).toBe(progress);
  });

  it('modo contrarrelógio inicia a cronometragem no primeiro cruzamento', () => {
    const gates = squareGates();
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, true, 2, 'firstCrossing');
    tracker.reset(pointAt(-100));
    counter.start(0);
    expect(counter.currentLapTime(5)).toBeNull();
    const { time } = drive(tracker, counter, -100, 1700, 0);
    expect(counter.lapTimes).toHaveLength(1);
    expect(counter.lapTimes[0]).toBeCloseTo(32, 0);
    expect(counter.currentLapTime(time)).not.toBeNull();
  });

  it('sprint: largada no primeiro portal e chegada no último', () => {
    const gates: GatePlane[] = [0, 250, 500, 750, 1000].map((x, index) => ({
      index,
      position: { x, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      right: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
      halfWidth: 12,
      height: 10,
    }));
    const tracker = new GateTracker(gates);
    const counter = new LapCounter(gates.length, false, 1);
    tracker.reset({ x: -30, y: 0.5, z: 0 });
    counter.start(0);
    const crossings: GateCrossing[] = [];
    let t = 0;
    for (let x = -30; x <= 1020; x += 0.5) {
      crossings.length = 0;
      tracker.update({ x, y: 0.5, z: 0 }, crossings);
      t += 0.01;
      for (const c of crossings) counter.handleCrossing(c, t);
    }
    expect(counter.finished).toBe(true);
    expect(counter.lapsCompleted).toBe(1);
    expect(counter.finishTime).toBeGreaterThan(0);
  });
});

describe('Classificação', () => {
  it('progresso contínuo e limitado ao trecho entre portais', () => {
    const counter = new LapCounter(4, true, 3);
    const ctx = { closed: true, raceLength: 1600, gateDistances: [0, 400, 800, 1200] };
    expect(computeRaceProgress(counter, 1590, ctx)).toBeCloseTo(-10);
    counter.handleCrossing({ gate: 0, direction: 1 }, 1);
    expect(computeRaceProgress(counter, 100, ctx)).toBeCloseTo(100);
    // Mesmo que a projeção indique um ponto muito à frente (atalho), o progresso fica limitado.
    expect(computeRaceProgress(counter, 700, ctx)).toBeCloseTo(405);
    counter.handleCrossing({ gate: 1, direction: 1 }, 2);
    expect(computeRaceProgress(counter, 700, ctx)).toBeCloseTo(700);
  });

  it('ordena por chegada, depois por progresso', () => {
    const ranked = rankEntries([
      { id: 'a', finished: false, finishTime: null, dnf: false, progress: 3000, lastCrossingTime: 50 },
      { id: 'b', finished: true, finishTime: 120, dnf: false, progress: 4800, lastCrossingTime: 120 },
      { id: 'c', finished: true, finishTime: 118, dnf: false, progress: 4800, lastCrossingTime: 118 },
      { id: 'd', finished: false, finishTime: null, dnf: false, progress: 3100, lastCrossingTime: 52 },
      { id: 'e', finished: false, finishTime: null, dnf: true, progress: 3500, lastCrossingTime: 40 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });
});
