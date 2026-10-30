/**
 * Detecção de cruzamento de portais (checkpoints e linha de largada/chegada).
 *
 * Cada portal é um plano orientado com largura e altura limitadas. Para cada corredor mantemos o
 * "lado" atual de cada portal (atrás/à frente) com HISTERESE: um cruzamento só é emitido quando o
 * carro passa de um lado para o outro ultrapassando a margem, dentro dos limites do portal.
 * Assim, pequenas oscilações físicas sobre a linha nunca geram múltiplos eventos.
 *
 * Teleportes (largada, reinício, recuperação) reinicializam o estado sem gerar eventos.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GatePlane {
  index: number;
  position: Vec3Like;
  /** Sentido válido de cruzamento (unitário). */
  normal: Vec3Like;
  /** Direção lateral (unitária). */
  right: Vec3Like;
  /** Direção vertical (unitária). */
  up: Vec3Like;
  halfWidth: number;
  height: number;
}

export type CrossingDirection = 1 | -1;

export interface GateCrossing {
  gate: number;
  direction: CrossingDirection;
}

export interface GateTrackerOptions {
  /** Margem de histerese em metros (padrão 0.25 m). */
  hysteresis?: number;
  /** Profundidade da região de detecção à frente/atrás do plano (padrão 10 m). */
  regionDepth?: number;
  /** Tolerância abaixo do plano da pista (padrão 3 m). */
  below?: number;
}

const BEHIND = -1;
const AHEAD = 1;
const UNKNOWN = 0;

export class GateTracker {
  private readonly sides: Int8Array;
  private readonly hysteresis: number;
  private readonly regionDepth: number;
  private readonly below: number;

  constructor(
    private readonly gates: readonly GatePlane[],
    options: GateTrackerOptions = {},
  ) {
    this.sides = new Int8Array(gates.length);
    this.hysteresis = options.hysteresis ?? 0.25;
    this.regionDepth = options.regionDepth ?? 10;
    this.below = options.below ?? 3;
  }

  /** Reinicializa os lados a partir de uma posição (sem gerar eventos). */
  reset(position: Vec3Like): void {
    for (let i = 0; i < this.gates.length; i++) {
      const local = this.localCoords(this.gates[i], position);
      this.sides[i] = local.inside ? (local.d >= 0 ? AHEAD : BEHIND) : UNKNOWN;
    }
  }

  /** Atualiza com a nova posição e adiciona os cruzamentos detectados em `out`. */
  update(position: Vec3Like, out: GateCrossing[]): void {
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      const local = this.localCoords(gate, position);
      if (!local.inside) {
        this.sides[i] = UNKNOWN;
        continue;
      }
      const side = this.sides[i];
      if (side === UNKNOWN) {
        // Entrou na região do portal: apenas registra o lado.
        this.sides[i] = local.d >= 0 ? AHEAD : BEHIND;
        continue;
      }
      if (side === BEHIND && local.d > this.hysteresis) {
        this.sides[i] = AHEAD;
        out.push({ gate: gate.index, direction: 1 });
      } else if (side === AHEAD && local.d < -this.hysteresis) {
        this.sides[i] = BEHIND;
        out.push({ gate: gate.index, direction: -1 });
      }
    }
  }

  sideOf(gateIndex: number): number {
    return this.sides[gateIndex] ?? UNKNOWN;
  }

  private readonly scratch = { d: 0, inside: false };

  private localCoords(gate: GatePlane, p: Vec3Like): { d: number; inside: boolean } {
    const dx = p.x - gate.position.x;
    const dy = p.y - gate.position.y;
    const dz = p.z - gate.position.z;
    const d = dx * gate.normal.x + dy * gate.normal.y + dz * gate.normal.z;
    const lateral = dx * gate.right.x + dy * gate.right.y + dz * gate.right.z;
    const vertical = dx * gate.up.x + dy * gate.up.y + dz * gate.up.z;
    this.scratch.d = d;
    this.scratch.inside =
      Math.abs(lateral) <= gate.halfWidth && vertical >= -this.below && vertical <= gate.height && Math.abs(d) <= this.regionDepth;
    return this.scratch;
  }
}
