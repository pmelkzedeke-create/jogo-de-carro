/**
 * Eventos de impacto produzidos pelo passo físico.
 * Consumidos por áudio, partículas, câmera e estatísticas — nunca alteram regras da corrida.
 */
export type ColliderKind = 'ground' | 'barrier' | 'car' | 'prop' | 'scenery';

export interface ImpactEvent {
  /** Identificador do carro envolvido (se houver). */
  carId: string | null;
  /** Identificador do outro carro, quando a colisão é entre carros. */
  otherCarId: string | null;
  /** Tipo do outro objeto. */
  otherKind: ColliderKind;
  /** Força total do contato (N). */
  force: number;
  /** Intensidade normalizada aproximada (variação de velocidade em m/s). */
  intensity: number;
  /** Ponto de contato em coordenadas do mundo (quando disponível). */
  point: { x: number; y: number; z: number } | null;
}

/** Fila simples reutilizada a cada passo para evitar alocações desnecessárias. */
export class ImpactQueue {
  readonly events: ImpactEvent[] = [];

  push(event: ImpactEvent): void {
    // Limite de segurança para evitar crescimento excessivo em situações extremas.
    if (this.events.length < 64) this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}
