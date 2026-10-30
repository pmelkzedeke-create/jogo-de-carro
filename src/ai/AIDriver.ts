/**
 * Piloto controlado por IA.
 * Usa as MESMAS entradas que o jogador (acelerador, freio, direção, freio de mão) — a física é idêntica.
 * - Segue a linha de corrida com deslocamento pessoal limitado à largura da pista.
 * - Velocidade-alvo pelo perfil (curvas e frenagem), escalada pela dificuldade.
 * - Desvio e ultrapassagem: escolhe o lado com espaço; acompanha quando não há espaço.
 * - Erros ocasionais (frenagem tardia, abrir a curva, aliviar), com semente determinística.
 * - Manobra de ré quando preso; a recuperação completa é aplicada pela sessão de corrida.
 */
import { clamp, damp, lerp, smoothstep, wrappedDelta } from '../utils/math';
import { SeededRandom } from '../utils/rng';
import type { Track } from '../tracks/Track';
import type { VehicleControls, VehiclePhysics } from '../vehicles/VehiclePhysics';
import type { AIDifficulty } from './Difficulty';
import type { RacingLine, SpeedProfile } from './RacingLine';
import { Vector3 } from 'three';

export interface RacerSnapshot {
  id: string;
  /** Distância ao longo da spline. */
  s: number;
  /** Progresso total de corrida (m). */
  progress: number;
  lateral: number;
  speed: number;
  ghost: boolean;
}

type MistakeKind = 'lateBrake' | 'wide' | 'lift';

export class AIDriver {
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  /** Deslocamento lateral pessoal (m) — cada IA tem um estilo ligeiramente diferente. */
  readonly lineBias: number;
  private avoidance = 0;
  private noisePhase: number;
  private mistake: { kind: MistakeKind; until: number; side: number } | null = null;
  private nextMistakeIn: number;
  private time = 0;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private readonly rng: SeededRandom;
  private readonly target = new Vector3();
  private readonly toTarget = new Vector3();
  /** Fator adicional de ritmo (ex.: volta de desaceleração após a chegada). */
  paceFactor = 1;

  constructor(
    private readonly vehicle: VehiclePhysics,
    private readonly track: Track,
    private readonly line: RacingLine,
    private readonly profile: SpeedProfile,
    private readonly difficulty: AIDifficulty,
    seed: number,
  ) {
    // A IA usa as mesmas assistências disponíveis ao jogador (ABS/controle de tração/estabilidade).
    vehicle.assistLevel = 0.85;
    this.rng = new SeededRandom(seed);
    this.lineBias = this.rng.range(-0.9, 0.9);
    this.noisePhase = this.rng.range(0, Math.PI * 2);
    this.nextMistakeIn = this.sampleMistakeInterval();
  }

  private sampleMistakeInterval(): number {
    const rate = this.difficulty.mistakesPerMinute / 60;
    if (rate <= 0) return Infinity;
    return -Math.log(1 - this.rng.next()) / rate + 6;
  }

  reset(): void {
    this.avoidance = 0;
    this.mistake = null;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.controls.throttle = 0;
    this.controls.brake = 0;
    this.controls.steer = 0;
    this.controls.handbrake = 0;
  }

  /** Velocidade-alvo planejada em uma distância `s`. */
  targetSpeedAt(s: number): number {
    const d = this.difficulty;
    const base = this.profile.speedAt(s);
    const top = this.vehicle.phys.topSpeed;
    // Em retas (perfil próximo da máxima) usa straightFactor; em curvas, corneringFactor.
    const straightness = smoothstep(top * 0.75, top * 0.98, base);
    const factor = lerp(d.corneringFactor, d.straightFactor, straightness);
    return base * factor * this.paceFactor;
  }

