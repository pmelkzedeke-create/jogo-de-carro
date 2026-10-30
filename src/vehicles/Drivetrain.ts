/**
 * Motor + câmbio automático simulados.
 * Converte acelerador/freio em força nas rodas a partir de curva de torque, relações de marcha,
 * limite de potência, limitador de giro, freio-motor e trocas com corte de torque.
 * Também decide a entrada em ré (segurar o freio parado) e a volta para a 1ª marcha.
 */
import { clamp, clamp01, damp, sampleCurve } from '../utils/math';
import type { ResolvedPhysics } from './VehicleConfig';

const RPM_PER_RADS = 60 / (2 * Math.PI);

export interface DrivetrainInput {
  throttle: number;
  brake: number;
}

export interface DrivetrainOutput {
  /** Força total nas rodas motrizes (N), positiva para frente. */
  driveForce: number;
  /** Intensidade de frenagem efetiva (0..1) após mapear freio/ré. */
  brake: number;
}

export class Drivetrain {
  /** -1 = ré, 1..n = marchas à frente. */
  gear = 1;
  rpm: number;
  shiftTimer = 0;
  throttle = 0;
  load = 0;
  limiterActive = false;
  /** Último sentido de troca (1 = subiu, -1 = reduziu) para áudio/HUD. */
  lastShift: -1 | 0 | 1 = 0;
  shiftCount = 0;

  private reverseTimer = 0;
  private limiterTimer = 0;
  private readonly output: DrivetrainOutput = { driveForce: 0, brake: 0 };

  constructor(private readonly phys: ResolvedPhysics) {
    this.rpm = phys.spec.engine.idleRpm;
  }

  get gearCount(): number {
    return this.phys.spec.transmission.gearRatios.length;
  }

  get isReverse(): boolean {
    return this.gear < 0;
  }

  get isShifting(): boolean {
    return this.shiftTimer > 0;
  }

  reset(): void {
    this.gear = 1;
    this.rpm = this.phys.spec.engine.idleRpm;
    this.shiftTimer = 0;
    this.throttle = 0;
    this.load = 0;
    this.reverseTimer = 0;
    this.limiterTimer = 0;
    this.limiterActive = false;
    this.lastShift = 0;
  }

  ratio(gear: number): number {
    const t = this.phys.spec.transmission;
    if (gear < 0) return t.reverseRatio;
    return t.gearRatios[clamp(gear, 1, t.gearRatios.length) - 1];
  }

  /** Rotação do motor correspondente a uma velocidade de roda em uma marcha. */
  rpmForWheelSpeed(wheelSpeed: number, gear: number): number {
    const omega = Math.abs(wheelSpeed) / this.phys.spec.wheels.radius;
    return omega * this.ratio(gear) * this.phys.finalDrive * RPM_PER_RADS;
  }

  /** Torque máximo disponível do motor em uma rotação (N·m), respeitando o limite de potência. */
  torqueAt(rpm: number): number {
    const e = this.phys.spec.engine;
    const normalized = clamp01(rpm / e.limiterRpm);
    let torque = e.maxTorqueNm * sampleCurve(e.torqueCurve, normalized);
    const omega = Math.max(rpm, 1) / RPM_PER_RADS;
    torque = Math.min(torque, (e.maxPowerKw * 1000) / omega);
    return torque;
  }

