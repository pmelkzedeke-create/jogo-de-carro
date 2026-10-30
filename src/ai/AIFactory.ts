/**
 * Criação de pilotos de IA com perfil de velocidade adequado ao carro e à dificuldade.
 */
import { GRAVITY } from '../utils/math';
import { hashString } from '../utils/rng';
import type { Track } from '../tracks/Track';
import type { VehiclePhysics } from '../vehicles/VehiclePhysics';
import { AIDriver } from './AIDriver';
import type { AIDifficulty } from './Difficulty';
import { RacingLine, type SpeedProfile } from './RacingLine';

/** Fração da aderência nominal que a IA consegue usar com segurança no modelo de pneus atual. */
export const AI_GRIP_USAGE = 0.82;

const lineCache = new WeakMap<Track, RacingLine>();
const profileCache = new WeakMap<RacingLine, Map<string, SpeedProfile>>();

export function getRacingLine(track: Track): RacingLine {
  let line = lineCache.get(track);
  if (!line) {
    line = new RacingLine(track);
    lineCache.set(track, line);
  }
  return line;
}

export function getSpeedProfile(line: RacingLine, vehicle: VehiclePhysics, difficulty: AIDifficulty): SpeedProfile {
  let map = profileCache.get(line);
  if (!map) {
    map = new Map();
    profileCache.set(line, map);
  }
  const key = `${vehicle.definition.id}:${difficulty.id}`;
  let profile = map.get(key);
  if (!profile) {
    const spec = vehicle.phys.spec;
    const m = vehicle.phys.mass;
    const grip = spec.tires.grip * Math.min(1, spec.tires.rearGripMultiplier);
    profile = line.speedProfile({
      lateralGrip: grip * AI_GRIP_USAGE,
      brakeDecel: Math.min(spec.brakes.maxForce / m, spec.tires.grip * spec.tires.longitudinalGrip * GRAVITY) * difficulty.brakingFactor,
      downforcePerMass: (spec.chassis.downforce / m) * 0.8,
      topSpeed: vehicle.phys.topSpeed,
    });
    map.set(key, profile);
  }
  return profile;
}

export function createAIDriver(track: Track, vehicle: VehiclePhysics, difficulty: AIDifficulty, seedKey: string): AIDriver {
  const line = getRacingLine(track);
  const profile = getSpeedProfile(line, vehicle, difficulty);
  return new AIDriver(vehicle, track, line, profile, difficulty, hashString(seedKey));
}
