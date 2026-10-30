/**
 * Sessão de corrida: orquestra corredores, física, regras, recuperação, classificação e fases.
 * Não depende de renderização — pode rodar em Node (testes) ou no navegador.
 *
 * Fases: intro (apresentação) → countdown (3-2-1) → racing → finished (jogador concluiu; a IA segue).
 * Toda a lógica roda em passo fixo, chamada pelo laço do jogo (independente da taxa de quadros).
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createAIDriver } from '../ai/AIFactory';
import { DIFFICULTIES } from '../ai/Difficulty';
import type { RacerSnapshot } from '../ai/AIDriver';
import type { InputState } from '../input/InputManager';
import { CollisionGroups } from '../physics/CollisionLayers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Track, TrackFrame } from '../tracks/Track';
import { createFrame } from '../tracks/Track';
import { clamp, wrappedDelta } from '../utils/math';
import { TypedEmitter } from '../utils/events';
import { hashString } from '../utils/rng';
import { getVehicle } from '../vehicles/VehicleCatalog';
import { resolvePhysics } from '../vehicles/VehicleConfig';
import { PlayerController, type ControllerSettings } from '../vehicles/VehicleController';
import { VehiclePhysics } from '../vehicles/VehiclePhysics';
import type { GateCrossing } from './CheckpointSystem';
import type { DriftEvent } from './DriftScorer';
import type { LapEvent } from './LapCounter';
import { computeRaceProgress, rankEntries, type ProgressContext } from './RaceClassification';
import { Racer } from './Racer';
import { MODES, type RaceConfig, type RacerResult } from './RaceTypes';

export type RacePhase = 'intro' | 'countdown' | 'racing' | 'finished';

export interface RaceEvents {
  phase: { phase: RacePhase };
  countdown: { value: number };
  lap: { racer: Racer; lap: number; lapTime: number; isBest: boolean };
  checkpoint: { racer: Racer; gate: number };
  start: { racer: Racer };
  finish: { racer: Racer; position: number; time: number };
  complete: Record<string, never>;
  wrongWay: { racer: Racer; active: boolean };
  missedCheckpoint: { racer: Racer; active: boolean };
  recovered: { racer: Racer; automatic: boolean };
  impact: { racer: Racer; intensity: number; point: { x: number; y: number; z: number } | null; otherKind: string };
  drift: { racer: Racer; event: DriftEvent };
  positionChange: { racer: Racer; from: number; to: number };
  timeUp: Record<string, never>;
  shift: { racer: Racer; direction: 1 | -1 };
}

export interface ConeProp {
  body: RAPIER.RigidBody;
  initialPosition: Vector3;
}

export const INTRO_DURATION = 3.2;
export const COUNTDOWN_DURATION = 3;
/** Tempo máximo de espera pelos adversários após a chegada do jogador. */
export const FINISH_WAIT = 45;

export interface SessionOptions {
  physics: PhysicsWorld;
  track: Track;
  config: RaceConfig;
  /** Configurações vivas do controlador do jogador. */
  controllerSettings?: () => ControllerSettings;
  /** Estado de entrada do jogador (nulo em testes sem jogador humano). */
  input?: () => InputState | null;
  /** Se verdadeiro, o carro do jogador é pilotado pela IA (testes/demonstração). */
  playerAutopilot?: boolean;
  skipIntro?: boolean;
}

const tmpQuat = new Quaternion();
const tmpMatrix = new Matrix4();
const tmpLeft = new Vector3();
const tmpPos = new Vector3();

export class RaceSession {
  readonly config: RaceConfig;
  readonly track: Track;
  readonly physics: PhysicsWorld;
  readonly racers: Racer[] = [];
  readonly player: Racer;
  readonly events = new TypedEmitter<RaceEvents>();
  readonly cones: ConeProp[] = [];
  readonly progressContext: ProgressContext;
  readonly sessionId: string;

  phase: RacePhase = 'intro';
  phaseTime = 0;
  raceTime = 0;
  /** Relógio total da sessão (inclui apresentação e contagem). */
  clock = 0;
  countdownValue = 3;
  /** Todos concluíram (ou tempo de espera esgotado). */
  complete = false;
  /** Momento (raceTime) em que o jogador concluiu. */
  playerFinishTime: number | null = null;
  readonly sessionStart = Date.now();

