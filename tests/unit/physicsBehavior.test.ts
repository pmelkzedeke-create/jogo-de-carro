/**
 * Fase 2 — comportamentos físicos mensuráveis (Rapier real).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { CollisionGroups } from '../../src/physics/CollisionLayers';
import type { RapierModule } from '../../src/physics/rapier';
import { getVehicle } from '../../src/vehicles/VehicleCatalog';
import { resolvePhysics } from '../../src/vehicles/VehicleConfig';
import { VehiclePhysics } from '../../src/vehicles/VehiclePhysics';
import { createFlatWorld, headingOf, initRapier, spawnVehicle, stepVehicles } from './helpers/physicsHarness';

let R: RapierModule;
beforeAll(async () => {
  R = await initRapier();
});
const SPS = 120;

function accelerateTo(world: ReturnType<typeof createFlatWorld>, car: VehiclePhysics, kmh: number): void {
  car.controls.throttle = 1;
  let guard = 0;
  while (car.forwardSpeed < kmh / 3.6 && guard++ < SPS * 30) stepVehicles(world, [car], 1);
}

describe('Fase 2 — dirigibilidade', () => {
  it('acelerar no meio da curva: RWD tende a sobresterçar, FWD a subesterçar (sem assistência)', () => {
    const result: Record<string, { drift: number; yawGain: number }> = {};
    for (const id of ['valkar-sprint-gt', 'sable-nero-v8']) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, getVehicle(id));
      car.assistLevel = 0;
      stepVehicles(world, [car], SPS);
      car.controls.throttle = 0.5;
      let guard = 0;
      while (car.forwardSpeed < 40 / 3.6 && guard++ < SPS * 20) stepVehicles(world, [car], 1);
      // Curva constante com acelerador moderado.
      car.controls.steer = 0.45;
      for (let i = 0; i < SPS * 2; i++) {
        car.controls.throttle = car.forwardSpeed < 40 / 3.6 ? 0.45 : 0.15;
        stepVehicles(world, [car], 1);
      }
      const yawBefore = Math.abs(car.yawRate);
      const curvatureBefore = yawBefore / Math.max(car.speed, 0.1);
      // Acelerador total no meio da curva.
      car.controls.throttle = 1;
      let maxDrift = 0;
      let curvatureAfter = 0;
      for (let i = 0; i < SPS * 1.2; i++) {
        stepVehicles(world, [car], 1);
        maxDrift = Math.max(maxDrift, Math.abs(car.driftAngle));
        curvatureAfter = Math.abs(car.yawRate) / Math.max(car.speed, 0.1);
      }
      result[id] = { drift: maxDrift, yawGain: curvatureAfter / Math.max(curvatureBefore, 1e-3) };
      world.dispose();
    }
    const fwd = result['valkar-sprint-gt'];
    const rwd = result['sable-nero-v8'];
    // eslint-disable-next-line no-console
    console.log(`Acelerador total na curva — FWD: deriva ${(fwd.drift * 57.3).toFixed(1)}°, curvatura ×${fwd.yawGain.toFixed(2)} | RWD: deriva ${(rwd.drift * 57.3).toFixed(1)}°, curvatura ×${rwd.yawGain.toFixed(2)}`);
    expect(rwd.drift).toBeGreaterThan(fwd.drift);
    expect(rwd.yawGain).toBeGreaterThan(fwd.yawGain);
    expect(fwd.yawGain).toBeLessThan(1.05);
  });

  it('controle de tração reduz a patinação na arrancada', () => {
    const slip: Record<string, number> = {};
    for (const assist of [0, 1]) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, getVehicle('sable-nero-v8'));
      car.assistLevel = assist;
      stepVehicles(world, [car], SPS);
      car.controls.throttle = 1;
      let total = 0;
      for (let i = 0; i < SPS * 1.5; i++) {
        stepVehicles(world, [car], 1);
        total += car.wheels[2].longitudinalSlip + car.wheels[3].longitudinalSlip;
      }
      slip[assist] = total;
      world.dispose();
    }
    expect(slip[1]).toBeLessThan(slip[0] * 0.5);
  });

  it('ABS mantém a direção durante frenagem forte em curva', () => {
    const turned: Record<string, number> = {};
    for (const assist of [0, 1]) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, getVehicle('kestrel-rs4'));
      car.assistLevel = assist;
      stepVehicles(world, [car], SPS);
      accelerateTo(world, car, 110);
      const h0 = headingOf(car);
      car.controls.throttle = 0;
      car.controls.brake = 1;
      car.controls.steer = 0.6;
      stepVehicles(world, [car], SPS * 1.2);
      turned[assist] = Math.abs(Math.atan2(Math.sin(headingOf(car) - h0), Math.cos(headingOf(car) - h0)));
      world.dispose();
    }
    // eslint-disable-next-line no-console
    console.log(`Giro durante frenagem em curva: sem ABS ${(turned[0] * 57.3).toFixed(1)}°, com ABS ${(turned[1] * 57.3).toFixed(1)}°`);
    expect(turned[1]).toBeGreaterThan(turned[0]);
  });

  it('grama reduz a velocidade em relação ao asfalto', () => {
    const speeds: Record<string, number> = {};
    for (const surface of ['asphalt', 'grass'] as const) {
      const world = createFlatWorld(R);
      // Substitui a superfície do chão.
      world.world.forEachCollider((c) => {
        const info = world.infoOf(c.handle);
        if (info?.kind === 'ground') info.surface = surface;
      });
      const car = spawnVehicle(world, getVehicle('valkar-sprint-gt'));
      stepVehicles(world, [car], SPS);
      car.controls.throttle = 1;
      stepVehicles(world, [car], SPS * 8);
      speeds[surface] = car.forwardSpeed;
      world.dispose();
    }
    // eslint-disable-next-line no-console
    console.log(`Velocidade após 8 s: asfalto ${(speeds.asphalt * 3.6).toFixed(0)} km/h, grama ${(speeds.grass * 3.6).toFixed(0)} km/h`);
    expect(speeds.grass).toBeLessThan(speeds.asphalt * 0.85);
  });

  it('em alta velocidade, pequena correção de direção não gera oscilação', () => {
    const world = createFlatWorld(R, 6000);
    const car = spawnVehicle(world, getVehicle('orion-apex-r'));
    stepVehicles(world, [car], SPS);
    accelerateTo(world, car, 220);
    car.controls.steer = 0.15;
    stepVehicles(world, [car], SPS / 2);
    car.controls.steer = 0;
    const rates: number[] = [];
    for (let i = 0; i < SPS * 3; i++) {
      stepVehicles(world, [car], 1);
      rates.push(car.yawRate);
    }
    // Após soltar o volante a guinada deve decair (sem crescer/oscilar).
    const early = Math.max(...rates.slice(0, SPS / 2).map(Math.abs));
    const late = Math.max(...rates.slice(SPS * 2).map(Math.abs));
    expect(late).toBeLessThan(early * 0.5 + 0.01);
    expect(car.up.y).toBeGreaterThan(0.95);
    world.dispose();
  });

  it('pouso após queda de 2 m é estável (sem quicar ou capotar)', () => {
    const world = createFlatWorld(R);
    const def = getVehicle('kestrel-rs4');
    const phys = resolvePhysics(def.physics);
    const car = new VehiclePhysics(world, def, new Vector3(0, phys.rideHeight + 2, 0), new Quaternion(), 'drop');
    let maxUp = 0;
    for (let i = 0; i < SPS * 3; i++) {
      stepVehicles(world, [car], 1);
      if (i > SPS * 0.8) maxUp = Math.max(maxUp, car.velocity.y);
    }
    expect(car.groundedWheels).toBe(4);
    expect(car.up.y).toBeGreaterThan(0.98);
    expect(maxUp).toBeLessThan(1.2);
    world.dispose();
  });

  it('colisão entre carros transfere momento sem lançar nenhum deles', () => {
    const world = createFlatWorld(R);
    const a = spawnVehicle(world, getVehicle('sable-nero-v8'), 0, 0, 0, 'a');
    const b = spawnVehicle(world, getVehicle('valkar-sprint-gt'), 0, 40, 0, 'b');
    stepVehicles(world, [a, b], SPS);
    a.controls.throttle = 1;
    let maxY = 0;
    let contact = false;
    for (let i = 0; i < SPS * 6; i++) {
      stepVehicles(world, [a, b], 1);
      maxY = Math.max(maxY, a.position.y, b.position.y);
      if (world.impacts.events.some((e) => e.otherCarId)) contact = true;
    }
    expect(contact).toBe(true);
    expect(b.position.z).toBeGreaterThan(40.5);
    expect(maxY).toBeLessThan(2);
    expect(a.up.y).toBeGreaterThan(0.8);
    expect(b.up.y).toBeGreaterThan(0.8);
    world.dispose();
  });

  it('modo fantasma (pós-recuperação) atravessa outros carros mas não barreiras', () => {
    const world = createFlatWorld(R);
    const a = spawnVehicle(world, getVehicle('kestrel-rs4'), 0, 0, 0, 'a');
    const b = spawnVehicle(world, getVehicle('valkar-sprint-gt'), 0, 25, 0, 'b');
    stepVehicles(world, [a, b], SPS);
    a.setGhost(true);
    expect(a.colliders[0].collisionGroups()).toBe(CollisionGroups.carGhost);
    a.controls.throttle = 1;
    stepVehicles(world, [a, b], SPS * 5);
    expect(a.position.z).toBeGreaterThan(b.position.z + 5);
    expect(b.speed).toBeLessThan(0.5);
    world.dispose();
  });
});
