/**
 * Mapeamento centralizado de teclas (usa `KeyboardEvent.code`, independente do layout).
 * Para remapear controles, altere apenas esta tabela.
 */
export type GameAction = 'accelerate' | 'brake' | 'left' | 'right' | 'handbrake' | 'recover' | 'camera' | 'pause' | 'restart';

export const DEFAULT_KEYMAP: Readonly<Record<GameAction, readonly string[]>> = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  recover: ['KeyR'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyN'],
};

/** Ações disparadas uma vez por pressionamento (não contínuas). */
export const EDGE_ACTIONS: readonly GameAction[] = ['recover', 'camera', 'pause', 'restart'];

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  accelerate: 'Acelerar',
  brake: 'Frear / Ré',
  left: 'Virar à esquerda',
  right: 'Virar à direita',
  handbrake: 'Freio de mão',
  recover: 'Recuperar o carro',
  camera: 'Trocar câmera',
  pause: 'Pausar',
  restart: 'Reiniciar corrida',
};

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Espaço',
    Escape: 'Esc',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
