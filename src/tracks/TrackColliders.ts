/**
 * Colisores físicos da pista (Rapier), gerados a partir dos MESMOS dados das malhas visuais.
 * - Asfalto, zebras e acostamentos: malhas de triângulos (superfícies distintas).
 * - Área de escape (grama) e terreno: malhas de triângulos.
 * - Barreiras: caixas sobrepostas ao longo das linhas de barreira (sem frestas).
 * - Piso de segurança muito abaixo do terreno (detecção de queda/fora dos limites).
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { CollisionGroups } from '../physics/CollisionLayers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SurfaceType } from '../physics/Surfaces';
import type { Track } from './Track';
import { buildRibbon, type RibbonGeometry } from './TrackGeometry';
import { terrainIndices, terrainPositions, type TerrainData } from './Terrain';

export interface TrackPhysics {
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  /** Altura do piso de segurança. */
  safetyFloorY: number;
  dispose(): void;
}

export const BARRIER_HEIGHT = 1.15;
export const BARRIER_THICKNESS = 0.5;

/** Bandas laterais compartilhadas com a renderização. */
export function trackBands(track: Track) {
  const hw = track.halfWidth;
  const sh = track.shoulderWidth;
  return {
    road: { from: -hw, to: hw },
    shoulderLeft: { from: -(hw + sh), to: -hw },
    shoulderRight: { from: hw, to: hw + sh },
    runoffLeft: { from: -(track.barrierOffset + 3.5), to: -(hw + sh) },
    runoffRight: { from: hw + sh, to: track.barrierOffset + 3.5 },
  };
}

export function buildTrackRibbons(track: Track) {
  const bands = trackBands(track);
  const curbs = track.curbs;
  return {
    road: buildRibbon(track, { ...bands.road, across: 4, step: 1, uvLength: 12 }),
    curbLeft: buildRibbon(track, { ...bands.shoulderLeft, yFrom: 0.035, yTo: 0.012, include: curbs, step: 1, uvLength: 4 }),
    curbRight: buildRibbon(track, { ...bands.shoulderRight, yFrom: 0.012, yTo: 0.035, include: curbs, step: 1, uvLength: 4 }),
    shoulderLeft: buildRibbon(track, { ...bands.shoulderLeft, yFrom: 0.004, yTo: 0.004, exclude: curbs, step: 2, uvLength: 12 }),
    shoulderRight: buildRibbon(track, { ...bands.shoulderRight, yFrom: 0.004, yTo: 0.004, exclude: curbs, step: 2, uvLength: 12 }),
    runoffLeft: buildRibbon(track, { ...bands.runoffLeft, yFrom: -0.06, yTo: -0.025, across: 2, step: 2, uvLength: 16, clampInner: true }),
    runoffRight: buildRibbon(track, { ...bands.runoffRight, yFrom: -0.025, yTo: -0.06, across: 2, step: 2, uvLength: 16, clampInner: true }),
  };
}

export type TrackRibbons = ReturnType<typeof buildTrackRibbons>;

