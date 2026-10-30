/**
 * Controlador físico próprio de veículo sobre um corpo rígido do Rapier ("raycast vehicle").
 *
 * - Cada roda lança um raio contra o solo (apenas camada GROUND) para obter contato real.
 * - Suspensão mola-amortecedor por roda + barra estabilizadora + batente.
 * - Pneus com modelo de deriva (curva saturada estilo Pacejka simplificada) e elipse de atrito
 *   combinando forças longitudinais (tração/frenagem) e laterais.
 * - Freio de mão reduz a aderência traseira e trava as rodas → drift físico (não é rotação visual).
 * - Arrasto aerodinâmico, downforce, resistência ao rolamento e arrasto de superfície.
 * - Assistências configuráveis: controle de estabilidade, tração, ABS e nivelamento no ar.
 *
 * Toda a simulação ocorre em passo fixo; nenhum código de renderização vive aqui.
 */
import { Quaternion, Vector3 } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CollisionGroups, QueryGroups } from '../physics/CollisionLayers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { SURFACES, type SurfaceType } from '../physics/Surfaces';
import { clamp, clamp01, GRAVITY, lerp, smoothstep } from '../utils/math';
import { Drivetrain } from './Drivetrain';
import { resolvePhysics, type ResolvedPhysics, type VehicleDefinition } from './VehicleConfig';

export interface VehicleControls {
  /** 0..1 */
  throttle: number;
  /** 0..1 (também comanda a ré quando parado) */
  brake: number;
  /** -1 (esquerda) .. +1 (direita) */
  steer: number;
  /** 0..1 */
  handbrake: number;
}

export interface WheelState {
  readonly index: number;
  readonly isFront: boolean;
  readonly isLeft: boolean;
  readonly driven: boolean;
  readonly driveShare: number;
  /** Ponto de fixação da suspensão no referencial do chassi. */
  readonly localMount: Vector3;
  readonly radius: number;
  readonly width: number;
  grounded: boolean;
  suspensionLength: number;
  prevSuspensionLength: number;
  compression: number;
  load: number;
  steerAngle: number;
  spinAngle: number;
  angularVelocity: number;
  surface: SurfaceType;
  readonly contactPoint: Vector3;
  readonly contactNormal: Vector3;
  slipAngle: number;
  /** Velocidade de deslizamento lateral no contato (m/s). */
  lateralSlip: number;
  /** Excesso de tração/frenagem sobre a aderência disponível (0..). */
  longitudinalSlip: number;
  /** Intensidade de derrapagem para marcas, fumaça e som (0..1). */
  skid: number;
  locked: boolean;
}

/** Curva lateral normalizada: sobe até 1 no pico e cai até `slideRatio` em deriva excessiva. */
export function lateralTireCurve(normalizedSlip: number, slideRatio: number): number {
  const ax = Math.abs(normalizedSlip);
  let y: number;
  if (ax <= 1) {
    y = Math.sin((ax * Math.PI) / 2);
  } else {
    y = 1 - (1 - slideRatio) * smoothstep(1, 3.2, ax);
  }
  return normalizedSlip < 0 ? -y : y;
}

const LOW_SPEED_REFERENCE = 3; // m/s — evita instabilidade do ângulo de deriva perto de zero
const MAX_ANGULAR_SPEED = 14; // rad/s
const MAX_LINEAR_SPEED = 160; // m/s — acima disso consideramos falha numérica

