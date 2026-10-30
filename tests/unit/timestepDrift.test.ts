import { describe, expect, it } from 'vitest';
import { FixedTimestep } from '../../src/game/FixedTimestep';
import { DriftScorer } from '../../src/racing/DriftScorer';

describe('FixedTimestep', () => {
  it('executa o mesmo número de passos para o mesmo tempo, em qualquer FPS', () => {
    for (const fps of [30, 60, 120, 144, 240]) {
      const stepper = new FixedTimestep(1 / 120);
      let steps = 0;
      for (let i = 0; i < fps * 10; i++) steps += stepper.advance(1 / fps);
      expect(Math.abs(steps - 1200)).toBeLessThanOrEqual(1);
    }
  });

  it('limita quadros longos (sem espiral da morte)', () => {
    const stepper = new FixedTimestep(1 / 120, 8, 0.25);
    expect(stepper.advance(5)).toBe(8);
    expect(stepper.accumulator).toBe(0);
    expect(stepper.droppedFrames).toBe(1);
  });
});

describe('DriftScorer', () => {
  const valid = { speed: 20, angle: 0.5, trackSpeed: 15, groundedWheels: 4, onTrack: true };

  it('pontua drift válido e garante os pontos ao terminar limpo', () => {
    const d = new DriftScorer();
    for (let i = 0; i < 240; i++) d.update(1 / 120, valid);
    expect(d.active).toBe(true);
    expect(d.chainValue).toBeGreaterThan(0);
    const before = d.chainValue;
    for (let i = 0; i < 200; i++) d.update(1 / 120, { ...valid, angle: 0 });
    expect(d.active).toBe(false);
    expect(d.total).toBe(before);
  });

  it('não pontua girando parado, em baixa velocidade ou na contramão', () => {
    const d = new DriftScorer();
    for (let i = 0; i < 600; i++) d.update(1 / 120, { ...valid, speed: 3, trackSpeed: 1 });
    for (let i = 0; i < 600; i++) d.update(1 / 120, { ...valid, trackSpeed: -10 });
    d.finalize();
    expect(d.total).toBe(0);
  });

  it('batida perde a sequência atual', () => {
    const d = new DriftScorer();
    for (let i = 0; i < 240; i++) d.update(1 / 120, valid);
    d.penalize('Batida');
    d.finalize();
    expect(d.total).toBe(0);
  });

  it('rodar (ângulo excessivo) encerra sem pontos', () => {
    const d = new DriftScorer();
    for (let i = 0; i < 120; i++) d.update(1 / 120, valid);
    d.update(1 / 120, { ...valid, angle: 2.4 });
    expect(d.active).toBe(false);
    expect(d.total).toBe(0);
  });
});
