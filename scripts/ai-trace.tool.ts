import { test } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { createAIDriver, getRacingLine } from '../src/ai/AIFactory';
import { DIFFICULTIES } from '../src/ai/Difficulty';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import type { RapierModule } from '../src/physics/rapier';
import { createProjection } from '../src/tracks/Track';
import { buildTrack } from '../src/tracks/TrackBuilder';
import { TRACKS } from '../src/tracks/TrackCatalog';
import { buildTrackColliders, buildTrackRibbons } from '../src/tracks/TrackColliders';
import { buildTerrain } from '../src/tracks/Terrain';
import { getVehicle } from '../src/vehicles/VehicleCatalog';
import { resolvePhysics } from '../src/vehicles/VehicleConfig';
import { VehiclePhysics } from '../src/vehicles/VehiclePhysics';

test('trace', async () => {
  await RAPIER.init();
  const R = RAPIER as unknown as RapierModule;
  const [trackId, vehicleId, from, to] = (process.env.CASE ?? 'estrada-mirante:arcadia-volt-e:930:1120').split(':');
  const track = buildTrack(TRACKS.find((t) => t.id === trackId)!);
  const world = new PhysicsWorld(R, 1 / 120);
  buildTrackColliders(world, track, buildTrackRibbons(track), buildTerrain(track));
  const vdef = getVehicle(vehicleId);
  const phys = resolvePhysics(vdef.physics);
  const slot = track.grid[0];
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), slot.forward.clone().setY(0).normalize());
  const car = new VehiclePhysics(world, vdef, slot.position.clone().setY(slot.position.y + phys.rideHeight + 0.1), q, 'ai');
  const ai = createAIDriver(track, car, DIFFICULTIES.hard, `${trackId}-${vehicleId}`);
  const line = getRacingLine(track);
  const proj = createProjection();
  let hint = -1;
  let t = 0;
  const dt = 1 / 120;
  let printed = 0;
  while (t < 80) {
    track.project(car.position, hint, proj);
    hint = proj.index;
    if (proj.s > +from && proj.s < +to && Math.round(t * 120) % 12 === 0 && printed < 80) {
      printed++;
      const target = ai.targetSpeedAt(proj.s + Math.abs(car.forwardSpeed) * 0.35);
      console.log(`s=${proj.s.toFixed(0)} lat=${proj.lateral.toFixed(1)} linha=${line.offsetAt(proj.s).toFixed(1)} κpista=${(track.curvatureAt(proj.s) * 1000).toFixed(1)} κlinha=${(line.curvatureAt(proj.s) * 1000).toFixed(1)} v=${(car.forwardSpeed * 3.6).toFixed(0)} alvo=${(target * 3.6).toFixed(0)} thr=${ai.controls.throttle.toFixed(2)} brk=${ai.controls.brake.toFixed(2)} steer=${ai.controls.steer.toFixed(2)} drift=${(car.driftAngle * 57.3).toFixed(1)} yaw=${car.yawRate.toFixed(2)} rodas=${car.wheels.map((w) => w.slipAngle.toFixed(2)).join('/')}`);
    }
    if (proj.s > +to + 50) break;
    ai.update(dt, { id: 'ai', s: proj.s, progress: 0, lateral: proj.lateral, speed: car.speed, ghost: false }, []);
    Object.assign(car.controls, ai.controls);
    car.snapshot();
    car.step(dt);
    world.step();
    car.postStep(dt);
    t += dt;
  }
  world.dispose();
});
