/**
 * Catálogo de veículos originais (marcas e modelos fictícios).
 * Cada carro tem configuração física própria; os modelos visuais atuais são procedurais e PROVISÓRIOS.
 * Para usar um modelo GLB, preencha `visual.gltf` — a física não precisa ser alterada.
 */
import type { PaintOption, VehicleDefinition, VehiclePhysicsSpec } from './VehicleConfig';

const PAINT_LIBRARY: PaintOption[] = [
  { id: 'onyx', name: 'Preto Ônix', color: '#0d0e10', metalness: 0.6, roughness: 0.32, clearcoat: 1, price: 0 },
  { id: 'glacier', name: 'Branco Glaciar', color: '#e9ecef', metalness: 0.15, roughness: 0.38, clearcoat: 1, price: 0 },
  { id: 'titanium', name: 'Cinza Titânio', color: '#5d636b', metalness: 0.85, roughness: 0.3, clearcoat: 1, price: 600 },
  { id: 'apex-red', name: 'Vermelho Apex', color: '#b3121c', metalness: 0.55, roughness: 0.3, clearcoat: 1, price: 800 },
  { id: 'abyss', name: 'Azul Abismo', color: '#14315f', metalness: 0.75, roughness: 0.28, clearcoat: 1, price: 800 },
  { id: 'jade', name: 'Verde Jade', color: '#1e5a46', metalness: 0.7, roughness: 0.3, clearcoat: 1, price: 900 },
  { id: 'solar', name: 'Laranja Solar', color: '#d9631e', metalness: 0.45, roughness: 0.32, clearcoat: 1, price: 1000 },
  { id: 'quartz', name: 'Prata Quartzo', color: '#b9bec6', metalness: 0.95, roughness: 0.22, clearcoat: 1, price: 1200 },
];

function paints(...ids: string[]): PaintOption[] {
  return ids.map((id) => {
    const paint = PAINT_LIBRARY.find((p) => p.id === id);
    if (!paint) throw new Error(`Pintura desconhecida: ${id}`);
    return paint;
  });
}

type PhysicsOverrides = {
  [K in keyof VehiclePhysicsSpec]?: VehiclePhysicsSpec[K] extends object ? Partial<VehiclePhysicsSpec[K]> : VehiclePhysicsSpec[K];
};

/** Base comum de um esportivo médio; cada carro sobrescreve o que for diferente. */
function physics(overrides: PhysicsOverrides): VehiclePhysicsSpec {
  const base: VehiclePhysicsSpec = {
    drive: 'RWD',
    awdRearSplit: 0.6,
    topSpeedKmh: 250,
    chassis: {
      mass: 1400,
      halfExtents: [0.92, 0.36, 2.2],
      weightDistributionFront: 0.52,
      centerOfMassHeight: -0.14,
      inertiaScale: [1, 1, 0.9],
      downforce: 0.6,
      tireForceHeight: 0.55,
    },
    wheels: { radius: 0.33, width: 0.25, frontAxle: 1.35, rearAxle: -1.3, frontTrack: 1.58, rearTrack: 1.6, mountHeight: 0.1 },
    suspension: { restLength: 0.32, travel: 0.17, frequency: 2.0, dampingRatio: 0.5, antiRoll: 18000 },
    engine: {
      maxPowerKw: 220,
      maxTorqueNm: 400,
      idleRpm: 900,
      redlineRpm: 7000,
      limiterRpm: 7300,
      torqueCurve: [
        [0, 0.55],
        [0.15, 0.72],
        [0.35, 0.93],
        [0.55, 1],
        [0.75, 0.97],
        [0.9, 0.88],
        [1, 0.8],
      ],
      engineBraking: 70,
      throttleResponse: 14,
      electric: false,
      cylinders: 6,
    },
    transmission: {
      gearRatios: [3.2, 2.2, 1.65, 1.3, 1.07, 0.88],
      reverseRatio: 3.1,
      shiftTime: 0.18,
      upshiftRpm: 0.95,
      downshiftRpm: 0.45,
      efficiency: 0.88,
    },
    tires: {
      grip: 1.45,
      rearGripMultiplier: 1.03,
      longitudinalGrip: 1.05,
      peakSlipAngleDeg: 8,
      slideGripRatio: 0.72,
      handbrakeGripRatio: 0.42,
      rollingResistance: 0.012,
    },
    steering: { maxAngleDeg: 34, highSpeedAngleDeg: 9, reductionSpeedKmh: 165, ackermann: 0.6, steerRate: 4.2, returnRate: 6 },
    brakes: { maxForce: 21000, frontBias: 0.64, handbrakeForce: 7000 },
    handling: { stability: 0.6, driftAssist: 0.5, airControl: 0.6 },
  };
  return {
    ...base,
    ...(overrides as Partial<VehiclePhysicsSpec>),
    chassis: { ...base.chassis, ...overrides.chassis },
    wheels: { ...base.wheels, ...overrides.wheels },
    suspension: { ...base.suspension, ...overrides.suspension },
    engine: { ...base.engine, ...overrides.engine },
    transmission: { ...base.transmission, ...overrides.transmission },
    tires: { ...base.tires, ...overrides.tires },
    steering: { ...base.steering, ...overrides.steering },
    brakes: { ...base.brakes, ...overrides.brakes },
    handling: { ...base.handling, ...overrides.handling },
  };
}

