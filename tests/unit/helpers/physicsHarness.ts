/**
 * Utilitários de teste: mundo físico real do Rapier com chão plano e barreiras simples.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { CollisionGroups } from '../../../src/physics/CollisionLayers';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import type { RapierModule } from '../../../src/physics/rapier';
import { resolvePhysics, type VehicleDefinition } from '../../../src/vehicles/VehicleConfig';
import { VehiclePhysics } from '../../../src/vehicles/VehiclePhysics';

let ready: Promise<RapierModule> | null = null;

export function initRapier(): Promise<RapierModule> {
  if (!ready) ready = RAPIER.init().then(() => RAPIER as unknown as RapierModule);
  return ready;
}

export function createFlatWorld(R: RapierModule, size = 2000): PhysicsWorld {
  const world = new PhysicsWorld(R, 1 / 120);
  const body = world.createFixedBody();
  const ground = world.world.createCollider(
    R.ColliderDesc.cuboid(size / 2, 0.5, size / 2)
      .setTranslation(0, -0.5, 0)
      .setFriction(0.9)
      .setCollisionGroups(CollisionGroups.ground)
      .setSolverGroups(CollisionGroups.ground),
    body,
  );
  world.register(ground, { kind: 'ground', surface: 'asphalt' });
  return world;
}

/** Adiciona um muro (barreira) perpendicular ao eixo Z na posição z. */
export function addWallAtZ(world: PhysicsWorld, z: number, halfWidth = 40, thickness = 0.6): void {
  const R = world.R;
  const body = world.createFixedBody();
  const wall = world.world.createCollider(
    R.ColliderDesc.cuboid(halfWidth, 0.7, thickness / 2)
      .setTranslation(0, 0.7, z + thickness / 2)
      .setFriction(0.4)
      .setCollisionGroups(CollisionGroups.barrier)
      .setSolverGroups(CollisionGroups.barrier),
    body,
  );
  world.register(wall, { kind: 'barrier' });
}

export function spawnVehicle(world: PhysicsWorld, def: VehicleDefinition, x = 0, z = 0, yaw = 0, id = 'car'): VehiclePhysics {
  const phys = resolvePhysics(def.physics);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  return new VehiclePhysics(world, def, new Vector3(x, phys.rideHeight + 0.05, z), q, id);
}

/** Executa N passos físicos com o veículo. */
export function stepVehicles(world: PhysicsWorld, vehicles: VehiclePhysics[], steps: number): void {
  for (let i = 0; i < steps; i++) {
    for (const v of vehicles) {
      v.snapshot();
      v.step(world.fixedDt);
    }
    world.step();
    for (const v of vehicles) v.postStep(world.fixedDt);
  }
}

export function headingOf(v: VehiclePhysics): number {
  return Math.atan2(v.forward.x, v.forward.z);
}