export function buildTrackColliders(world: PhysicsWorld, track: Track, ribbons: TrackRibbons, terrain: TerrainData): TrackPhysics {
  const R = world.R;
  const body = world.createFixedBody();
  const colliders: RAPIER.Collider[] = [];

  const addTrimesh = (geometry: { positions: Float32Array; indices: Uint32Array }, surface: SurfaceType, friction: number) => {
    if (geometry.indices.length < 3) return;
    let desc: RAPIER.ColliderDesc;
    try {
      desc = R.ColliderDesc.trimesh(geometry.positions, geometry.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES);
    } catch {
      desc = R.ColliderDesc.trimesh(geometry.positions, geometry.indices);
    }
    desc.setFriction(friction).setRestitution(0).setCollisionGroups(CollisionGroups.ground).setSolverGroups(CollisionGroups.ground);
    const collider = world.world.createCollider(desc, body);
    world.register(collider, { kind: 'ground', surface });
    colliders.push(collider);
  };

  const ribbonAsMesh = (r: RibbonGeometry) => ({ positions: r.positions, indices: r.indices });
  addTrimesh(ribbonAsMesh(ribbons.road), 'asphalt', 0.9);
  addTrimesh(ribbonAsMesh(ribbons.curbLeft), 'curb', 0.8);
  addTrimesh(ribbonAsMesh(ribbons.curbRight), 'curb', 0.8);
  addTrimesh(ribbonAsMesh(ribbons.shoulderLeft), 'asphalt', 0.9);
  addTrimesh(ribbonAsMesh(ribbons.shoulderRight), 'asphalt', 0.9);
  addTrimesh(ribbonAsMesh(ribbons.runoffLeft), 'grass', 0.6);
  addTrimesh(ribbonAsMesh(ribbons.runoffRight), 'grass', 0.6);
  addTrimesh({ positions: terrainPositions(terrain), indices: terrainIndices(terrain) }, 'grass', 0.6);

  // Barreiras.
  const segDir = new Vector3();
  const outward = new Vector3();
  const frame = track.sampleAt(0);
  const isConcrete = track.definition.barrierStyle === 'concrete';
  for (const run of track.barriers) {
    const pts = run.points;
    const count = run.closedLoop ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      segDir.subVectors(b, a);
      segDir.y = 0;
      const length = segDir.length();
      if (length < 0.05) continue;
      segDir.divideScalar(length);
      if (run.side === 0) {
        track.sampleAt(run.s[0], frame);
        const sign = run.s[0] < track.length / 2 ? -1 : 1;
        outward.copy(frame.tangent).setY(0).normalize().multiplyScalar(sign);
      } else {
        outward.set(-segDir.z, 0, segDir.x).multiplyScalar(run.side);
      }
      const yBase = Math.min(a.y, b.y) - 0.45;
      const height = BARRIER_HEIGHT + 0.45 + Math.abs(a.y - b.y);
      const cx = (a.x + b.x) / 2 + outward.x * (BARRIER_THICKNESS / 2);
      const cz = (a.z + b.z) / 2 + outward.z * (BARRIER_THICKNESS / 2);
      const yaw = Math.atan2(segDir.x, segDir.z);
      const desc = R.ColliderDesc.cuboid(BARRIER_THICKNESS / 2, height / 2, length / 2 + 0.2)
        .setTranslation(cx, yBase + height / 2, cz)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setFriction(isConcrete ? 0.25 : 0.2)
        .setRestitution(0.15)
        .setCollisionGroups(CollisionGroups.barrier)
        .setSolverGroups(CollisionGroups.barrier);
      const collider = world.world.createCollider(desc, body);
      world.register(collider, { kind: 'barrier' });
      colliders.push(collider);
    }
  }

  // Piso de segurança.
  let minHeight = Infinity;
  for (let i = 0; i < terrain.heights.length; i++) minHeight = Math.min(minHeight, terrain.heights[i]);
  const safetyFloorY = minHeight - 25;
  const span = Math.max(terrain.cols, terrain.rows) * terrain.cellSize * 2;
  const floor = world.world.createCollider(
    R.ColliderDesc.cuboid(span, 1, span)
      .setTranslation(terrain.originX + (terrain.cols * terrain.cellSize) / 2, safetyFloorY - 1, terrain.originZ + (terrain.rows * terrain.cellSize) / 2)
      .setCollisionGroups(CollisionGroups.ground)
      .setSolverGroups(CollisionGroups.ground),
    body,
  );
  world.register(floor, { kind: 'ground', surface: 'grass' });
  colliders.push(floor);

  return {
    body,
    colliders,
    safetyFloorY,
    dispose() {
      if (world.isDisposed) return;
      for (const c of colliders) world.unregister(c);
      world.world.removeRigidBody(body);
    },
  };
}