export const VEHICLES: readonly VehicleDefinition[] = [
  {
    id: 'valkar-sprint-gt',
    name: 'Sprint GT',
    manufacturer: 'Valkar',
    category: 'street',
    description: 'Hatch leve e esperto de tração dianteira. Previsível, ótimo para aprender as linhas de cada circuito.',
    price: 0,
    unlock: { starter: true },
    provisionalModel: true,
    physics: physics({
      drive: 'FWD',
      topSpeedKmh: 214,
      chassis: { mass: 1180, halfExtents: [0.88, 0.37, 2.04], weightDistributionFront: 0.61, centerOfMassHeight: -0.12, downforce: 0.35 },
      wheels: { radius: 0.31, width: 0.22, frontAxle: 1.28, rearAxle: -1.22, frontTrack: 1.52, rearTrack: 1.5, mountHeight: 0.1 },
      suspension: { frequency: 1.9, antiRoll: 14000 },
      engine: { maxPowerKw: 152, maxTorqueNm: 275, redlineRpm: 6800, limiterRpm: 7100, cylinders: 4, engineBraking: 55 },
      transmission: { gearRatios: [3.4, 2.1, 1.5, 1.18, 0.97, 0.82] },
      tires: { grip: 1.34, rearGripMultiplier: 1.0, handbrakeGripRatio: 0.45 },
      brakes: { maxForce: 17000, handbrakeForce: 6000 },
      handling: { stability: 0.65 },
    }),
    visual: {
      procedural: {
        style: 'hatch',
        length: 4.08,
        width: 1.78,
        beltHeight: 0.93,
        roofHeight: 1.43,
        groundClearance: 0.15,
        windshieldBase: 0.78,
        windshieldTop: -0.02,
        roofEnd: -1.32,
        rearGlassBase: -1.86,
        cabinWidthRatio: 0.86,
        spoiler: 'lip',
        rimColor: '#c9ccd1',
        rimStyle: 'spoke5',
      },
      headlights: [
        [0.6, 0.12, 1.98],
        [-0.6, 0.12, 1.98],
      ],
      taillights: [
        [0.62, 0.22, -2.02],
        [-0.62, 0.22, -2.02],
      ],
      paints: paints('glacier', 'apex-red', 'onyx', 'abyss', 'solar', 'jade'),
      defaultPaint: 'glacier',
    },
    audio: { profile: 'i4' },
  },
  {
    id: 'kestrel-rs4',
    name: 'RS-4',
    manufacturer: 'Kestrel',
    category: 'sport',
    description: 'Sedã esportivo de tração integral. Saídas de curva fortes e muita estabilidade em alta.',
    price: 18000,
    unlock: { level: 2 },
    provisionalModel: true,
    physics: physics({
      drive: 'AWD',
      awdRearSplit: 0.6,
      topSpeedKmh: 252,
      chassis: { mass: 1520, halfExtents: [0.93, 0.37, 2.32], weightDistributionFront: 0.56, centerOfMassHeight: -0.13, downforce: 0.55 },
      wheels: { radius: 0.335, width: 0.25, frontAxle: 1.42, rearAxle: -1.36, frontTrack: 1.6, rearTrack: 1.6, mountHeight: 0.1 },
      suspension: { frequency: 2.0, antiRoll: 20000 },
      engine: { maxPowerKw: 248, maxTorqueNm: 450, redlineRpm: 6800, limiterRpm: 7100, cylinders: 6, engineBraking: 75 },
      transmission: { gearRatios: [3.3, 2.15, 1.6, 1.27, 1.03, 0.85] },
      tires: { grip: 1.44, rearGripMultiplier: 1.02, handbrakeGripRatio: 0.44 },
      brakes: { maxForce: 23000, handbrakeForce: 7500 },
      handling: { stability: 0.7 },
    }),
    visual: {
      procedural: {
        style: 'sedan',
        length: 4.66,
        width: 1.86,
        beltHeight: 0.97,
        roofHeight: 1.42,
        groundClearance: 0.15,
        windshieldBase: 0.92,
        windshieldTop: 0.15,
        roofEnd: -0.98,
        rearGlassBase: -1.62,
        cabinWidthRatio: 0.85,
        spoiler: 'lip',
        rimColor: '#2b2d31',
        rimStyle: 'turbine',
      },
      headlights: [
        [0.64, 0.12, 2.25],
        [-0.64, 0.12, 2.25],
      ],
      taillights: [
        [0.66, 0.22, -2.3],
        [-0.66, 0.22, -2.3],
      ],
      paints: paints('abyss', 'titanium', 'onyx', 'glacier', 'quartz', 'apex-red'),
      defaultPaint: 'abyss',
    },
    audio: { profile: 'v6' },
  },
  {
    id: 'sable-nero-v8',
    name: 'Nero V8',
    manufacturer: 'Sable',
    category: 'gt',
    description: 'GT de tração traseira com V8 aspirado. Torque abundante e traseira viva: o carro dos drifts.',
    price: 32000,
    unlock: { level: 3 },
    provisionalModel: true,
    physics: physics({
      drive: 'RWD',
      topSpeedKmh: 268,
      chassis: { mass: 1640, halfExtents: [0.95, 0.37, 2.38], weightDistributionFront: 0.53, centerOfMassHeight: -0.13, downforce: 0.5 },
      wheels: { radius: 0.34, width: 0.27, frontAxle: 1.46, rearAxle: -1.38, frontTrack: 1.62, rearTrack: 1.64, mountHeight: 0.1 },
      suspension: { frequency: 1.9, antiRoll: 17000 },
      engine: {
        maxPowerKw: 335,
        maxTorqueNm: 560,
        redlineRpm: 6600,
        limiterRpm: 6900,
        cylinders: 8,
        engineBraking: 90,
        torqueCurve: [
          [0, 0.7],
          [0.2, 0.86],
          [0.4, 0.98],
          [0.6, 1],
          [0.8, 0.94],
          [1, 0.82],
        ],
      },
      transmission: { gearRatios: [3.0, 2.05, 1.55, 1.24, 1.0, 0.82] },
      tires: { grip: 1.4, rearGripMultiplier: 0.99, handbrakeGripRatio: 0.36, slideGripRatio: 0.76 },
      brakes: { maxForce: 24000, handbrakeForce: 8500 },
      handling: { stability: 0.5, driftAssist: 0.65 },
    }),
    visual: {
      procedural: {
        style: 'muscle',
        length: 4.78,
        width: 1.92,
        beltHeight: 0.98,
        roofHeight: 1.33,
        groundClearance: 0.14,
        windshieldBase: 0.62,
        windshieldTop: -0.28,
        roofEnd: -1.1,
        rearGlassBase: -1.92,
        cabinWidthRatio: 0.82,
        spoiler: 'ducktail',
        rimColor: '#9aa0a8',
        rimStyle: 'spoke5',
      },
      headlights: [
        [0.68, 0.14, 2.33],
        [-0.68, 0.14, 2.33],
      ],
      taillights: [
        [0.7, 0.24, -2.37],
        [-0.7, 0.24, -2.37],
      ],
      paints: paints('onyx', 'apex-red', 'solar', 'glacier', 'titanium', 'jade'),
      defaultPaint: 'onyx',
    },
    audio: { profile: 'v8' },
  },
  {
    id: 'arcadia-volt-e',
    name: 'Volt E',
    manufacturer: 'Arcadia',
    category: 'electric',
    description: 'Gran turismo elétrico de tração integral. Torque instantâneo, centro de massa baixíssimo e regeneração forte.',
    price: 45000,
    unlock: { level: 5 },
    provisionalModel: true,
    physics: physics({
      drive: 'AWD',
      awdRearSplit: 0.55,
      topSpeedKmh: 255,
      chassis: { mass: 1880, halfExtents: [0.95, 0.38, 2.4], weightDistributionFront: 0.49, centerOfMassHeight: -0.22, downforce: 0.6 },
      wheels: { radius: 0.35, width: 0.26, frontAxle: 1.5, rearAxle: -1.45, frontTrack: 1.64, rearTrack: 1.64, mountHeight: 0.1 },
      suspension: { frequency: 1.85, antiRoll: 22000, dampingRatio: 0.55 },
      engine: {
        maxPowerKw: 340,
        maxTorqueNm: 660,
        idleRpm: 0,
        redlineRpm: 15500,
        limiterRpm: 16000,
        torqueCurve: [
          [0, 1],
          [1, 1],
        ],
        engineBraking: 120,
        throttleResponse: 22,
        electric: true,
        cylinders: 0,
      },
      transmission: { gearRatios: [1], reverseRatio: 1, shiftTime: 0, upshiftRpm: 1, downshiftRpm: 0, efficiency: 0.93 },
      tires: { grip: 1.43, rearGripMultiplier: 1.05, handbrakeGripRatio: 0.45 },
      brakes: { maxForce: 26000, handbrakeForce: 8000 },
      handling: { stability: 0.72 },
    }),
    visual: {
      procedural: {
        style: 'sedan',
        length: 4.86,
        width: 1.94,
        beltHeight: 0.96,
        roofHeight: 1.4,
        groundClearance: 0.14,
        windshieldBase: 1.05,
        windshieldTop: 0.12,
        roofEnd: -1.15,
        rearGlassBase: -1.95,
        cabinWidthRatio: 0.86,
        spoiler: 'none',
        rimColor: '#d6d9de',
        rimStyle: 'turbine',
      },
      headlights: [
        [0.66, 0.1, 2.36],
        [-0.66, 0.1, 2.36],
      ],
      taillights: [
        [0.7, 0.22, -2.4],
        [-0.7, 0.22, -2.4],
      ],
      paints: paints('quartz', 'glacier', 'abyss', 'onyx', 'jade', 'titanium'),
      defaultPaint: 'quartz',
    },
    audio: { profile: 'electric' },
  },
  {
    id: 'orion-apex-r',
    name: 'Apex R',
    manufacturer: 'Orion',
    category: 'super',
    description: 'Superesportivo de motor central. Downforce real, frenagens brutais e resposta imediata — exige respeito.',
    price: 90000,
    unlock: { level: 7 },
    provisionalModel: true,
    physics: physics({
      drive: 'RWD',
      topSpeedKmh: 318,
      chassis: { mass: 1390, halfExtents: [0.98, 0.33, 2.26], weightDistributionFront: 0.42, centerOfMassHeight: -0.13, downforce: 1.35, inertiaScale: [1, 0.92, 0.9] },
      wheels: { radius: 0.34, width: 0.29, frontAxle: 1.42, rearAxle: -1.3, frontTrack: 1.66, rearTrack: 1.68, mountHeight: 0.1 },
      suspension: { restLength: 0.3, frequency: 2.4, antiRoll: 24000, dampingRatio: 0.55 },
      engine: {
        maxPowerKw: 470,
        maxTorqueNm: 620,
        redlineRpm: 8300,
        limiterRpm: 8600,
        cylinders: 10,
        engineBraking: 85,
        throttleResponse: 18,
      },
      transmission: { gearRatios: [3.1, 2.25, 1.75, 1.42, 1.18, 1.0, 0.86], shiftTime: 0.1 },
      tires: { grip: 1.62, rearGripMultiplier: 1.05, handbrakeGripRatio: 0.4, peakSlipAngleDeg: 7.5 },
      brakes: { maxForce: 27000, frontBias: 0.6, handbrakeForce: 8000 },
      handling: { stability: 0.62 },
    }),
    visual: {
      procedural: {
        style: 'super',
        length: 4.56,
        width: 1.98,
        beltHeight: 0.8,
        roofHeight: 1.16,
        groundClearance: 0.12,
        windshieldBase: 0.95,
        windshieldTop: 0.02,
        roofEnd: -0.75,
        rearGlassBase: -1.7,
        cabinWidthRatio: 0.78,
        spoiler: 'wing',
        rimColor: '#1d1f22',
        rimStyle: 'mesh',
      },
      headlights: [
        [0.72, 0.02, 2.22],
        [-0.72, 0.02, 2.22],
      ],
      taillights: [
        [0.74, 0.14, -2.24],
        [-0.74, 0.14, -2.24],
      ],
      paints: paints('solar', 'apex-red', 'onyx', 'glacier', 'quartz', 'abyss'),
      defaultPaint: 'solar',
    },
    audio: { profile: 'v10' },
  },
];

export const STARTER_VEHICLE_ID = 'valkar-sprint-gt';

export function getVehicle(id: string): VehicleDefinition {
  const vehicle = VEHICLES.find((v) => v.id === id);
  if (!vehicle) throw new Error(`Veículo desconhecido: ${id}`);
  return vehicle;
}

export function findVehicle(id: string): VehicleDefinition | undefined {
  return VEHICLES.find((v) => v.id === id);
}

export function getPaint(vehicle: VehicleDefinition, paintId: string | undefined): PaintOption {
  return vehicle.visual.paints.find((p) => p.id === paintId) ?? vehicle.visual.paints.find((p) => p.id === vehicle.visual.defaultPaint) ?? vehicle.visual.paints[0];
}

export const CATEGORY_LABELS: Record<VehicleDefinition['category'], string> = {
  street: 'Rua',
  sport: 'Esportivo',
  gt: 'Gran Turismo',
  super: 'Superesportivo',
  electric: 'Elétrico',
};
