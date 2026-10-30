/**
 * Tipos de configuração dos veículos.
 * Todos os parâmetros físicos ficam centralizados por veículo (nada de números mágicos espalhados).
 * `resolvePhysics` converte a especificação "de designer" em constantes prontas para a simulação.
 */
import { GRAVITY } from '../utils/math';

export type DriveType = 'FWD' | 'RWD' | 'AWD';
export type VehicleCategory = 'street' | 'sport' | 'gt' | 'super' | 'electric';
export type Vec3Tuple = [number, number, number];

export interface ChassisSpec {
  /** Massa total (kg). */
  mass: number;
  /** Meias dimensões da caixa de colisão (x = meia largura, y = meia altura, z = meio comprimento). */
  halfExtents: Vec3Tuple;
  /** Fração do peso no eixo dianteiro (0..1). Define a posição longitudinal do centro de massa. */
  weightDistributionFront: number;
  /** Altura do centro de massa relativa ao centro da caixa de colisão (negativo = mais baixo). */
  centerOfMassHeight: number;
  /** Multiplicadores do tensor de inércia (x = arfagem, y = guinada, z = rolagem). */
  inertiaScale: Vec3Tuple;
  /** Arrasto aerodinâmico k (N por (m/s)²). Se omitido, é calculado a partir da potência e da velocidade máxima. */
  dragCoefficient?: number;
  /** Downforce (N por (m/s)²). */
  downforce: number;
  /** Altura de aplicação das forças dos pneus (0 = no contato, 1 = altura do centro de massa). Reduz capotamentos. */
  tireForceHeight: number;
}

export interface WheelSpec {
  radius: number;
  width: number;
  /** Posição longitudinal do eixo dianteiro (z, metros, relativo ao centro da caixa). */
  frontAxle: number;
  /** Posição longitudinal do eixo traseiro (z negativo). */
  rearAxle: number;
  /** Bitola dianteira (distância entre centros das rodas, m). */
  frontTrack: number;
  rearTrack: number;
  /** Altura (y) onde começa o curso da suspensão, relativa ao centro da caixa. */
  mountHeight: number;
}

export interface SuspensionSpec {
  /** Comprimento da mola em repouso (m). */
  restLength: number;
  /** Curso máximo de compressão antes do batente (m). */
  travel: number;
  /** Frequência natural (Hz) — define a rigidez a partir da massa sobre cada roda. */
  frequency: number;
  /** Razão de amortecimento (0.2 = macio, 0.7 = firme). */
  dampingRatio: number;
  /** Barra estabilizadora (N/m de diferença de compressão por eixo). */
  antiRoll: number;
}

export interface EngineSpec {
  maxPowerKw: number;
  maxTorqueNm: number;
  idleRpm: number;
  redlineRpm: number;
  limiterRpm: number;
  /** Curva de torque normalizada: [rpm / limiter, torque / máximo]. */
  torqueCurve: Array<[number, number]>;
  /** Freio-motor (N·m na rotação máxima com acelerador solto). */
  engineBraking: number;
  /** Resposta do acelerador (1/s): quanto maior, mais imediata. */
  throttleResponse: number;
  electric: boolean;
  cylinders: number;
}

export interface TransmissionSpec {
  gearRatios: number[];
  reverseRatio: number;
  /** Relação final. Se omitida, é calculada para atingir a velocidade máxima na última marcha. */
  finalDrive?: number;
  shiftTime: number;
  /** Rotação de troca para cima (fração da linha vermelha). */
  upshiftRpm: number;
  /** Rotação de redução (fração da linha vermelha). */
  downshiftRpm: number;
  efficiency: number;
}

export interface TireSpec {
  /** Coeficiente de atrito de pico (aderência). */
  grip: number;
  /** Multiplicador de aderência do eixo traseiro (estabilidade). */
  rearGripMultiplier: number;
  /** Multiplicador da aderência longitudinal (tração/frenagem). */
  longitudinalGrip: number;
  /** Ângulo de deriva de pico (graus). */
  peakSlipAngleDeg: number;
  /** Aderência remanescente quando o pneu desliza totalmente (fração do pico). */
  slideGripRatio: number;
  /** Aderência lateral traseira com freio de mão total (capacidade de drift). */
  handbrakeGripRatio: number;
  /** Resistência ao rolamento base. */
  rollingResistance: number;
}

