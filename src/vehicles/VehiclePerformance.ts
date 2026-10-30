/**
 * Estimativa de desempenho a partir dos MESMOS parâmetros físicos usados na simulação.
 * As estatísticas exibidas na garagem são calculadas aqui (não são números inventados).
 * Usa um modelo longitudinal 1D com o mesmo trem de força (Drivetrain).
 */
import { clamp, GRAVITY } from '../utils/math';
import { Drivetrain } from './Drivetrain';
import { resolvePhysics, type VehicleDefinition } from './VehicleConfig';

export interface VehiclePerformance {
  zeroTo100: number;
  topSpeedKmh: number;
  braking100to0: number;
  lateralG: number;
  powerToWeight: number;
  ratings: { speed: number; acceleration: number; handling: number; braking: number };
  /** Índice de desempenho (100..999) usado para equilibrar adversários. */
  index: number;
}

const cache = new Map<string, VehiclePerformance>();

export function estimatePerformance(vehicle: VehicleDefinition): VehiclePerformance {
  const cached = cache.get(vehicle.id);
  if (cached) return cached;

  const phys = resolvePhysics(vehicle.physics);
  const spec = phys.spec;
  const m = phys.mass;
  const f = spec.chassis.weightDistributionFront;
  const drivenFraction = spec.drive === 'AWD' ? 1 : spec.drive === 'FWD' ? f : 1 - f;
  const drivetrain = new Drivetrain(phys);
  const dt = 1 / 120;
  let v = 0;
  let t = 0;
  let zeroTo100 = Number.NaN;
  let maxV = 0;
  let stableTime = 0;

  while (t < 120) {
    const out = drivetrain.update(dt, { throttle: 1, brake: 0 }, v, v, true);
    const downforce = spec.chassis.downforce * v * v;
    const traction = spec.tires.grip * spec.tires.longitudinalGrip * (m * GRAVITY + downforce) * drivenFraction;
    const drive = clamp(out.driveForce, -traction, traction);
    const resist = phys.dragCoefficient * v * v + spec.tires.rollingResistance * (m * GRAVITY + downforce);
    const a = (drive - resist) / m;
    v = Math.max(0, v + a * dt);
    t += dt;
    if (Number.isNaN(zeroTo100) && v >= 100 / 3.6) zeroTo100 = t;
    if (v > maxV + 0.001) {
      maxV = v;
      stableTime = 0;
    } else {
      stableTime += dt;
      if (stableTime > 3) break;
    }
  }

  const topSpeedKmh = Math.min(maxV, phys.topSpeed * 1.01) * 3.6;
  const v100 = 100 / 3.6;
  const brakeDecel = Math.min(spec.brakes.maxForce / m, spec.tires.grip * spec.tires.longitudinalGrip * GRAVITY * 0.97);
  const braking100to0 = (v100 * v100) / (2 * brakeDecel);
  const vRef = 150 / 3.6;
  const lateralG = (spec.tires.grip * (m * GRAVITY + spec.chassis.downforce * vRef * vRef)) / (m * GRAVITY);
  const powerToWeight = (spec.engine.maxPowerKw * 1000) / m;

  const rate = (value: number, worst: number, best: number) => clamp(((value - worst) / (best - worst)) * 10, 0, 10);
  const ratings = {
    speed: rate(topSpeedKmh, 180, 340),
    acceleration: rate(Number.isNaN(zeroTo100) ? 20 : zeroTo100, 9, 2.6),
    handling: rate(lateralG, 1.15, 1.95),
    braking: rate(braking100to0, 42, 26),
  };
  const index = Math.round(100 + (ratings.speed * 0.28 + ratings.acceleration * 0.3 + ratings.handling * 0.28 + ratings.braking * 0.14) * 89.9);

  const result: VehiclePerformance = {
    zeroTo100: Number.isNaN(zeroTo100) ? Infinity : zeroTo100,
    topSpeedKmh,
    braking100to0,
    lateralG,
    powerToWeight,
    ratings,
    index,
  };
  cache.set(vehicle.id, result);
  return result;
}

export function performanceClass(index: number): string {
  if (index >= 800) return 'S';
  if (index >= 650) return 'A';
  if (index >= 500) return 'B';
  if (index >= 350) return 'C';
  return 'D';
}
