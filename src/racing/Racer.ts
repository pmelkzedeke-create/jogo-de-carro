/**
 * Corredor: veículo físico + piloto (jogador ou IA) + regras (portais, voltas, drift) + estado de corrida.
 */
import type { AIDriver } from '../ai/AIDriver';
import { createProjection, type TrackProjection } from '../tracks/Track';
import type { PlayerController } from '../vehicles/VehicleController';
import type { VehicleDefinition } from '../vehicles/VehicleConfig';
import type { VehiclePhysics } from '../vehicles/VehiclePhysics';
import { GateTracker, type GatePlane } from './CheckpointSystem';
import { DriftScorer } from './DriftScorer';
import { LapCounter, type LapTimingMode } from './LapCounter';

export interface RacerOptions {
  id: string;
  name: string;
  isPlayer: boolean;
  rival: boolean;
  definition: VehicleDefinition;
  paint: string;
  vehicle: VehiclePhysics;
  gates: readonly GatePlane[];
  closed: boolean;
  laps: number;
  timing: LapTimingMode;
  gridSlot: number;
}

export class Racer {
  readonly id: string;
  readonly name: string;
  readonly isPlayer: boolean;
  readonly rival: boolean;
  readonly definition: VehicleDefinition;
  readonly paint: string;
  readonly vehicle: VehiclePhysics;
  readonly lap: LapCounter;
  readonly gates: GateTracker;
  readonly drift = new DriftScorer();
  readonly projection: TrackProjection = createProjection();
  readonly gridSlot: number;

  ai: AIDriver | null = null;
  controller: PlayerController | null = null;
  /** Após a chegada, o jogador passa a ser pilotado pela IA (volta de desaceleração). */
  autopilot = false;

  hint = -1;
  progress = 0;
  position = 1;
  dnf = false;
  /** Último ponto seguro (distância na spline e deslocamento lateral). */
  safeS = 0;
  safeLateral = 0;
  hasSafePoint = false;
  ghostTimer = 0;
  wrongWayTimer = 0;
  wrongWay = false;
  stuckTimer = 0;
  outOfBoundsTimer = 0;
  recoverCooldown = 0;
  /** Distância de corrida além do portal esperado (atalho/checkpoint perdido). */
  missedCheckpoint = false;
  lastImpactTime = -10;
  impactIntensity = 0;

  // Estatísticas
  distance = 0;
  topSpeed = 0;
  collisions = 0;
  recoveries = 0;

  constructor(options: RacerOptions) {
    this.id = options.id;
    this.name = options.name;
    this.isPlayer = options.isPlayer;
    this.rival = options.rival;
    this.definition = options.definition;
    this.paint = options.paint;
    this.vehicle = options.vehicle;
    this.gridSlot = options.gridSlot;
    this.lap = new LapCounter(options.gates.length, options.closed, options.laps, options.timing);
    this.gates = new GateTracker(options.gates);
  }

  get finished(): boolean {
    return this.lap.finished;
  }

  get finishTime(): number | null {
    return this.lap.finishTime;
  }

  resetState(): void {
    this.lap.reset();
    this.drift.reset();
    this.ai?.reset();
    this.controller?.reset();
    this.autopilot = false;
    this.hint = -1;
    this.progress = 0;
    this.position = 1;
    this.dnf = false;
    this.hasSafePoint = false;
    this.ghostTimer = 0;
    this.wrongWayTimer = 0;
    this.wrongWay = false;
    this.stuckTimer = 0;
    this.outOfBoundsTimer = 0;
    this.recoverCooldown = 0;
    this.missedCheckpoint = false;
    this.lastImpactTime = -10;
    this.impactIntensity = 0;
    this.distance = 0;
    this.topSpeed = 0;
    this.collisions = 0;
    this.recoveries = 0;
    this.vehicle.setGhost(false);
  }
}
