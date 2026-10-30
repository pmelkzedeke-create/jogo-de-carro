import { beforeAll, describe, expect, it } from 'vitest';
import { FixedTimestep } from '../../src/game/FixedTimestep';
import type { RapierModule } from '../../src/physics/rapier';
import { VEHICLES, getVehicle } from '../../src/vehicles/VehicleCatalog';
import { estimatePerformance } from '../../src/vehicles/VehiclePerformance';
import { addWallAtZ, createFlatWorld, headingOf, initRapier, spawnVehicle, stepVehicles } from './helpers/physicsHarness';

let R: RapierModule;
beforeAll(async () => {
  R = await initRapier();
});

const STEPS_PER_SECOND = 120;
const starter = () => getVehicle('valkar-sprint-gt');

describe('VehiclePhysics (Rapier real, passo fixo 1/120 s)', () => {
  it('assenta sobre as quatro rodas e permanece parado sem entrada', () => {
    const world = createFlatWorld(R);
    const car = spawnVehicle(world, starter());
    stepVehicles(world, [car], STEPS_PER_SECOND * 3);
    expect(car.groundedWheels).toBe(4);
    expect(car.speed).toBeLessThan(0.05);
    expect(car.up.y).toBeGreaterThan(0.99);
    expect(Math.abs(car.position.y - car.phys.rideHeight)).toBeLessThan(0.08);
    world.dispose();
  });

  it('acelera de forma progressiva e coerente com a estimativa de desempenho', () => {
    for (const def of VEHICLES) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, def);
      stepVehicles(world, [car], STEPS_PER_SECOND);
      car.controls.throttle = 1;
      let t = 0;
      let zeroTo100 = Infinity;
      let previous = 0;
      let monotonicViolations = 0;
      while (t < 15) {
        stepVehicles(world, [car], 1);
        t += 1 / STEPS_PER_SECOND;
        if (car.forwardSpeed < previous - 0.25) monotonicViolations++;
        previous = car.forwardSpeed;
        if (zeroTo100 === Infinity && car.forwardSpeed >= 100 / 3.6) zeroTo100 = t;
      }
      const estimate = estimatePerformance(def);
      // eslint-disable-next-line no-console
      console.log(`${def.manufacturer} ${def.name}: 0-100 simulado ${zeroTo100.toFixed(2)} s (estimado ${estimate.zeroTo100.toFixed(2)} s), marchas trocadas ${car.drivetrain.shiftCount}, v15s ${(car.forwardSpeed * 3.6).toFixed(0)} km/h`);
      expect(zeroTo100).toBeLessThan(12);
      expect(zeroTo100).toBeGreaterThan(estimate.zeroTo100 * 0.75);
      expect(zeroTo100).toBeLessThan(estimate.zeroTo100 * 1.45);
      expect(monotonicViolations).toBeLessThan(15);
      expect(car.groundedWheels).toBe(4);
      world.dispose();
    }
  });

  it('freia até parar sem inverter o sentido e engata a ré ao segurar o freio parado', () => {
    const world = createFlatWorld(R);
    const car = spawnVehicle(world, starter());
    stepVehicles(world, [car], STEPS_PER_SECOND);
    car.controls.throttle = 1;
    while (car.forwardSpeed < 100 / 3.6) stepVehicles(world, [car], 1);
    car.controls.throttle = 0;
    car.controls.brake = 1;
    const start = car.position.clone();
    let steps = 0;
    while (car.forwardSpeed > 0.3 && steps < STEPS_PER_SECOND * 10) {
      stepVehicles(world, [car], 1);
      steps++;
    }
    const distance = car.position.distanceTo(start);
    // eslint-disable-next-line no-console
    console.log(`Frenagem 100-0: ${distance.toFixed(1)} m em ${(steps / STEPS_PER_SECOND).toFixed(2)} s`);
    expect(distance).toBeLessThan(55);
    expect(distance).toBeGreaterThan(20);
    // Continua segurando o freio: deve engatar ré e andar para trás.
    stepVehicles(world, [car], STEPS_PER_SECOND * 3);
    expect(car.drivetrain.gear).toBe(-1);
    expect(car.forwardSpeed).toBeLessThan(-2);
    // Acelerar volta para a primeira marcha.
    car.controls.brake = 0;
    car.controls.throttle = 1;
    stepVehicles(world, [car], STEPS_PER_SECOND * 2);
    expect(car.drivetrain.gear).toBeGreaterThan(0);
    expect(car.forwardSpeed).toBeGreaterThan(1);
    world.dispose();
  });

  it('soltar o acelerador reduz a velocidade gradualmente', () => {
    const world = createFlatWorld(R);
    const car = spawnVehicle(world, starter());
    stepVehicles(world, [car], STEPS_PER_SECOND);
    car.controls.throttle = 1;
    while (car.forwardSpeed < 90 / 3.6) stepVehicles(world, [car], 1);
    car.controls.throttle = 0;
    const v0 = car.forwardSpeed;
    stepVehicles(world, [car], STEPS_PER_SECOND * 3);
    expect(car.forwardSpeed).toBeLessThan(v0 - 2);
    expect(car.forwardSpeed).toBeGreaterThan(v0 * 0.5);
    world.dispose();
  });

  it('esterça para o lado comandado, com raio coerente', () => {
    for (const direction of [1, -1]) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, starter());
      stepVehicles(world, [car], STEPS_PER_SECOND);
      car.controls.throttle = 0.6;
      while (car.forwardSpeed < 50 / 3.6) stepVehicles(world, [car], 1);
      car.controls.throttle = 0.25;
      const h0 = headingOf(car);
      car.controls.steer = direction;
      stepVehicles(world, [car], STEPS_PER_SECOND * 1.5);
      const dh = Math.atan2(Math.sin(headingOf(car) - h0), Math.cos(headingOf(car) - h0));
      // heading = atan2(x, z): virar à direita (steer +1) diminui o heading (rotação negativa em Y).
      expect(Math.sign(dh)).toBe(-direction);
      expect(Math.abs(dh)).toBeGreaterThan(0.5);
      expect(car.up.y).toBeGreaterThan(0.9);
      world.dispose();
    }
  });

  it('freio de mão em curva provoca deslizamento traseiro mensurável (drift) e recupera ao soltar', () => {
    const world = createFlatWorld(R);
    const car = spawnVehicle(world, getVehicle('sable-nero-v8'));
    stepVehicles(world, [car], STEPS_PER_SECOND);
    car.controls.throttle = 1;
    while (car.forwardSpeed < 85 / 3.6) stepVehicles(world, [car], 1);
    car.controls.throttle = 0.5;
    car.controls.steer = 0.7;
    stepVehicles(world, [car], 20);
    car.controls.handbrake = 1;
    let maxDrift = 0;
    let maxRearSkid = 0;
    for (let i = 0; i < STEPS_PER_SECOND * 0.6; i++) {
      stepVehicles(world, [car], 1);
      maxDrift = Math.max(maxDrift, Math.abs(car.driftAngle));
      maxRearSkid = Math.max(maxRearSkid, car.wheels[2].skid, car.wheels[3].skid);
    }
    // eslint-disable-next-line no-console
    console.log(`Drift: ângulo máximo ${(maxDrift * 57.3).toFixed(1)}°, derrapagem traseira ${maxRearSkid.toFixed(2)}`);
    expect(maxDrift).toBeGreaterThan(12 / 57.3);
    expect(maxRearSkid).toBeGreaterThan(0.3);
    // Solta o freio de mão, contraesterça e alivia: o carro deve se estabilizar.
    car.controls.handbrake = 0;
    car.controls.steer = 0;
    car.controls.throttle = 0.2;
    stepVehicles(world, [car], STEPS_PER_SECOND * 3);
    expect(Math.abs(car.driftAngle)).toBeLessThan(8 / 57.3);
    expect(car.up.y).toBeGreaterThan(0.9);
    world.dispose();
  });

  it('colide com barreira a alta velocidade sem atravessar nem ser lançado', () => {
    const world = createFlatWorld(R);
    addWallAtZ(world, 120);
    const car = spawnVehicle(world, getVehicle('orion-apex-r'));
    stepVehicles(world, [car], STEPS_PER_SECOND);
    car.controls.throttle = 1;
    let maxY = 0;
    let impacts = 0;
    let steps = 0;
    while (steps < STEPS_PER_SECOND * 12) {
      stepVehicles(world, [car], 1);
      steps++;
      impacts += world.impacts.events.length;
      maxY = Math.max(maxY, car.position.y);
      if (car.position.z > 100) car.controls.throttle = 1;
    }
    const halfLength = car.phys.spec.chassis.halfExtents[2];
    expect(car.position.z).toBeLessThan(120 + 0.2 - halfLength * 0.5);
    expect(maxY).toBeLessThan(2.5);
    expect(impacts).toBeGreaterThan(0);
    expect(car.invalidState).toBe(false);
    world.dispose();
  });

  it('impacto frontal a ~150 km/h gera evento forte e perda de velocidade', () => {
    const world = createFlatWorld(R);
    addWallAtZ(world, 400);
    const car = spawnVehicle(world, getVehicle('kestrel-rs4'));
    stepVehicles(world, [car], STEPS_PER_SECOND);
    car.controls.throttle = 1;
    let maxIntensity = 0;
    let speedBefore = 0;
    for (let i = 0; i < STEPS_PER_SECOND * 25; i++) {
      stepVehicles(world, [car], 1);
      if (car.position.z < 390) speedBefore = car.forwardSpeed;
      for (const e of world.impacts.events) maxIntensity = Math.max(maxIntensity, e.intensity);
      if (car.position.z > 380 && maxIntensity > 0) break;
    }
    stepVehicles(world, [car], 30);
    // eslint-disable-next-line no-console
    console.log(`Impacto: velocidade antes ${(speedBefore * 3.6).toFixed(0)} km/h, intensidade ${maxIntensity.toFixed(2)}, depois ${(car.forwardSpeed * 3.6).toFixed(0)} km/h`);
    expect(maxIntensity).toBeGreaterThan(1);
    expect(car.forwardSpeed).toBeLessThan(speedBefore * 0.5);
    expect(car.position.z).toBeLessThan(400);
    world.dispose();
  });

  it('resultado independe da taxa de quadros (30/60/120/144 FPS)', () => {
    const finals: Array<{ fps: number; x: number; z: number; speed: number }> = [];
    for (const fps of [30, 60, 120, 144]) {
      const world = createFlatWorld(R);
      const car = spawnVehicle(world, starter());
      const stepper = new FixedTimestep(1 / 120);
      const frameDt = 1 / fps;
      let realTime = 0;
      while (realTime < 9) {
        realTime += frameDt;
        // Entrada amostrada por quadro, como no jogo.
        const t = realTime;
        car.controls.throttle = t > 1 && t < 6 ? 1 : 0;
        car.controls.steer = t > 3.5 && t < 5 ? 0.6 : 0;
        car.controls.brake = t > 6.5 && t < 7.5 ? 0.8 : 0;
        const steps = stepper.advance(frameDt);
        stepVehicles(world, [car], steps);
      }
      finals.push({ fps, x: car.position.x, z: car.position.z, speed: car.forwardSpeed });
      world.dispose();
    }
    // eslint-disable-next-line no-console
    console.log(finals.map((f) => `${f.fps} FPS: (${f.x.toFixed(2)}, ${f.z.toFixed(2)}) ${(f.speed * 3.6).toFixed(1)} km/h`).join(' | '));
    const ref = finals[2];
    for (const f of finals) {
      expect(Math.hypot(f.x - ref.x, f.z - ref.z)).toBeLessThan(2.5);
      expect(Math.abs(f.speed - ref.speed)).toBeLessThan(1);
    }
  });
});