export class VehiclePhysics {
  readonly id: string;
  readonly definition: VehicleDefinition;
  readonly phys: ResolvedPhysics;
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];
  readonly drivetrain: Drivetrain;
  readonly wheels: WheelState[];
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

  // Estado lido do corpo rígido (atualizado a cada passo).
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  readonly up = new Vector3(0, 1, 0);
  readonly right = new Vector3(-1, 0, 0);
  readonly centerOfMass = new Vector3();
  // Estado anterior para interpolação visual.
  readonly prevPosition = new Vector3();
  readonly prevQuaternion = new Quaternion();

  forwardSpeed = 0;
  lateralSpeed = 0;
  speed = 0;
  yawRate = 0;
  /** Ângulo entre a direção do carro e a direção do movimento (rad, com sinal). */
  driftAngle = 0;
  steerAngle = 0;
  groundedWheels = 0;
  trackWheels = 0;
  airTime = 0;
  upsideDownTime = 0;
  /** Assistência geral (0..1), vinda das configurações. */
  assistLevel = 0.5;
  /** Desativa a física de entrada (ex.: durante a contagem regressiva os carros ficam freados). */
  inputLocked = false;
  ghost = false;
  /** Sinaliza estado inválido (NaN, velocidade absurda) para recuperação. */
  invalidState = false;
  /** Aceleração longitudinal/lateral filtradas (para inclinação visual da carroceria). */
  longitudinalAccel = 0;
  lateralAccel = 0;

  private readonly world: PhysicsWorld;
  private readonly localCom: Vector3;
  private readonly prevVelocity = new Vector3();

  // Vetores temporários reutilizados (evitam alocações por passo).
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpC = new Vector3();
  private readonly mountWorld = new Vector3();
  private readonly wheelForward = new Vector3();
  private readonly wheelRight = new Vector3();
  private readonly pointVel = new Vector3();
  private readonly rel = new Vector3();
  private readonly downDir = { x: 0, y: -1, z: 0 };
  private readonly impulse = { x: 0, y: 0, z: 0 };
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly suspensionForces = [0, 0, 0, 0];

  constructor(world: PhysicsWorld, definition: VehicleDefinition, position: Vector3, quaternion: Quaternion, id: string) {
    this.world = world;
    this.id = id;
    this.definition = definition;
    this.phys = resolvePhysics(definition.physics);
    this.drivetrain = new Drivetrain(this.phys);
    const R = world.R;
    const spec = this.phys.spec;

    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setCcdEnabled(true)
      .setAngularDamping(0.2)
      .setLinearDamping(0)
      .setCanSleep(false);
    this.body = world.world.createRigidBody(bodyDesc);

    const [hx, hy, hz] = spec.chassis.halfExtents;
    const com = this.phys.centerOfMass;
    const inertia = this.phys.principalInertia;
    this.localCom = new Vector3(com[0], com[1], com[2]);

    const border = 0.06;
    const mainDesc = R.ColliderDesc.roundCuboid(hx - border, hy - border, hz - border, border)
      .setMassProperties(
        this.phys.mass,
        { x: com[0], y: com[1], z: com[2] },
        { x: inertia[0], y: inertia[1], z: inertia[2] },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setFriction(0.3)
      .setRestitution(0.12)
      .setCollisionGroups(CollisionGroups.car)
      .setSolverGroups(CollisionGroups.car)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(this.phys.mass * 1.5);
    const main = world.world.createCollider(mainDesc, this.body);
    world.register(main, { kind: 'car', ownerId: id, mass: this.phys.mass });
    this.colliders.push(main);

    // Cabine: forma adicional sem massa, para colisões mais fiéis ao formato do carro.
    const cabinHalf: [number, number, number] = [hx * 0.78, hy * 0.55, hz * 0.42];
    const cabinDesc = R.ColliderDesc.roundCuboid(cabinHalf[0] - border, cabinHalf[1] - border, cabinHalf[2] - border, border)
      .setTranslation(0, hy + cabinHalf[1] - 0.04, -hz * 0.1)
      .setDensity(0)
      .setFriction(0.3)
      .setRestitution(0.1)
      .setCollisionGroups(CollisionGroups.car)
      .setSolverGroups(CollisionGroups.car)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(this.phys.mass * 1.5);
    const cabin = world.world.createCollider(cabinDesc, this.body);
    world.register(cabin, { kind: 'car', ownerId: id, mass: this.phys.mass });
    this.colliders.push(cabin);

    const w = spec.wheels;
    const drive = spec.drive;
    const rearSplit = drive === 'AWD' ? spec.awdRearSplit : drive === 'RWD' ? 1 : 0;
    const layout = [
      { x: w.frontTrack / 2, z: w.frontAxle, front: true, left: true },
      { x: -w.frontTrack / 2, z: w.frontAxle, front: true, left: false },
      { x: w.rearTrack / 2, z: w.rearAxle, front: false, left: true },
      { x: -w.rearTrack / 2, z: w.rearAxle, front: false, left: false },
    ];
    this.wheels = layout.map((entry, index) => {
      const share = entry.front ? (1 - rearSplit) / 2 : rearSplit / 2;
      return {
        index,
        isFront: entry.front,
        isLeft: entry.left,
        driven: share > 0,
        driveShare: share,
        localMount: new Vector3(entry.x, w.mountHeight, entry.z),
        radius: w.radius,
        width: w.width,
        grounded: false,
        suspensionLength: spec.suspension.restLength,
        prevSuspensionLength: spec.suspension.restLength,
        compression: 0,
        load: 0,
        steerAngle: 0,
        spinAngle: 0,
        angularVelocity: 0,
        surface: 'asphalt' as SurfaceType,
        contactPoint: new Vector3(),
        contactNormal: new Vector3(0, 1, 0),
        slipAngle: 0,
        lateralSlip: 0,
        longitudinalSlip: 0,
        skid: 0,
        locked: false,
      };
    });

    this.readState();
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  /** Lê posição, rotação e velocidades do corpo rígido para os vetores em cache. */
  readState(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    const a = this.body.angvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
    this.angularVelocity.set(a.x, a.y, a.z);
    this.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.right.crossVectors(this.forward, this.up);
    this.centerOfMass.copy(this.localCom).applyQuaternion(this.quaternion).add(this.position);

    this.forwardSpeed = this.velocity.dot(this.forward);
    this.lateralSpeed = this.velocity.dot(this.right);
    this.speed = this.velocity.length();
    this.yawRate = this.angularVelocity.dot(this.up);
    const planarSpeed = Math.hypot(this.forwardSpeed, this.lateralSpeed);
    this.driftAngle = planarSpeed > 1.5 ? Math.atan2(this.lateralSpeed, Math.abs(this.forwardSpeed)) : 0;

    this.invalidState =
      !Number.isFinite(this.position.x + this.position.y + this.position.z) ||
      !Number.isFinite(this.speed) ||
      this.speed > MAX_LINEAR_SPEED;
  }

  /** Guarda o estado atual como "anterior" (chamar antes de cada passo físico). */
  snapshot(): void {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.prevVelocity.copy(this.velocity);
  }

  /** Calcula e aplica todas as forças do veículo para um passo `dt`. Chamar antes de world.step(). */
  step(dt: number): void {
    this.readState();
    const spec = this.phys.spec;
    const controls = this.controls;
    const locked = this.inputLocked;

    // Durante a contagem regressiva o motor pode girar, mas o carro permanece freado.
    const throttle = clamp01(controls.throttle);
    const brakeInput = locked ? 0 : clamp01(controls.brake);
    const handbrake = locked ? 1 : clamp01(controls.handbrake);
    const steerInput = clamp(controls.steer, -1, 1);
    const assist = clamp01(this.assistLevel);

    // --- Direção dependente da velocidade + Ackermann ---
    const speedAbs = Math.abs(this.forwardSpeed);
    const reduction = smoothstep(0, this.phys.steerReductionSpeed, speedAbs);
    const maxSteerNow = lerp(this.phys.maxSteer, this.phys.highSpeedSteer, reduction);
    const baseAngle = -steerInput * maxSteerNow; // ângulo positivo = esquerda (rotação em +Y)
    this.steerAngle = baseAngle;
    this.applyAckermann(baseAngle);

    // --- Trem de força ---
    let drivenGrounded = 0;
    for (const wheel of this.wheels) if (wheel.driven && wheel.grounded) drivenGrounded++;
    const drive = this.drivetrain.update(dt, { throttle, brake: brakeInput }, this.forwardSpeed, this.forwardSpeed, drivenGrounded > 0);
    const driveForceTotal = locked ? 0 : drive.driveForce;
    const brake = locked ? 1 : drive.brake;

    // --- Suspensão ---
    this.updateSuspension(dt);

    // --- Pneus ---
    this.applyTireForces(dt, driveForceTotal, brake, handbrake, assist);

    // --- Aerodinâmica ---
    const k = this.phys.dragCoefficient;
    const v = this.velocity;
    const speed = this.speed;
    const downforce = spec.chassis.downforce * this.forwardSpeed * this.forwardSpeed;
    this.impulse.x = (-k * speed * v.x - this.up.x * downforce) * dt;
    this.impulse.y = (-k * speed * v.y - this.up.y * downforce) * dt;
    this.impulse.z = (-k * speed * v.z - this.up.z * downforce) * dt;
    this.body.applyImpulse(this.impulse, true);

    // --- Assistências e estabilidade ---
    this.applyStability(dt, handbrake, assist);
  }

  private applyAckermann(baseAngle: number): void {
    const spec = this.phys.spec;
    const factor = spec.steering.ackermann;
    const wheelBase = this.phys.wheelBase;
    const halfTrack = spec.wheels.frontTrack / 2;
    const absAngle = Math.abs(baseAngle);
    let inner = absAngle;
    let outer = absAngle;
    if (absAngle > 1e-4) {
      const radius = wheelBase / Math.tan(absAngle);
      inner = lerp(absAngle, Math.atan(wheelBase / Math.max(0.5, radius - halfTrack)), factor);
      outer = lerp(absAngle, Math.atan(wheelBase / (radius + halfTrack)), factor);
    }
    const turningLeft = baseAngle > 0;
    for (const wheel of this.wheels) {
      if (!wheel.isFront) {
        wheel.steerAngle = 0;
        continue;
      }
      const isInner = wheel.isLeft === turningLeft;
      wheel.steerAngle = Math.sign(baseAngle) * (isInner ? inner : outer);
    }
  }

  private updateSuspension(dt: number): void {
    const spec = this.phys.spec;
    const s = spec.suspension;
    const rayLength = s.restLength + spec.wheels.radius;
    this.downDir.x = -this.up.x;
    this.downDir.y = -this.up.y;
    this.downDir.z = -this.up.z;

    let grounded = 0;
    let onTrack = 0;
    for (const wheel of this.wheels) {
      this.mountWorld.copy(wheel.localMount).applyQuaternion(this.quaternion).add(this.position);
      const hit = this.world.castRay(this.mountWorld, this.downDir, rayLength, QueryGroups.wheel, undefined, this.body);
      wheel.prevSuspensionLength = wheel.suspensionLength;
      const stiffness = wheel.isFront ? this.phys.frontStiffness : this.phys.rearStiffness;
      const damping = wheel.isFront ? this.phys.frontDamping : this.phys.rearDamping;

      if (hit) {
        wheel.grounded = true;
        grounded++;
        const length = hit.distance - wheel.radius;
        wheel.suspensionLength = Math.max(length, s.restLength - s.travel * 1.25);
        wheel.contactPoint.set(hit.point.x, hit.point.y, hit.point.z);
        wheel.contactNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        wheel.surface = hit.info?.surface ?? 'grass';
        if (SURFACES[wheel.surface].isTrack) onTrack++;

        const compression = s.restLength - length;
        wheel.compression = clamp01(compression / s.travel);
        const compressionVelocity = (wheel.prevSuspensionLength - wheel.suspensionLength) / dt;
        let force = stiffness * compression + damping * compressionVelocity;
        if (compression > s.travel) {
          // Batente: mola muito rígida para evitar que o chassi atravesse o solo.
          force += stiffness * 8 * (compression - s.travel);
        }
        this.suspensionForces[wheel.index] = Math.max(0, force);
      } else {
        wheel.grounded = false;
        wheel.suspensionLength = s.restLength;
        wheel.compression = 0;
        this.suspensionForces[wheel.index] = 0;
        wheel.contactPoint.copy(this.mountWorld).addScaledVector(this.up, -rayLength);
        wheel.contactNormal.copy(this.up);
      }
    }

    // Barra estabilizadora por eixo.
    for (let axle = 0; axle < 2; axle++) {
      const left = this.wheels[axle * 2];
      const right = this.wheels[axle * 2 + 1];
      if (!left.grounded || !right.grounded) continue;
      const diff = (s.restLength - left.suspensionLength) - (s.restLength - right.suspensionLength);
      const antiRoll = s.antiRoll * diff;
      this.suspensionForces[left.index] = Math.max(0, this.suspensionForces[left.index] + antiRoll);
      this.suspensionForces[right.index] = Math.max(0, this.suspensionForces[right.index] - antiRoll);
    }

    for (const wheel of this.wheels) {
      const force = this.suspensionForces[wheel.index];
      const staticLoad = wheel.isFront ? this.phys.staticLoadFront : this.phys.staticLoadRear;
      wheel.load = Math.min(force, staticLoad * 3.2);
      if (!wheel.grounded || force <= 0) continue;
      this.mountWorld.copy(wheel.localMount).applyQuaternion(this.quaternion).add(this.position);
      const n = wheel.contactNormal;
      this.impulse.x = n.x * force * dt;
      this.impulse.y = n.y * force * dt;
      this.impulse.z = n.z * force * dt;
      this.point.x = this.mountWorld.x;
      this.point.y = this.mountWorld.y;
      this.point.z = this.mountWorld.z;
      this.body.applyImpulseAtPoint(this.impulse, this.point, true);
    }

    this.groundedWheels = grounded;
    this.trackWheels = onTrack;
  }

  private applyTireForces(dt: number, driveForceTotal: number, brake: number, handbrake: number, assist: number): void {
    const spec = this.phys.spec;
    const tires = spec.tires;
    const brakes = spec.brakes;
    const cornerMass = this.phys.mass / 4;

    // Redistribui a força motriz entre as rodas motrizes com contato (diferencial autoblocante simplificado).
    let groundedShare = 0;
    for (const wheel of this.wheels) if (wheel.driven && wheel.grounded) groundedShare += wheel.driveShare;

    for (const wheel of this.wheels) {
      wheel.locked = false;
      if (!wheel.grounded || wheel.load <= 0) {
        wheel.slipAngle = 0;
        wheel.lateralSlip = 0;
        wheel.longitudinalSlip = 0;
        wheel.skid = 0;
        // Roda no ar: gira com o acelerador (motrizes) ou desacelera lentamente.
        if (wheel.driven) {
          wheel.angularVelocity = lerp(wheel.angularVelocity, (this.drivetrain.throttle * 60) * Math.sign(this.drivetrain.gear), 0.05);
        } else {
          wheel.angularVelocity *= 0.995;
        }
        wheel.spinAngle += wheel.angularVelocity * dt;
        continue;
      }

      const surface = SURFACES[wheel.surface];
      const n = wheel.contactNormal;

      // Direção do pneu projetada no plano do solo.
      this.wheelForward.copy(this.forward).applyAxisAngle(this.up, wheel.steerAngle);
      this.wheelForward.addScaledVector(n, -this.wheelForward.dot(n)).normalize();
      this.wheelRight.crossVectors(this.wheelForward, n).normalize();

      // Velocidade do ponto de contato: v + w x r.
      this.rel.subVectors(wheel.contactPoint, this.centerOfMass);
      this.pointVel.crossVectors(this.angularVelocity, this.rel).add(this.velocity);
      const vLong = this.pointVel.dot(this.wheelForward);
      const vLat = this.pointVel.dot(this.wheelRight);

      const isRear = !wheel.isFront;
      const handbrakeOnWheel = isRear ? handbrake : 0;
      const baseGrip = tires.grip * surface.grip * (isRear ? tires.rearGripMultiplier : 1);
      const latGrip = baseGrip * lerp(1, tires.handbrakeGripRatio, handbrakeOnWheel);
      const longGrip = baseGrip * tires.longitudinalGrip;
      const maxLat = latGrip * wheel.load;
      const maxLong = longGrip * wheel.load;

      // --- Força longitudinal ---
      let fLong = 0;
      if (wheel.driven && groundedShare > 0) {
        let drive = (driveForceTotal * wheel.driveShare) / groundedShare;
        // Controle de tração: limita a força ao que o pneu consegue transmitir.
        const tcLimit = maxLong * lerp(1.8, 1.0, assist);
        if (Math.abs(drive) > tcLimit) drive = Math.sign(drive) * tcLimit;
        fLong += drive;
      }
      const stopForce = (Math.abs(vLong) * cornerMass) / dt;
      // Resistência ao rolamento + arrasto de superfície.
      const rolling = (tires.rollingResistance + surface.rollingResistance) * wheel.load + surface.drag * 0.12 * Math.abs(vLong) * cornerMass;
      fLong -= Math.sign(vLong) * Math.min(rolling, stopForce);
      // Freios (com ABS proporcional à assistência).
      let brakeForce = brake * brakes.maxForce * (wheel.isFront ? brakes.frontBias : 1 - brakes.frontBias) * 0.5;
      const absLimit = maxLong * lerp(1.6, 0.97, assist);
      if (brakeForce > absLimit) brakeForce = absLimit;
      brakeForce += handbrakeOnWheel * brakes.handbrakeForce * 0.5;
      if (brakeForce > 0) {
        fLong -= Math.sign(vLong) * Math.min(brakeForce, stopForce);
        if (brakeForce > maxLong && Math.abs(vLong) > 1) wheel.locked = true;
      }

      // --- Força lateral (curva de deriva) ---
      const vRef = Math.max(Math.abs(vLong), LOW_SPEED_REFERENCE);
      const slipAngle = Math.atan2(vLat, vRef);
      const latCoeff = lateralTireCurve(slipAngle / this.phys.peakSlipAngle, tires.slideGripRatio);
      let fLat = -latCoeff * maxLat;

      // --- Elipse de atrito ---
      const ratio = Math.sqrt((fLong / Math.max(maxLong, 1)) ** 2 + (fLat / Math.max(maxLat, 1)) ** 2);
      wheel.longitudinalSlip = 0;
      if (ratio > 1) {
        const scale = 1 / ratio;
        wheel.longitudinalSlip = Math.max(0, Math.abs(fLong) / Math.max(maxLong, 1) - 1);
        fLong *= scale;
        fLat *= scale;
      }

      wheel.slipAngle = slipAngle;
      wheel.lateralSlip = Math.abs(vLat);
      const lateralSkid = clamp01((Math.abs(vLat) - 1.2) / 5) * (Math.abs(slipAngle) > this.phys.peakSlipAngle * 0.85 ? 1 : 0.25);
      const spinSkid = clamp01(wheel.longitudinalSlip * 1.5) * clamp01(Math.abs(this.drivetrain.throttle));
      const lockSkid = wheel.locked ? clamp01(Math.abs(vLong) / 8) : 0;
      wheel.skid = Math.max(lateralSkid, spinSkid, lockSkid);

      // Ponto de aplicação elevado em direção ao centro de massa (reduz capotamentos).
      const comHeight = this.tmpA.subVectors(this.centerOfMass, wheel.contactPoint).dot(n);
      this.tmpB.copy(wheel.contactPoint).addScaledVector(n, comHeight * spec.chassis.tireForceHeight);

      this.impulse.x = (this.wheelForward.x * fLong + this.wheelRight.x * fLat) * dt;
      this.impulse.y = (this.wheelForward.y * fLong + this.wheelRight.y * fLat) * dt;
      this.impulse.z = (this.wheelForward.z * fLong + this.wheelRight.z * fLat) * dt;
      this.point.x = this.tmpB.x;
      this.point.y = this.tmpB.y;
      this.point.z = this.tmpB.z;
      this.body.applyImpulseAtPoint(this.impulse, this.point, true);

      // Rotação visual da roda.
      if (wheel.locked || (isRear && handbrake > 0.5)) {
        wheel.angularVelocity = 0;
      } else {
        const spin = wheel.driven ? wheel.longitudinalSlip * 30 * Math.sign(this.drivetrain.gear) : 0;
        wheel.angularVelocity = vLong / wheel.radius + spin;
      }
      wheel.spinAngle += wheel.angularVelocity * dt;
    }
  }

  private applyStability(dt: number, handbrake: number, assist: number): void {
    const handling = this.phys.spec.handling;
    const inertia = this.phys.principalInertia;
    const speedAbs = Math.abs(this.forwardSpeed);

    if (this.groundedWheels >= 3) {
      this.airTime = 0;
      if (speedAbs > 2) {
        // Controle de estabilidade: limita guinada excessiva em relação ao comando de direção.
        const targetYaw = (this.forwardSpeed * Math.tan(this.steerAngle)) / this.phys.wheelBase;
        const error = this.yawRate - targetYaw;
        const margin = lerp(0.6, 0.12, assist);
        const excess = Math.sign(error) * Math.max(0, Math.abs(error) - margin);
        const gain = handling.stability * lerp(0.35, 1, assist) * (1 - 0.75 * handbrake) * 5;
        const torque = -excess * gain * inertia[1];
        this.impulse.x = this.up.x * torque * dt;
        this.impulse.y = this.up.y * torque * dt;
        this.impulse.z = this.up.z * torque * dt;
        this.body.applyTorqueImpulse(this.impulse, true);
      }
    } else if (this.groundedWheels === 0) {
      this.airTime += dt;
      // Nivelamento suave no ar para pousos mais previsíveis.
      const axis = this.tmpC.crossVectors(this.up, this.tmpA.set(0, 1, 0));
      const strength = handling.airControl * 2.2;
      const damping = handling.airControl * 1.2;
      this.impulse.x = (axis.x * strength * inertia[0] - this.angularVelocity.x * damping * inertia[0]) * dt;
      this.impulse.y = 0;
      this.impulse.z = (axis.z * strength * inertia[2] - this.angularVelocity.z * damping * inertia[2]) * dt;
      this.body.applyTorqueImpulse(this.impulse, true);
    }

    // Detecta carro capotado (usado pela recuperação automática).
    if (this.up.y < 0.25 && speedAbs < 3) this.upsideDownTime += dt;
    else this.upsideDownTime = 0;

    // Limite de rotação para evitar "explosões" numéricas.
    const w = this.angularVelocity.length();
    if (w > MAX_ANGULAR_SPEED) {
      const s = MAX_ANGULAR_SPEED / w;
      this.body.setAngvel({ x: this.angularVelocity.x * s, y: this.angularVelocity.y * s, z: this.angularVelocity.z * s }, true);
    }
  }

  /** Atualiza telemetria derivada após o passo do mundo. */
  postStep(dt: number): void {
    this.readState();
    const ax = (this.velocity.x - this.prevVelocity.x) / dt;
    const ay = (this.velocity.y - this.prevVelocity.y) / dt;
    const az = (this.velocity.z - this.prevVelocity.z) / dt;
    const longAcc = ax * this.forward.x + ay * this.forward.y + az * this.forward.z;
    const latAcc = ax * this.right.x + ay * this.right.y + az * this.right.z;
    const blend = 1 - Math.exp(-8 * dt);
    this.longitudinalAccel += (clamp(longAcc, -40, 40) - this.longitudinalAccel) * blend;
    this.lateralAccel += (clamp(latAcc, -40, 40) - this.lateralAccel) * blend;
  }

  /** Teleporta o veículo (largada, reinício ou recuperação), zerando velocidades. */
  teleport(position: Vector3, quaternion: Quaternion): void {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.drivetrain.reset();
    for (const wheel of this.wheels) {
      wheel.suspensionLength = this.phys.spec.suspension.restLength;
      wheel.prevSuspensionLength = wheel.suspensionLength;
      wheel.angularVelocity = 0;
      wheel.skid = 0;
      wheel.grounded = false;
    }
    this.airTime = 0;
    this.upsideDownTime = 0;
    this.longitudinalAccel = 0;
    this.lateralAccel = 0;
    this.readState();
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.prevVelocity.set(0, 0, 0);
  }

  /** Proteção temporária: atravessa outros carros (usada após recuperação). */
  setGhost(enabled: boolean): void {
    if (this.ghost === enabled) return;
    this.ghost = enabled;
    const groups = enabled ? CollisionGroups.carGhost : CollisionGroups.car;
    for (const collider of this.colliders) {
      collider.setCollisionGroups(groups);
      collider.setSolverGroups(groups);
    }
  }

  /** Média de derrapagem das rodas (0..1). */
  get skidAmount(): number {
    let sum = 0;
    for (const wheel of this.wheels) sum += wheel.skid;
    return sum / this.wheels.length;
  }

  get isAirborne(): boolean {
    return this.groundedWheels === 0;
  }

  /** Força de suspensão estática esperada por roda (útil em testes). */
  get expectedStaticLoad(): number {
    return (this.phys.mass * GRAVITY) / 4;
  }

  dispose(): void {
    if (this.world.isDisposed) return;
    for (const collider of this.colliders) this.world.unregister(collider);
    this.world.world.removeRigidBody(this.body);
  }
}
