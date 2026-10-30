/**
 * Pontuação de drift.
 * Só pontua drifts VÁLIDOS: velocidade mínima, ângulo dentro da faixa, carro no chão, na pista e
 * avançando no sentido da corrida. Girar parado, rodar ou andar em círculos não gera pontos.
 * Pontos acumulam numa sequência (com multiplicador crescente) e só são "garantidos" quando a
 * sequência termina de forma limpa; uma batida forte ou saída da pista perde a sequência atual.
 */
import { clamp, DEG2RAD, smoothstep } from '../utils/math';

export interface DriftInput {
  /** Velocidade no plano (m/s). */
  speed: number;
  /** Ângulo de deriva do carro (rad, com sinal). */
  angle: number;
  /** Velocidade ao longo do sentido da pista (m/s). Negativa = contramão. */
  trackSpeed: number;
  groundedWheels: number;
  onTrack: boolean;
}

export interface DriftConfig {
  minSpeed: number;
  minAngle: number;
  maxAngle: number;
  spinAngle: number;
  graceTime: number;
  basePoints: number;
  maxMultiplier: number;
  multiplierRate: number;
}

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  minSpeed: 11, // ~40 km/h
  minAngle: 12 * DEG2RAD,
  maxAngle: 80 * DEG2RAD,
  spinAngle: 110 * DEG2RAD,
  graceTime: 1.1,
  basePoints: 90,
  maxMultiplier: 5,
  multiplierRate: 0.45,
};

export type DriftEventType = 'chainStart' | 'chainBanked' | 'chainLost';

export interface DriftEvent {
  type: DriftEventType;
  points: number;
  reason?: string;
}

export class DriftScorer {
  /** Pontos garantidos no evento. */
  total = 0;
  /** Pontos brutos da sequência atual (antes do multiplicador). */
  chainPoints = 0;
  chainTime = 0;
  active = false;
  /** Se está pontuando neste instante. */
  scoring = false;
  bestChain = 0;
  private graceTimer = 0;

  constructor(private readonly config: DriftConfig = DEFAULT_DRIFT_CONFIG) {}

  get multiplier(): number {
    return clamp(1 + this.chainTime * this.config.multiplierRate, 1, this.config.maxMultiplier);
  }

  /** Valor atual da sequência com multiplicador. */
  get chainValue(): number {
    return Math.round(this.chainPoints * this.multiplier);
  }

  reset(): void {
    this.total = 0;
    this.chainPoints = 0;
    this.chainTime = 0;
    this.active = false;
    this.scoring = false;
    this.bestChain = 0;
    this.graceTimer = 0;
  }

  /** Validação do instante atual. */
  isValid(input: DriftInput): boolean {
    const c = this.config;
    const absAngle = Math.abs(input.angle);
    return (
      input.speed >= c.minSpeed &&
      absAngle >= c.minAngle &&
      absAngle <= c.maxAngle &&
      input.groundedWheels >= 3 &&
      input.onTrack &&
      input.trackSpeed > 5
    );
  }

  update(dt: number, input: DriftInput, events: DriftEvent[] = []): DriftEvent[] {
    const c = this.config;
    const absAngle = Math.abs(input.angle);

    if (this.active && (absAngle > c.spinAngle || input.trackSpeed < -1)) {
      this.lose(events, 'Rodou');
      return events;
    }

    const valid = this.isValid(input);
    this.scoring = valid;
    if (valid) {
      if (!this.active) {
        this.active = true;
        this.chainPoints = 0;
        this.chainTime = 0;
        events.push({ type: 'chainStart', points: 0 });
      }
      this.graceTimer = 0;
      this.chainTime += dt;
      const angleFactor = smoothstep(c.minAngle, 38 * DEG2RAD, absAngle);
      const speedFactor = clamp(input.speed / 22, 0.5, 2.5);
      this.chainPoints += c.basePoints * angleFactor * speedFactor * dt;
    } else if (this.active) {
      this.graceTimer += dt;
      if (this.graceTimer >= c.graceTime) this.bank(events);
    }
    return events;
  }

  /** Impacto forte ou saída da pista: perde a sequência atual. */
  penalize(reason: string, events: DriftEvent[] = []): DriftEvent[] {
    if (this.active) this.lose(events, reason);
    return events;
  }

  /** Encerra a sequência atual garantindo os pontos (fim de evento). */
  finalize(events: DriftEvent[] = []): DriftEvent[] {
    if (this.active) this.bank(events);
    return events;
  }

  private bank(events: DriftEvent[]): void {
    const value = this.chainValue;
    this.total += value;
    this.bestChain = Math.max(this.bestChain, value);
    this.active = false;
    this.scoring = false;
    this.chainPoints = 0;
    this.chainTime = 0;
    this.graceTimer = 0;
    if (value > 0) events.push({ type: 'chainBanked', points: value });
  }

  private lose(events: DriftEvent[], reason: string): void {
    const value = this.chainValue;
    this.active = false;
    this.scoring = false;
    this.chainPoints = 0;
    this.chainTime = 0;
    this.graceTimer = 0;
    events.push({ type: 'chainLost', points: value, reason });
  }
}