export interface SteeringSpec {
  maxAngleDeg: number;
  /** Ângulo máximo em alta velocidade. */
  highSpeedAngleDeg: number;
  /** Velocidade (km/h) em que a redução do ângulo é completa. */
  reductionSpeedKmh: number;
  /** Fator de geometria Ackermann (0..1). */
  ackermann: number;
  /** Velocidade de giro do volante com entrada digital (1/s). */
  steerRate: number;
  /** Velocidade de retorno ao centro (1/s). */
  returnRate: number;
}

export interface BrakeSpec {
  /** Força máxima de frenagem total (N). */
  maxForce: number;
  /** Fração da frenagem no eixo dianteiro. */
  frontBias: number;
  /** Força do freio de mão (N, eixo traseiro). */
  handbrakeForce: number;
}

export interface HandlingSpec {
  /** Estabilidade direcional (amortecimento de guinada), 0..1. */
  stability: number;
  /** Ajuda ao contraesterço durante drift, 0..1. */
  driftAssist: number;
  /** Controle no ar (nivelamento), 0..1. */
  airControl: number;
}

export interface VehiclePhysicsSpec {
  drive: DriveType;
  /** Fração do torque enviada à traseira em veículos AWD. */
  awdRearSplit: number;
  topSpeedKmh: number;
  chassis: ChassisSpec;
  wheels: WheelSpec;
  suspension: SuspensionSpec;
  engine: EngineSpec;
  transmission: TransmissionSpec;
  tires: TireSpec;
  steering: SteeringSpec;
  brakes: BrakeSpec;
  handling: HandlingSpec;
}

export interface PaintOption {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  price: number;
}

export type BodyStyle = 'hatch' | 'sedan' | 'coupe' | 'muscle' | 'super';
export type SpoilerStyle = 'none' | 'lip' | 'ducktail' | 'wing';

/** Parâmetros do modelo procedural provisório (substituível por GLB). */
export interface ProceduralBodySpec {
  style: BodyStyle;
  length: number;
  width: number;
  /** Altura do topo da carroceria (linha de cintura) acima do solo. */
  beltHeight: number;
  /** Altura do teto acima do solo. */
  roofHeight: number;
  /** Altura da base da carroceria acima do solo. */
  groundClearance: number;
  /** Posição (z) do pé do para-brisa. */
  windshieldBase: number;
  /** Posição (z) do topo do para-brisa. */
  windshieldTop: number;
  /** Posição (z) do fim do teto. */
  roofEnd: number;
  /** Posição (z) da base do vidro traseiro. */
  rearGlassBase: number;
  /** Largura relativa da cabine em relação à carroceria. */
  cabinWidthRatio: number;
  spoiler: SpoilerStyle;
  /** Cor dos aros. */
  rimColor: string;
  rimStyle: 'spoke5' | 'mesh' | 'turbine';
}

export interface GltfModelSpec {
  /** Caminho relativo a /assets/vehicles. */
  url: string;
  scale: number;
  rotationY: number;
  offset: Vec3Tuple;
  /** Nomes esperados das rodas no arquivo (opcional). */
  wheelNodeNames?: { fl: string; fr: string; rl: string; rr: string };
  /** Materiais que recebem a cor de pintura selecionada. */
  paintMaterialNames?: string[];
}

export interface VehicleVisualSpec {
  procedural: ProceduralBodySpec;
  gltf?: GltfModelSpec;
  headlights: Vec3Tuple[];
  taillights: Vec3Tuple[];
  paints: PaintOption[];
  defaultPaint: string;
}

export type EngineSoundProfile = 'i4' | 'v6' | 'v8' | 'flat6' | 'v10' | 'electric';

export interface VehicleDefinition {
  id: string;
  name: string;
  manufacturer: string;
  category: VehicleCategory;
  description: string;
  price: number;
  unlock: { starter?: boolean; level?: number; chapter?: string };
  /** Indica que o modelo visual é provisório (procedural), não um asset de produção. */
  provisionalModel: boolean;
  physics: VehiclePhysicsSpec;
  visual: VehicleVisualSpec;
  audio: { profile: EngineSoundProfile };
}