  /**
   * Atualiza o trem de força.
   * @param forwardSpeed velocidade longitudinal do carro (m/s, com sinal)
   * @param wheelSpeed velocidade média das rodas motrizes (m/s, com sinal)
   * @param grounded se as rodas motrizes têm contato
   */
  update(dt: number, input: DrivetrainInput, forwardSpeed: number, wheelSpeed: number, grounded: boolean): DrivetrainOutput {
    const spec = this.phys.spec;
    const e = spec.engine;
    const t = spec.transmission;

    // --- Seleção de ré/frente (câmbio automático estilo arcade) ---
    if (this.gear > 0) {
      if (Math.abs(forwardSpeed) < 0.8 && input.brake > 0.2 && input.throttle < 0.05) {
        this.reverseTimer += dt;
        if (this.reverseTimer > 0.3) {
          this.gear = -1;
          this.reverseTimer = 0;
          this.shiftTimer = 0;
        }
      } else {
        this.reverseTimer = 0;
      }
    } else if (input.throttle > 0.2 && forwardSpeed > -0.8) {
      this.gear = 1;
      this.shiftTimer = 0;
    }

    const driveRequest = this.gear < 0 ? input.brake : input.throttle;
    const brakeRequest = this.gear < 0 ? input.throttle : input.brake;

    this.throttle = damp(this.throttle, driveRequest, e.throttleResponse, dt);

    // --- Rotação do motor ---
    const ratio = this.ratio(this.gear);
    const wheelRpm = this.rpmForWheelSpeed(wheelSpeed, this.gear);
    // Embreagem patinando na saída: o motor sobe até uma rotação de arrancada proporcional ao acelerador.
    const launchRpm = e.electric ? 0 : e.idleRpm + (e.redlineRpm * 0.55 - e.idleRpm) * this.throttle;
    let targetRpm = Math.max(e.idleRpm, wheelRpm, launchRpm);
    if (!grounded) {
      // Sem contato: o motor sobe livremente com o acelerador.
      targetRpm = Math.max(targetRpm, e.idleRpm + (e.limiterRpm - e.idleRpm) * this.throttle);
    }
    this.rpm = damp(this.rpm, Math.min(targetRpm, e.limiterRpm * 1.02), this.shiftTimer > 0 ? 10 : 22, dt);

    // --- Limitador de giro ---
    if (this.rpm >= e.limiterRpm) this.limiterTimer = 0.08;
    this.limiterTimer = Math.max(0, this.limiterTimer - dt);
    this.limiterActive = this.limiterTimer > 0;

    // --- Torque e força nas rodas ---
    let engineTorque = 0;
    if (this.shiftTimer <= 0 && !this.limiterActive) {
      engineTorque = this.torqueAt(this.rpm) * this.throttle;
    }
    if (driveRequest < 0.05 && Math.abs(forwardSpeed) > 1 && this.shiftTimer <= 0) {
      const brakingFraction = clamp01((this.rpm - e.idleRpm) / (e.redlineRpm - e.idleRpm));
      engineTorque -= e.engineBraking * brakingFraction;
    }

    const direction = this.gear < 0 ? -1 : 1;
    let driveForce = (engineTorque * ratio * this.phys.finalDrive * t.efficiency) / spec.wheels.radius;
    // Freio-motor sempre se opõe ao movimento.
    if (engineTorque < 0) {
      driveForce = Math.abs(driveForce) * -Math.sign(forwardSpeed);
    } else {
      driveForce *= direction;
    }

    // Governador de velocidade máxima e limite de ré.
    if (direction > 0 && forwardSpeed > this.phys.topSpeed && driveForce > 0) driveForce = 0;
    if (direction < 0 && forwardSpeed < -9 && driveForce < 0) driveForce = 0;

    this.load = clamp01(this.throttle * (this.shiftTimer > 0 ? 0.3 : 1) + (this.limiterActive ? 0.2 : 0));

    // --- Trocas automáticas ---
    this.lastShift = 0;
    if (this.shiftTimer > 0) {
      this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    } else if (this.gear > 0 && grounded && !e.electric) {
      const n = t.gearRatios.length;
      if (this.gear < n && wheelRpm > t.upshiftRpm * e.redlineRpm) {
        this.shift(1);
      } else if (this.gear > 1) {
        const lowerRpm = this.rpmForWheelSpeed(wheelSpeed, this.gear - 1);
        const kickdown = this.throttle > 0.9 && lowerRpm < e.redlineRpm * 0.82 && wheelRpm < e.redlineRpm * 0.5;
        if ((wheelRpm < t.downshiftRpm * e.redlineRpm && lowerRpm < e.redlineRpm * 0.9) || kickdown) {
          this.shift(-1);
        }
      }
    }

    this.output.driveForce = driveForce;
    this.output.brake = clamp01(brakeRequest);
    return this.output;
  }

  private shift(direction: 1 | -1): void {
    this.gear += direction;
    this.shiftTimer = this.phys.spec.transmission.shiftTime;
    this.lastShift = direction;
    this.shiftCount++;
  }
}