  private readonly options: SessionOptions;
  private readonly crossings: GateCrossing[] = [];
  private readonly snapshots: RacerSnapshot[] = [];
  private readonly frame: TrackFrame = createFrame();
  private readonly driftEvents: DriftEvent[] = [];
  private readonly impactCooldown = new Map<string, number>();
  private safeTimer = 0;
  private readonly safeHistory = new Map<string, Array<{ s: number; lateral: number }>>();

  constructor(options: SessionOptions) {
    this.options = options;
    this.config = options.config;
    this.track = options.track;
    this.physics = options.physics;
    this.sessionId = `${options.config.trackId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    const mode = MODES[this.config.mode];
    const track = this.track;
    const laps = !track.closed ? 1 : mode.hasFinish ? this.config.laps : 9999;

    this.progressContext = {
      closed: track.closed,
      raceLength: track.raceLength,
      gateDistances: track.gates.map((g) => g.raceDistance),
    };

    const entries = [...(mode.hasOpponents ? this.config.opponents.slice(0, track.grid.length - 1) : [])];
    const total = entries.length + 1;
    // Jogador larga na última posição do grid (corridas) ou na primeira (sozinho).
    const playerSlot = total - 1;
    const all = [...entries.map((e, i) => ({ entry: e, slot: i, isPlayer: false })), { entry: this.config.player, slot: playerSlot, isPlayer: true }];

    for (const { entry, slot, isPlayer } of all) {
      const def = getVehicle(entry.vehicleId);
      const { position, quaternion } = this.gridTransform(slot, def.id);
      const vehicle = new VehiclePhysics(this.physics, def, position, quaternion, entry.id);
      const racer = new Racer({
        id: entry.id,
        name: entry.name,
        isPlayer,
        rival: !!entry.rival,
        definition: def,
        paint: entry.paint,
        vehicle,
        gates: track.gates,
        closed: track.closed,
        laps,
        timing: mode.timing,
        gridSlot: slot,
      });
      if (isPlayer) {
        racer.controller = new PlayerController();
        vehicle.assistLevel = this.config.assist;
        if (options.playerAutopilot) {
          racer.ai = createAIDriver(track, vehicle, DIFFICULTIES.hard, `${this.sessionId}-player`);
          racer.autopilot = true;
        }
      } else {
        racer.ai = createAIDriver(track, vehicle, DIFFICULTIES[this.config.difficulty], `${this.config.seed}-${entry.id}`);
      }
      racer.gates.reset(vehicle.position);
      this.racers.push(racer);
    }
    this.player = this.racers.find((r) => r.isPlayer)!;
    this.createCones();
    for (const racer of this.racers) this.updateProjection(racer);
    this.classify();
    if (options.skipIntro) this.enterCountdown();
  }

  /** Posição/orientação de uma vaga do grid. */
  private gridTransform(slot: number, vehicleId: string): { position: Vector3; quaternion: Quaternion } {
    const track = this.track;
    const grid = track.grid[Math.min(slot, track.grid.length - 1)];
    const phys = resolvePhysics(getVehicle(vehicleId).physics);
    const frame = track.sampleAt(grid.s, this.frame);
    const position = frame.position.clone().addScaledVector(frame.right, grid.lateral).addScaledVector(frame.up, phys.rideHeight + 0.06);
    const quaternion = this.orientationFromFrame(frame, new Quaternion());
    return { position, quaternion };
  }

  private orientationFromFrame(frame: TrackFrame, out: Quaternion): Quaternion {
    tmpLeft.copy(frame.right).multiplyScalar(-1);
    tmpMatrix.makeBasis(tmpLeft, frame.up, frame.tangent);
    return out.setFromRotationMatrix(tmpMatrix);
  }

  private createCones(): void {
    const R = this.physics.R;
    const track = this.track;
    for (const placement of track.definition.cones) {
      const s = track.sFromRaceDistance(placement.at * track.raceLength);
      const frame = track.sampleAt(s, this.frame);
      const position = frame.position.clone().addScaledVector(frame.right, placement.lateral).addScaledVector(frame.up, 0.36);
      const body = this.physics.world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setCanSleep(true).setLinearDamping(0.2).setAngularDamping(0.4),
      );
      const collider = this.physics.world.createCollider(
        R.ColliderDesc.cone(0.35, 0.21).setMass(3).setFriction(0.6).setRestitution(0.2).setCollisionGroups(CollisionGroups.prop).setSolverGroups(CollisionGroups.prop),
        body,
      );
      this.physics.register(collider, { kind: 'prop' });
      body.sleep();
      this.cones.push({ body, initialPosition: position });
    }
  }

  // ---------------------------------------------------------------------------
  // Fases
  // ---------------------------------------------------------------------------

  skipIntro(): void {
    if (this.phase === 'intro') this.enterCountdown();
  }

  private setPhase(phase: RacePhase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.events.emit('phase', { phase });
  }

  private enterCountdown(): void {
    this.setPhase('countdown');
    this.countdownValue = 3;
    this.events.emit('countdown', { value: 3 });
  }

  private enterRacing(): void {
    this.setPhase('racing');
    this.raceTime = 0;
    this.countdownValue = 0;
    this.events.emit('countdown', { value: 0 });
    for (const racer of this.racers) racer.lap.start(0);
  }

  /** Reinicia a corrida do zero (grid, voltas, tempos, cones). */
  restart(): void {
    for (const racer of this.racers) {
      racer.resetState();
      if (racer.isPlayer && this.options.playerAutopilot) racer.autopilot = true;
      const { position, quaternion } = this.gridTransform(racer.gridSlot, racer.definition.id);
      racer.vehicle.teleport(position, quaternion);
      racer.gates.reset(racer.vehicle.position);
      this.updateProjection(racer);
    }
    for (const cone of this.cones) {
      cone.body.setTranslation(cone.initialPosition, true);
      cone.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      cone.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cone.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      cone.body.sleep();
    }
    this.complete = false;
    this.playerFinishTime = null;
    this.raceTime = 0;
    this.safeHistory.clear();
    this.impactCooldown.clear();
    this.classify();
    this.enterCountdown();
  }

  // ---------------------------------------------------------------------------
  // Passo fixo
  // ---------------------------------------------------------------------------

  step(dt: number): void {
    this.clock += dt;
    this.phaseTime += dt;
    if (this.phase === 'intro' && this.phaseTime >= INTRO_DURATION) this.enterCountdown();
    if (this.phase === 'countdown') {
      const value = Math.max(1, 3 - Math.floor(this.phaseTime));
      if (value !== this.countdownValue && this.phaseTime < COUNTDOWN_DURATION) {
        this.countdownValue = value;
        this.events.emit('countdown', { value });
      }
      if (this.phaseTime >= COUNTDOWN_DURATION) this.enterRacing();
    }
    const racing = this.phase === 'racing' || this.phase === 'finished';
    if (racing) this.raceTime += dt;

    // --- Comandos ---
    this.buildSnapshots();
    const input = this.options.input?.() ?? null;
    const settings = this.options.controllerSettings?.() ?? { steeringSensitivity: 1, assist: this.config.assist };
    for (const racer of this.racers) {
      const vehicle = racer.vehicle;
      vehicle.inputLocked = !racing;
      const useAI = racer.ai && (!racer.isPlayer || racer.autopilot);
      if (useAI && racer.ai) {
        if (racing) {
          const snap = this.snapshots[this.racers.indexOf(racer)];
          Object.assign(vehicle.controls, racer.ai.update(dt, snap, this.snapshots));
        } else {
          vehicle.controls.throttle = 0;
          vehicle.controls.brake = 0;
          vehicle.controls.steer = 0;
          vehicle.controls.handbrake = 0;
        }
      } else if (racer.controller) {
        if (input) {
          Object.assign(vehicle.controls, racer.controller.update(dt, input, vehicle, settings));
        } else {
          vehicle.controls.throttle = 0;
          vehicle.controls.brake = 0;
          vehicle.controls.steer = 0;
          vehicle.controls.handbrake = 0;
        }
        vehicle.assistLevel = settings.assist;
      }
      vehicle.snapshot();
      vehicle.step(dt);
      if (vehicle.drivetrain.lastShift !== 0) this.events.emit('shift', { racer, direction: vehicle.drivetrain.lastShift as 1 | -1 });
    }

    this.physics.step();

    for (const racer of this.racers) racer.vehicle.postStep(dt);
    this.processImpacts();

    this.safeTimer += dt;
    const recordSafe = this.safeTimer >= 0.5;
    if (recordSafe) this.safeTimer = 0;

    for (const racer of this.racers) {
      this.updateProjection(racer);
      this.updateRules(racer, dt, racing, recordSafe);
    }
    this.classify();
    this.updateCompletion();
  }

  private buildSnapshots(): void {
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      let snap = this.snapshots[i];
      if (!snap) {
        snap = { id: r.id, s: 0, progress: 0, lateral: 0, speed: 0, ghost: false };
        this.snapshots[i] = snap;
      }
      snap.s = r.projection.s;
      snap.progress = r.progress;
      snap.lateral = r.projection.lateral;
      snap.speed = r.vehicle.speed;
      snap.ghost = r.vehicle.ghost;
    }
  }

  private updateProjection(racer: Racer): void {
    this.track.project(racer.vehicle.position, racer.hint, racer.projection);
    racer.hint = racer.projection.index;
  }

  private updateRules(racer: Racer, dt: number, racing: boolean, recordSafe: boolean): void {
    const track = this.track;
    const vehicle = racer.vehicle;
    const proj = racer.projection;

    // --- Portais ---
    this.crossings.length = 0;
    racer.gates.update(vehicle.position, this.crossings);
    if (racing) {
      for (const crossing of this.crossings) this.handleLapEvent(racer, racer.lap.handleCrossing(crossing, this.raceTime));
    }

    if (!racing) return;

    // --- Estatísticas ---
    racer.distance += vehicle.speed * dt;
    racer.topSpeed = Math.max(racer.topSpeed, vehicle.speed);
    racer.recoverCooldown = Math.max(0, racer.recoverCooldown - dt);

    // --- Proteção temporária após recuperação ---
    if (racer.ghostTimer > 0) {
      racer.ghostTimer -= dt;
      if (racer.ghostTimer <= 0) {
        if (this.isOverlappingOthers(racer, 4.8)) racer.ghostTimer = 0.3;
        else vehicle.setGhost(false);
      }
    }

    // --- Direção da pista ---
    track.sampleAt(proj.s, this.frame);
    const trackSpeed = vehicle.velocity.dot(this.frame.tangent);

    // --- Contramão ---
    if (trackSpeed < -3 && !racer.finished) racer.wrongWayTimer += dt;
    else racer.wrongWayTimer = Math.max(0, racer.wrongWayTimer - dt * 2);
    const wrong = racer.wrongWayTimer > 1.1;
    if (wrong !== racer.wrongWay) {
      racer.wrongWay = wrong;
      this.events.emit('wrongWay', { racer, active: wrong });
    }

    // --- Checkpoint perdido (atalho) ---
    const missed = this.computeMissedCheckpoint(racer);
    if (missed !== racer.missedCheckpoint) {
      racer.missedCheckpoint = missed;
      this.events.emit('missedCheckpoint', { racer, active: missed });
    }

    // --- Ponto seguro ---
    if (
      recordSafe &&
      vehicle.groundedWheels >= 3 &&
      vehicle.up.y > 0.85 &&
      Math.abs(proj.lateral) < track.halfWidth - 0.6 &&
      trackSpeed > 2 &&
      !racer.missedCheckpoint &&
      !racer.wrongWay
    ) {
      let history = this.safeHistory.get(racer.id);
      if (!history) {
        history = [];
        this.safeHistory.set(racer.id, history);
      }
      history.push({ s: proj.s, lateral: proj.lateral });
      if (history.length > 4) history.shift();
      // Usa um ponto ~1 s antes do atual (evita reposicionar exatamente onde o carro bateu).
      const chosen = history[Math.max(0, history.length - 3)];
      racer.safeS = chosen.s;
      racer.safeLateral = chosen.lateral;
      racer.hasSafePoint = true;
    }

    // --- Recuperação automática ---
    if (!proj.insideBarriers || vehicle.position.y < this.frame.position.y - 6) racer.outOfBoundsTimer += dt;
    else racer.outOfBoundsTimer = 0;
    const upsideLimit = racer.isPlayer && !racer.autopilot ? 3 : 1.5;
    let auto = vehicle.invalidState || racer.outOfBoundsTimer > 1.5 || vehicle.upsideDownTime > upsideLimit;
    if (!racer.isPlayer || racer.autopilot) {
      if (vehicle.speed < 1 && !racer.finished) racer.stuckTimer += dt;
      else racer.stuckTimer = 0;
      auto = auto || racer.stuckTimer > 6 || racer.wrongWayTimer > 3.5 || (racer.missedCheckpoint && racer.outOfBoundsTimer === 0 && this.phaseTime > 1);
    }
    if (auto) this.recover(racer, true);

    // --- Drift (jogador) ---
    if (racer.isPlayer) {
      this.driftEvents.length = 0;
      racer.drift.update(
        dt,
        {
          speed: Math.hypot(vehicle.forwardSpeed, vehicle.lateralSpeed),
          angle: vehicle.driftAngle,
          trackSpeed,
          groundedWheels: vehicle.groundedWheels,
          onTrack: vehicle.trackWheels >= 2,
        },
        this.driftEvents,
      );
      if (vehicle.trackWheels === 0 && vehicle.groundedWheels >= 3) racer.drift.penalize('Fora da pista', this.driftEvents);
      for (const event of this.driftEvents) this.events.emit('drift', { racer, event });
    }
  }

  private computeMissedCheckpoint(racer: Racer): boolean {
    const lap = racer.lap;
    if (lap.progress === 0 || lap.finished) return false;
    const track = this.track;
    const L = track.raceLength;
    const last = track.gates[lap.lastGate];
    const next = track.gates[lap.nextGate];
    const d = track.raceDistance(racer.projection.s);
    const segment = (next.index === 0 && track.closed ? L : next.raceDistance) - last.raceDistance;
    const offset = track.closed ? wrappedDelta(last.raceDistance, d, L) : d - last.raceDistance;
    return offset > segment + 25 && offset < segment + L * 0.45;
  }

  private handleLapEvent(racer: Racer, event: LapEvent): void {
    switch (event.type) {
      case 'start':
        this.events.emit('start', { racer });
        break;
      case 'checkpoint':
        this.events.emit('checkpoint', { racer, gate: event.gate });
        break;
      case 'lap':
        this.events.emit('lap', { racer, lap: event.lap ?? 0, lapTime: event.lapTime ?? 0, isBest: !!event.isBestLap });
        break;
      case 'finish': {
        if (event.lap && event.lapTime !== undefined) {
          this.events.emit('lap', { racer, lap: event.lap, lapTime: event.lapTime, isBest: !!event.isBestLap });
        }
        this.classify();
        this.events.emit('finish', { racer, position: racer.position, time: this.raceTime });
        if (racer.isPlayer) this.onPlayerFinished();
        break;
      }
      default:
        break;
    }
  }

  private onPlayerFinished(): void {
    this.playerFinishTime = this.raceTime;
    this.player.drift.finalize();
    if (this.phase !== 'finished') this.setPhase('finished');
    // Volta de desaceleração controlada pela IA.
    if (!this.player.ai) {
      this.player.ai = createAIDriver(this.track, this.player.vehicle, DIFFICULTIES.easy, `${this.sessionId}-cooldown`);
    }
    this.player.ai.paceFactor = 0.6;
    this.player.autopilot = true;
  }

  private updateCompletion(): void {
    if (this.complete) return;
    const mode = MODES[this.config.mode];
    if (!mode.hasFinish) return;
    // Limite de tempo (desafio de drift).
    if (this.config.timeLimit && this.phase === 'racing' && this.raceTime >= this.config.timeLimit && !this.player.finished) {
      this.player.lap.finished = true;
      this.player.lap.finishTime = this.raceTime;
      this.events.emit('timeUp', {});
      this.classify();
      this.events.emit('finish', { racer: this.player, position: this.player.position, time: this.raceTime });
      this.onPlayerFinished();
    }
    if (this.playerFinishTime === null) return;
    const allDone = this.racers.every((r) => r.finished || r.dnf);
    const waited = this.raceTime - this.playerFinishTime;
    if (allDone || waited > FINISH_WAIT) {
      for (const r of this.racers) if (!r.finished) r.dnf = true;
      this.complete = true;
      this.classify();
      this.events.emit('complete', {});
    }
  }

  private classify(): void {
    for (const racer of this.racers) {
      racer.progress = computeRaceProgress(racer.lap, this.track.raceDistance(racer.projection.s), this.progressContext);
    }
    const ranked = rankEntries(
      this.racers.map((r) => ({
        id: r.id,
        finished: r.finished,
        finishTime: r.finishTime,
        dnf: r.dnf,
        progress: r.progress,
        lastCrossingTime: r.lap.lastCrossingTime,
        racer: r,
      })),
    );
    ranked.forEach((entry, index) => {
      const racer = entry.racer;
      const position = index + 1;
      if (racer.position !== position) {
        const from = racer.position;
        racer.position = position;
        if (racer.isPlayer && this.phase !== 'intro' && this.phase !== 'countdown') this.events.emit('positionChange', { racer, from, to: position });
      }
    });
  }

  private processImpacts(): void {
    for (const impact of this.physics.impacts.events) {
      if (!impact.carId) continue;
      const racer = this.racers.find((r) => r.id === impact.carId);
      if (!racer) continue;
      if (impact.intensity < 0.8) continue;
      const now = this.clock;
      const last = this.impactCooldown.get(racer.id) ?? -10;
      racer.impactIntensity = Math.max(racer.impactIntensity * 0.5, impact.intensity);
      if (now - last < 0.18) continue;
      this.impactCooldown.set(racer.id, now);
      racer.lastImpactTime = now;
      if (impact.intensity > 3) racer.collisions++;
      if (racer.isPlayer && impact.intensity > 2.5 && impact.otherKind !== 'prop') {
        this.driftEvents.length = 0;
        racer.drift.penalize('Batida', this.driftEvents);
        for (const event of this.driftEvents) this.events.emit('drift', { racer, event });
      }
      this.events.emit('impact', { racer, intensity: impact.intensity, point: impact.point, otherKind: impact.otherKind });
    }
    for (const racer of this.racers) racer.impactIntensity *= 0.9;
  }

  private isOverlappingOthers(racer: Racer, radius: number): boolean {
    for (const other of this.racers) {
      if (other === racer) continue;
      if (other.vehicle.position.distanceToSquared(racer.vehicle.position) < radius * radius) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Recuperação
  // ---------------------------------------------------------------------------

  /** Solicitação manual do jogador (tecla R). */
  requestPlayerRecovery(): boolean {
    if (this.phase !== 'racing' && this.phase !== 'finished') return false;
    return this.recover(this.player, false);
  }

  /**
   * Recoloca o carro no último ponto seguro, voltado para o sentido da corrida, sem alterar voltas
   * ou progresso. O ponto é limitado ao trecho entre o último portal válido e o próximo esperado.
   */
  recover(racer: Racer, automatic: boolean): boolean {
    if (!automatic && racer.recoverCooldown > 0) return false;
    const track = this.track;
    const L = track.raceLength;
    let s: number;
    let lateral: number;
    if (racer.hasSafePoint) {
      s = racer.safeS;
      lateral = racer.safeLateral;
    } else {
      const slot = track.grid[Math.min(racer.gridSlot, track.grid.length - 1)];
      s = slot.s;
      lateral = slot.lateral;
    }

    const lap = racer.lap;
    let minDistance: number;
    let maxDistance: number;
    if (lap.progress === 0) {
      // Ainda antes da largada: fica atrás da linha.
      minDistance = -track.grid.length * 10 - 20;
      maxDistance = -4;
    } else {
      const last = track.gates[lap.lastGate];
      const next = track.gates[lap.nextGate];
      minDistance = last.raceDistance + 4;
      maxDistance = (next.index === 0 && track.closed ? L : next.raceDistance) - 6;
      if (lap.finished) maxDistance = minDistance + 200;
    }
    let d = track.raceDistance(s);
    if (track.closed) {
      // Representa d relativo ao intervalo permitido (lidando com a volta do circuito).
      const offset = wrappedDelta(minDistance, d, L);
      d = minDistance + clamp(offset, 0, Math.max(0, maxDistance - minDistance));
    } else {
      d = clamp(d, minDistance, maxDistance);
    }

    lateral = clamp(lateral, -(track.halfWidth - 2), track.halfWidth - 2);
    // Evita reposicionar em cima de outro carro.
    const candidates: Array<[number, number]> = [
      [0, lateral],
      [0, -lateral],
      [0, 0],
      [-9, lateral],
      [-9, -lateral],
      [-18, 0],
    ];
    let chosenD = d;
    let chosenLateral = lateral;
    for (const [back, lat] of candidates) {
      const cd = Math.max(minDistance, d + back);
      track.pointAt(track.sFromRaceDistance(cd), lat, tmpPos, this.frame);
      let free = true;
      for (const other of this.racers) {
        if (other === racer) continue;
        if (other.vehicle.position.distanceToSquared(tmpPos) < 6 * 6) {
          free = false;
          break;
        }
      }
      if (free) {
        chosenD = cd;
        chosenLateral = lat;
        break;
      }
    }

    const finalS = track.sFromRaceDistance(chosenD);
    const frame = track.sampleAt(finalS, this.frame);
    const phys = racer.vehicle.phys;
    tmpPos.copy(frame.position).addScaledVector(frame.right, chosenLateral).addScaledVector(frame.up, phys.rideHeight + 0.2);
    this.orientationFromFrame(frame, tmpQuat);
    racer.vehicle.teleport(tmpPos, tmpQuat);
    racer.gates.reset(racer.vehicle.position);
    racer.hint = -1;
    this.updateProjection(racer);
    racer.ghostTimer = 2.5;
    racer.vehicle.setGhost(true);
    racer.recoverCooldown = 2;
    racer.recoveries++;
    racer.stuckTimer = 0;
    racer.outOfBoundsTimer = 0;
    racer.wrongWayTimer = 0;
    racer.ai?.reset();
    racer.controller?.reset();
    this.driftEvents.length = 0;
    racer.drift.penalize('Recuperação', this.driftEvents);
    if (racer.wrongWay) {
      racer.wrongWay = false;
      this.events.emit('wrongWay', { racer, active: false });
    }
    if (racer.missedCheckpoint) {
      racer.missedCheckpoint = false;
      this.events.emit('missedCheckpoint', { racer, active: false });
    }
    this.events.emit('recovered', { racer, automatic });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------------

  buildRacerResults(): RacerResult[] {
    const sorted = [...this.racers].sort((a, b) => a.position - b.position);
    const leader = sorted[0];
    const leaderTime = leader?.finishTime ?? null;
    return sorted.map((r) => ({
      id: r.id,
      name: r.name,
      vehicleId: r.definition.id,
      isPlayer: r.isPlayer,
      position: r.position,
      finished: r.finished,
      dnf: r.dnf && !r.finished,
      totalTime: r.finishTime,
      bestLap: r.lap.bestLap,
      lapTimes: [...r.lap.lapTimes],
      gapToLeader: r.finishTime !== null && leaderTime !== null && r !== leader ? r.finishTime - leaderTime : null,
      progress: r.progress,
      driftScore: r.drift.total,
      rival: r.rival,
    }));
  }

  dispose(): void {
    this.events.clear();
    for (const racer of this.racers) racer.vehicle.dispose();
    for (const cone of this.cones) {
      if (!this.physics.isDisposed) this.physics.world.removeRigidBody(cone.body);
    }
  }
}

/** Semente estável para uma configuração. */
export function seedFor(text: string): number {
  return hashString(text);
}