/** Constantes derivadas, calculadas uma vez por veículo. */
export interface ResolvedPhysics {
  spec: VehiclePhysicsSpec;
  mass: number;
  topSpeed: number;
  wheelBase: number;
  centerOfMass: Vec3Tuple;
  principalInertia: Vec3Tuple;
  frontStiffness: number;
  rearStiffness: number;
  frontDamping: number;
  rearDamping: number;
  finalDrive: number;
  dragCoefficient: number;
  peakSlipAngle: number;
  maxSteer: number;
  highSpeedSteer: number;
  steerReductionSpeed: number;
  staticLoadFront: number;
  staticLoadRear: number;
  /** Altura do centro da caixa acima do solo em equilíbrio estático. */
  rideHeight: number;
}

const resolvedCache = new WeakMap<VehiclePhysicsSpec, ResolvedPhysics>();

export function resolvePhysics(spec: VehiclePhysicsSpec): ResolvedPhysics {
  const cached = resolvedCache.get(spec);
  if (cached) return cached;

  const { chassis, wheels, suspension, engine, transmission, tires } = spec;
  const mass = chassis.mass;
  const topSpeed = spec.topSpeedKmh / 3.6;
  const wheelBase = wheels.frontAxle - wheels.rearAxle;
  const f = chassis.weightDistributionFront;
  const comZ = wheels.rearAxle + f * wheelBase;

  // Inércia de uma caixa sólida, ajustada pelos multiplicadores de dirigibilidade.
  const [hx, hy, hz] = chassis.halfExtents;
  const w = hx * 2;
  const h = hy * 2;
  const l = hz * 2;
  const ix = (mass / 12) * (h * h + l * l) * chassis.inertiaScale[0];
  const iy = (mass / 12) * (w * w + l * l) * chassis.inertiaScale[1];
  const iz = (mass / 12) * (w * w + h * h) * chassis.inertiaScale[2];

  const cornerFront = (mass * f) / 2;
  const cornerRear = (mass * (1 - f)) / 2;
  const omega = 2 * Math.PI * suspension.frequency;
  const frontStiffness = cornerFront * omega * omega;
  const rearStiffness = cornerRear * omega * omega;
  const frontDamping = 2 * suspension.dampingRatio * Math.sqrt(frontStiffness * cornerFront);
  const rearDamping = 2 * suspension.dampingRatio * Math.sqrt(rearStiffness * cornerRear);

  const topRatio = transmission.gearRatios[transmission.gearRatios.length - 1];
  const finalDrive =
    transmission.finalDrive ??
    (engine.limiterRpm * 0.97 * ((2 * Math.PI) / 60)) / (((topSpeed * 1.05) / wheels.radius) * topRatio);

  const wheelPower = engine.maxPowerKw * 1000 * transmission.efficiency;
  const rolling = tires.rollingResistance * mass * GRAVITY;
  const derivedDrag = (wheelPower / topSpeed - rolling) / (topSpeed * topSpeed);
  const dragCoefficient = chassis.dragCoefficient ?? Math.max(0.15, derivedDrag);

  const staticLoadFront = cornerFront * GRAVITY;
  const staticLoadRear = cornerRear * GRAVITY;
  const sagFront = staticLoadFront / frontStiffness;
  const rideHeight = -wheels.mountHeight + (suspension.restLength - sagFront) + wheels.radius;

  const resolved: ResolvedPhysics = {
    spec,
    mass,
    topSpeed,
    wheelBase,
    centerOfMass: [0, chassis.centerOfMassHeight, comZ],
    principalInertia: [ix, iy, iz],
    frontStiffness,
    rearStiffness,
    frontDamping,
    rearDamping,
    finalDrive,
    dragCoefficient,
    peakSlipAngle: (tires.peakSlipAngleDeg * Math.PI) / 180,
    maxSteer: (spec.steering.maxAngleDeg * Math.PI) / 180,
    highSpeedSteer: (spec.steering.highSpeedAngleDeg * Math.PI) / 180,
    steerReductionSpeed: spec.steering.reductionSpeedKmh / 3.6,
    staticLoadFront,
    staticLoadRear,
    rideHeight,
  };
  resolvedCache.set(spec, resolved);
  return resolved;
}