  update(dt: number, self: RacerSnapshot, others: readonly RacerSnapshot[]): VehicleControls {
    this.time += dt;
    const v = this.vehicle;
    const track = this.track;
    const speed = v.forwardSpeed;
    const absSpeed = Math.abs(speed);
    const limit = this.line.limit;

    // --- Erros ocasionais ---
    this.nextMistakeIn -= dt;
    if (!this.mistake && this.nextMistakeIn <= 0 && absSpeed > 15) {
      const kind = this.rng.pick<MistakeKind>(['lateBrake', 'wide', 'lift']);
      this.mistake = { kind, until: this.time + (kind === 'lateBrake' ? 3 : kind === 'wide' ? 2.5 : 1.4), side: this.rng.chance(0.5) ? 1 : -1 };
      this.nextMistakeIn = this.sampleMistakeInterval();
    }
    if (this.mistake && this.time > this.mistake.until) this.mistake = null;

    // --- Desvio / ultrapassagem ---
    const baseOffsetHere = this.line.offsetAt(self.s);
    let desiredAvoid = 0;
    let followSpeed = Infinity;
    for (const other of others) {
      if (other.id === self.id || other.ghost || self.ghost) continue;
      const ds = track.closed ? wrappedDelta(self.s, other.s, track.length) : other.s - self.s;
      const gap = other.lateral - self.lateral;
      if (ds > -5 && ds < 4.5 && Math.abs(gap) < 2.6) {
        // Lado a lado: afasta-se lateralmente.
        desiredAvoid += -Math.sign(gap || 1) * (2.6 - Math.abs(gap)) * 0.9;
      } else if (ds >= 4.5 && ds < 34 && Math.abs(gap) < 2.7) {
        const closing = absSpeed - other.speed;
        if (closing > 0.3 || ds < 10) {
          const roomLeft = other.lateral + limit;
          const roomRight = limit - other.lateral;
          const upcoming = this.line.offsetAt(self.s + 40);
          const preferRight = upcoming > other.lateral;
          let side = 0;
          const need = 2.9;
          if (preferRight && roomRight > need) side = 1;
          else if (!preferRight && roomLeft > need) side = -1;
          else if (roomRight > need) side = 1;
          else if (roomLeft > need) side = -1;
          if (side !== 0 && this.difficulty.aggression > 0.2) {
            const passLateral = clamp(other.lateral + side * 3.1, -limit, limit);
            desiredAvoid += (passLateral - baseOffsetHere) * smoothstep(34, 12, ds);
          } else {
            followSpeed = Math.min(followSpeed, other.speed + (ds - 9) * 0.35);
          }
        }
      }
    }
    desiredAvoid = clamp(desiredAvoid, -limit * 2, limit * 2);
    this.avoidance = damp(this.avoidance, desiredAvoid, 2.6, dt);

    // --- Alvo de direção (perseguição pura) ---
    const look = clamp(7 + absSpeed * 0.5, 9, 40);
    const sTarget = self.s + look;
    let lateral = this.line.offsetAt(sTarget);
    const straight = 1 - smoothstep(0.002, 0.012, Math.abs(this.line.curvatureAt(sTarget)));
    lateral += this.lineBias * straight;
    lateral += Math.sin(this.time * 0.37 + this.noisePhase) * this.difficulty.lineNoise * 0.5;
    lateral += this.avoidance;
    if (this.mistake?.kind === 'wide') lateral += this.mistake.side * 2.2;
    lateral = clamp(lateral, -limit, limit);

    track.pointAt(sTarget, lateral, this.target);
    this.toTarget.subVectors(this.target, v.position);
    const localRight = this.toTarget.dot(v.right);
    const localForward = this.toTarget.dot(v.forward);
    const dist2 = Math.max(localRight * localRight + localForward * localForward, 1);
    const curvature = (2 * localRight) / dist2;
    const steerAngle = Math.atan(curvature * v.phys.wheelBase);
    const reduction = smoothstep(0, v.phys.steerReductionSpeed, absSpeed);
    const maxSteerNow = lerp(v.phys.maxSteer, v.phys.highSpeedSteer, reduction);
    let steer = steerAngle / Math.max(maxSteerNow, 0.01);
    // Contraesterço apenas em deslizamento real (a deriva normal de curva fica abaixo de ~7°).
    const slide = Math.abs(v.driftAngle) - 0.1;
    if (slide > 0) steer += Math.sign(v.driftAngle) * slide * 2.2;
    steer = clamp(steer, -1, 1);

    // --- Velocidade ---
    let target = this.targetSpeedAt(self.s + absSpeed * 0.35);
    // Abrindo além do limite da pista: reduz o ritmo para recuperar a trajetória.
    const overshoot = Math.abs(self.lateral) - (limit + 0.8);
    if (overshoot > 0) target *= Math.max(0.65, 1 - overshoot * 0.08);
    if (this.mistake?.kind === 'lateBrake') target *= 1.12;
    if (this.mistake?.kind === 'lift') target *= 0.82;
    target = Math.min(target, followSpeed);

    let throttle = 0;
    let brake = 0;
    const error = target - speed;
    if (error > 0) {
      throttle = clamp(0.35 + error * 0.25, 0, 1);
    } else if (error > -1.2) {
      throttle = clamp(0.25 + error * 0.2, 0, 0.25);
    } else {
      brake = clamp(-error * 0.16, 0, 1);
      // Frear forte com muito esterço satura a traseira: limita a frenagem em curva.
      brake = Math.min(brake, 1 - 0.55 * Math.abs(steer));
    }
    // Controle de tração/derrapagem: alivia quando as rodas motrizes patinam ou o carro desliza muito.
    const slip = Math.max(...v.wheels.filter((w) => w.driven).map((w) => w.longitudinalSlip));
    if (slip > 0.25) throttle *= 0.6;
    if (Math.abs(v.driftAngle) > 0.14) throttle *= 0.55;

    // --- Preso: manobra de ré ---
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      this.controls.throttle = 0;
      this.controls.brake = 1;
      this.controls.steer = -steer;
      this.controls.handbrake = 0;
      return this.controls;
    }
    if (absSpeed < 1.2 && throttle > 0.3) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.6) {
        this.stuckTimer = 0;
        this.reverseTimer = 1.3;
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }

    // Suaviza transições para entradas mais naturais.
    this.controls.throttle = damp(this.controls.throttle, throttle, 10, dt);
    this.controls.brake = brake > this.controls.brake ? damp(this.controls.brake, brake, 14, dt) : damp(this.controls.brake, brake, 8, dt);
    this.controls.steer = damp(this.controls.steer, steer, 12, dt);
    this.controls.handbrake = 0;
    return this.controls;
  }
}
