/**
 * Propriedades de superfície usadas pelo modelo de pneus.
 * Cada colisor de solo registra o tipo de superfície no PhysicsWorld.
 */
export type SurfaceType = 'asphalt' | 'curb' | 'grass' | 'gravel';

export interface SurfaceProperties {
  readonly label: string;
  /** Multiplicador de aderência dos pneus. */
  readonly grip: number;
  /** Coeficiente de resistência ao rolamento (força = coef * carga normal). */
  readonly rollingResistance: number;
  /** Arrasto adicional proporcional à velocidade (fora do asfalto). */
  readonly drag: number;
  /** Intensidade de poeira emitida (0..1). */
  readonly dust: number;
  /** Vibração percebida (câmera/áudio). */
  readonly roughness: number;
  /** Indica se a superfície é considerada parte da pista. */
  readonly isTrack: boolean;
}

export const SURFACES: Readonly<Record<SurfaceType, SurfaceProperties>> = {
  asphalt: { label: 'Asfalto', grip: 1, rollingResistance: 0.013, drag: 0, dust: 0, roughness: 0, isTrack: true },
  curb: { label: 'Zebra', grip: 0.93, rollingResistance: 0.016, drag: 0, dust: 0, roughness: 0.55, isTrack: true },
  grass: { label: 'Grama', grip: 0.58, rollingResistance: 0.07, drag: 0.35, dust: 0.55, roughness: 0.35, isTrack: false },
  gravel: { label: 'Brita', grip: 0.5, rollingResistance: 0.16, drag: 0.8, dust: 1, roughness: 0.8, isTrack: false },
};
