/**
 * Contador de voltas determinístico baseado na sequência de portais.
 *
 * `progress` = número de portais cruzados NA ORDEM correta (descontando recuos).
 * - Cruzar para frente o portal esperado avança o progresso.
 * - Cruzar para trás o último portal válido desfaz o avanço (inclusive uma volta concluída).
 * - Qualquer outro cruzamento (atalho, portal pulado, sentido inverso) é ignorado.
 * Portanto, é impossível validar uma volta ignorando checkpoints ou contar duas vezes o mesmo cruzamento.
 *
 * Circuito: portal 0 = largada/chegada. O primeiro cruzamento do portal 0 inicia a volta 1;
 * cada cruzamento seguinte (após todos os checkpoints) conclui uma volta.
 * Sprint: portal 0 = largada, último portal = chegada.
 */
import type { GateCrossing } from './CheckpointSystem';

export type LapTimingMode = 'green' | 'firstCrossing';

export type LapEventType = 'start' | 'checkpoint' | 'lap' | 'finish' | 'reverse' | 'ignored';

export interface LapEvent {
  type: LapEventType;
  gate: number;
  /** Volta concluída (para eventos 'lap'/'finish'). */
  lap?: number;
  lapTime?: number;
  isBestLap?: boolean;
}

export class LapCounter {
  readonly gateCount: number;
  readonly closed: boolean;
  readonly totalLaps: number;
  readonly timing: LapTimingMode;

  progress = 0;
  lapTimes: number[] = [];
  bestLap: number | null = null;
  finished = false;
  finishTime: number | null = null;
  /** Momento do último cruzamento válido de checkpoint (para desempates e diferenças). */
  lastCrossingTime = 0;

  private lapStartTime: number | null = null;
  private readonly lapStartStack: Array<number | null> = [];
  private readonly checkpointTimes: number[] = [];

  constructor(gateCount: number, closed: boolean, totalLaps: number, timing: LapTimingMode = 'green') {
    if (gateCount < 2) throw new Error('São necessários pelo menos 2 portais.');
    this.gateCount = gateCount;
    this.closed = closed;
    this.totalLaps = closed ? Math.max(1, Math.floor(totalLaps)) : 1;
    this.timing = timing;
  }

  /** Início oficial da corrida (luz verde). */
  start(time: number): void {
    this.lapStartTime = this.timing === 'green' ? time : null;
  }

  reset(): void {
    this.progress = 0;
    this.lapTimes = [];
    this.bestLap = null;
    this.finished = false;
    this.finishTime = null;
    this.lastCrossingTime = 0;
    this.lapStartTime = null;
    this.lapStartStack.length = 0;
    this.checkpointTimes.length = 0;
  }

  /** Índice do próximo portal esperado. */
  get nextGate(): number {
    if (this.closed) return this.progress % this.gateCount;
    return Math.min(this.progress, this.gateCount - 1);
  }

  /** Índice do último portal válido cruzado (-1 se nenhum). */
  get lastGate(): number {
    if (this.progress === 0) return -1;
    if (this.closed) return (this.progress - 1) % this.gateCount;
    return this.progress - 1;
  }

  get started(): boolean {
    return this.progress > 0;
  }

  get lapsCompleted(): number {
    if (!this.closed) return this.finished ? 1 : 0;
    if (this.progress <= 1) return 0;
    return Math.floor((this.progress - 1) / this.gateCount);
  }

  /** Volta atual para exibição (1..total). */
  get currentLap(): number {
    return Math.min(this.totalLaps, this.lapsCompleted + 1);
  }

  /** Tempo decorrido na volta atual. */
  currentLapTime(time: number): number | null {
    if (this.lapStartTime === null) return null;
    return Math.max(0, time - this.lapStartTime);
  }

  get lapStart(): number | null {
    return this.lapStartTime;
  }

  /** Processa um cruzamento detectado pelo GateTracker. */
  handleCrossing(crossing: GateCrossing, time: number): LapEvent {
    if (this.finished) return { type: 'ignored', gate: crossing.gate };
    const expected = this.nextGate;
    const last = this.lastGate;

    if (crossing.direction === 1 && crossing.gate === expected) {
      return this.advance(crossing.gate, time);
    }
    if (crossing.direction === -1 && last >= 0 && crossing.gate === last) {
      return this.retreat(crossing.gate);
    }
    return { type: 'ignored', gate: crossing.gate };
  }

  private advance(gate: number, time: number): LapEvent {
    this.progress++;
    this.checkpointTimes.push(time);
    this.lastCrossingTime = time;

    if (this.closed) {
      if (gate !== 0) return { type: 'checkpoint', gate };
      if (this.progress === 1) {
        this.lapStartStack.push(this.lapStartTime);
        if (this.timing === 'firstCrossing' || this.lapStartTime === null) this.lapStartTime = time;
        return { type: 'start', gate };
      }
      // Volta concluída.
      const lap = this.lapsCompleted;
      const lapTime = this.lapStartTime === null ? 0 : time - this.lapStartTime;
      this.lapTimes.push(lapTime);
      const isBestLap = this.bestLap === null || lapTime < this.bestLap;
      if (isBestLap) this.bestLap = lapTime;
      this.lapStartStack.push(this.lapStartTime);
      this.lapStartTime = time;
      if (lap >= this.totalLaps) {
        this.finished = true;
        this.finishTime = time;
        return { type: 'finish', gate, lap, lapTime, isBestLap };
      }
      return { type: 'lap', gate, lap, lapTime, isBestLap };
    }

    // Sprint.
    if (gate === 0) {
      this.lapStartStack.push(this.lapStartTime);
      if (this.timing === 'firstCrossing' || this.lapStartTime === null) this.lapStartTime = time;
      return { type: 'start', gate };
    }
    if (gate === this.gateCount - 1) {
      const lapTime = this.lapStartTime === null ? 0 : time - this.lapStartTime;
      this.lapTimes.push(lapTime);
      this.bestLap = lapTime;
      this.finished = true;
      this.finishTime = time;
      return { type: 'finish', gate, lap: 1, lapTime, isBestLap: true };
    }
    return { type: 'checkpoint', gate };
  }

  private retreat(gate: number): LapEvent {
    const wasLapCompletion = this.closed && gate === 0 && this.progress > 1;
    const wasStart = gate === 0 && this.progress === 1;
    this.progress--;
    this.checkpointTimes.pop();
    this.lastCrossingTime = this.checkpointTimes[this.checkpointTimes.length - 1] ?? 0;
    if (wasLapCompletion) {
      // Desfaz a volta: recupera o tempo de início anterior e remove o registro.
      this.lapTimes.pop();
      this.lapStartTime = this.lapStartStack.pop() ?? null;
      this.bestLap = this.lapTimes.length > 0 ? Math.min(...this.lapTimes) : null;
    } else if (wasStart) {
      this.lapStartTime = this.lapStartStack.pop() ?? null;
    }
    return { type: 'reverse', gate };
  }
}
