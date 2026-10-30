/**
 * Camadas de colisão (grupos de interação do Rapier).
 * Formato: 16 bits superiores = pertencimento, 16 bits inferiores = filtro.
 * Duas formas colidem se (A.pertence & B.filtro) e (B.pertence & A.filtro) forem diferentes de zero.
 */
export const Layer = {
  GROUND: 1 << 0,
  BARRIER: 1 << 1,
  CAR: 1 << 2,
  CAR_GHOST: 1 << 3,
  PROP: 1 << 4,
  SCENERY: 1 << 5,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

const ALL = 0xffff;

export const CollisionGroups = {
  /** Asfalto, zebras e áreas de escape. */
  ground: interactionGroups(Layer.GROUND, Layer.CAR | Layer.CAR_GHOST | Layer.PROP),
  /** Barreiras e muros de proteção. */
  barrier: interactionGroups(Layer.BARRIER, Layer.CAR | Layer.CAR_GHOST | Layer.PROP),
  /** Carros normais colidem com tudo, inclusive outros carros. */
  car: interactionGroups(Layer.CAR, Layer.GROUND | Layer.BARRIER | Layer.CAR | Layer.PROP | Layer.SCENERY),
  /** Carro em proteção temporária após recuperação: atravessa outros carros e objetos leves. */
  carGhost: interactionGroups(Layer.CAR_GHOST, Layer.GROUND | Layer.BARRIER | Layer.SCENERY),
  /** Cones e objetos leves da pista. */
  prop: interactionGroups(Layer.PROP, Layer.GROUND | Layer.BARRIER | Layer.CAR | Layer.PROP),
  /** Estruturas sólidas próximas à pista (pilares de pórtico etc.). */
  scenery: interactionGroups(Layer.SCENERY, Layer.CAR | Layer.CAR_GHOST),
} as const;

/** Filtros usados em consultas (raios). */
export const QueryGroups = {
  /** Raios das rodas só enxergam o solo. */
  wheel: interactionGroups(ALL, Layer.GROUND),
  /** A câmera evita atravessar solo, barreiras e estruturas. */
  camera: interactionGroups(ALL, Layer.GROUND | Layer.BARRIER | Layer.SCENERY),
  /** Verificação de ocupação ao recuperar um carro. */
  cars: interactionGroups(ALL, Layer.CAR | Layer.CAR_GHOST),
  ground: interactionGroups(ALL, Layer.GROUND),
} as const;
