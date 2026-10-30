/**
 * Acumulador de passo fixo com limite (evita a "espiral da morte").
 * A simulação sempre avança em passos de `step` segundos, independentemente da taxa de quadros.
 * Quadros longos (aba em segundo plano, travamentos) são limitados por `maxFrameTime` e `maxSubSteps`.
 */
export class FixedTimestep {
  accumulator = 0;
  /** Tempo simulado total (s). */
  simulatedTime = 0;
  /** Quantas vezes o limite de subpassos foi atingido (tempo descartado). */
  droppedFrames = 0;

  constructor(
    readonly step: number,
    readonly maxSubSteps = 8,
    readonly maxFrameTime = 0.25,
  ) {
    if (!(step > 0)) throw new Error('Passo fixo inválido.');
  }

  /**
   * Acumula o tempo do quadro e retorna quantos passos fixos devem ser executados agora.
   * @param frameDt tempo real decorrido desde o quadro anterior (s)
   * @param timeScale multiplicador de velocidade da simulação (1 = tempo real)
   */
  advance(frameDt: number, timeScale = 1): number {
    const dt = Math.min(Math.max(frameDt, 0), this.maxFrameTime) * timeScale;
    this.accumulator += dt;
    let steps = Math.floor(this.accumulator / this.step + 1e-7);
    const limit = this.maxSubSteps * Math.max(1, Math.ceil(timeScale));
    if (steps > limit) {
      steps = limit;
      this.accumulator = 0;
      this.droppedFrames++;
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.step);
    }
    this.simulatedTime += steps * this.step;
    return steps;
  }

  /** Fração do próximo passo já acumulada (para interpolação visual). */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.step);
  }

  reset(): void {
    this.accumulator = 0;
    this.simulatedTime = 0;
    this.droppedFrames = 0;
  }
}
