/**
 * Envoltório do mundo físico do Rapier.
 * - Passo de tempo fixo (padrão 1/120 s), independente da taxa de quadros.
 * - Registro de metadados por colisor (tipo, superfície, dono).
 * - Coleta de eventos de impacto para áudio/partículas/câmera.
 * Não contém nenhum código de renderização.
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type { RapierModule } from './rapier';
import { ImpactQueue, type ColliderKind } from './CollisionEvents';
import type { SurfaceType } from './Surfaces';

export interface ColliderInfo {
  kind: ColliderKind;
  surface?: SurfaceType;
  ownerId?: string;
  /** Massa do corpo dono (usada para estimar intensidade de impacto). */
  mass?: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface RayHit {
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  collider: RAPIER.Collider;
  info: ColliderInfo | undefined;
}

export class PhysicsWorld {
  readonly R: RapierModule;
  readonly world: RAPIER.World;
  readonly fixedDt: number;
  readonly impacts = new ImpactQueue();
  stepCount = 0;

  private readonly eventQueue: RAPIER.EventQueue;
  private readonly infos = new Map<number, ColliderInfo>();
  private readonly ray: RAPIER.Ray;
  private readonly hit: RayHit;
  private disposed = false;

  constructor(R: RapierModule, fixedDt = 1 / 120) {
    this.R = R;
    this.fixedDt = fixedDt;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = fixedDt;
    this.eventQueue = new R.EventQueue(true);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.hit = {
      distance: 0,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      collider: null as unknown as RAPIER.Collider,
      info: undefined,
    };
  }

  register(collider: RAPIER.Collider, info: ColliderInfo): void {
    this.infos.set(collider.handle, info);
  }

  unregister(collider: RAPIER.Collider): void {
    this.infos.delete(collider.handle);
  }

  infoOf(handle: number): ColliderInfo | undefined {
    return this.infos.get(handle);
  }

  /** Avança a simulação exatamente um passo fixo e coleta impactos. */
  step(): void {
    if (this.disposed) return;
    this.impacts.clear();
    this.world.step(this.eventQueue);
    this.stepCount++;

    this.eventQueue.drainContactForceEvents((event) => {
      const h1 = event.collider1();
      const h2 = event.collider2();
      const a = this.infos.get(h1);
      const b = this.infos.get(h2);
      if (!a || !b) return;
      const force = event.totalForceMagnitude();
      if (!Number.isFinite(force) || force <= 0) return;

      const carA = a.kind === 'car' ? a : null;
      const carB = b.kind === 'car' ? b : null;
      if (!carA && !carB) return;
      const car = carA ?? carB!;
      const other = car === carA ? b : a;
      if (other.kind === 'ground') return; // contato com o solo não é impacto

      const mass = car.mass ?? 1200;
      const intensity = (force * this.fixedDt) / mass;
      let point: Vec3Like | null = null;
      if (intensity > 0.6) {
        const c1 = this.world.getCollider(h1);
        const c2 = this.world.getCollider(h2);
        if (c1 && c2) {
          this.world.contactPair(c1, c2, (manifold) => {
            if (point) return;
            if (manifold.numSolverContacts() > 0) {
              const p = manifold.solverContactPoint(0);
              if (p) point = { x: p.x, y: p.y, z: p.z };
            }
          });
        }
      }
      this.impacts.push({
        carId: car.ownerId ?? null,
        otherCarId: other.kind === 'car' ? (other.ownerId ?? null) : null,
        otherKind: other.kind,
        force,
        intensity,
        point,
      });
    });
    this.eventQueue.drainCollisionEvents(() => {
      /* eventos de início/fim de contato não são usados atualmente */
    });
  }

  /**
   * Lança um raio e retorna o primeiro impacto.
   * ATENÇÃO: o objeto retornado é reutilizado; copie os valores se precisar guardá-los.
   */
  castRay(
    origin: Vec3Like,
    direction: Vec3Like,
    maxDistance: number,
    groups: number,
    excludeCollider?: RAPIER.Collider,
    excludeBody?: RAPIER.RigidBody,
  ): RayHit | null {
    const ray = this.ray;
    ray.origin.x = origin.x;
    ray.origin.y = origin.y;
    ray.origin.z = origin.z;
    ray.dir.x = direction.x;
    ray.dir.y = direction.y;
    ray.dir.z = direction.z;
    const result = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, groups, excludeCollider, excludeBody);
    if (!result) return null;
    const toi = result.timeOfImpact;
    const hit = this.hit;
    hit.distance = toi;
    hit.point.x = origin.x + direction.x * toi;
    hit.point.y = origin.y + direction.y * toi;
    hit.point.z = origin.z + direction.z * toi;
    hit.normal.x = result.normal.x;
    hit.normal.y = result.normal.y;
    hit.normal.z = result.normal.z;
    hit.collider = result.collider;
    hit.info = this.infos.get(result.collider.handle);
    return hit;
  }

  /** Cria um corpo fixo com colisores estáticos. */
  createFixedBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(this.R.RigidBodyDesc.fixed());
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.infos.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
