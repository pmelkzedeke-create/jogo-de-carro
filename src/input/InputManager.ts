/**
 * Agregador de entradas: teclado, gamepad (API Gamepad, analógico) e controles de toque.
 * Produz um estado único por quadro. Ações pontuais (câmera, pausa, recuperar, reiniciar)
 * são entregues como eventos de borda, consumidos uma única vez.
 */
import { DEFAULT_KEYMAP, EDGE_ACTIONS, type GameAction } from './Keymap';

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export interface InputState {
  throttle: number;
  brake: number;
  /** -1 esquerda .. +1 direita */
  steer: number;
  handbrake: number;
  /** Indica entrada analógica (gamepad/toque) — o controlador aplica menos suavização. */
  analog: boolean;
  device: InputDevice;
}

/** Estado alimentado pelos controles de toque da interface. */
export interface TouchState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: number;
  active: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export class InputManager {
  readonly state: InputState = { throttle: 0, brake: 0, steer: 0, handbrake: 0, analog: false, device: 'keyboard' };
  readonly touch: TouchState = { throttle: 0, brake: 0, steer: 0, handbrake: 0, active: false };
  gamepadDeadzone = 0.12;
  gamepadConnected = false;
  onGamepadChange: ((connected: boolean, id: string) => void) | null = null;
  /** Quando falso, teclas de corrida são ignoradas (ex.: em menus). */
  enabled = true;

  private readonly pressed = new Set<string>();
  private readonly codeToAction = new Map<string, GameAction>();
  private readonly edgeQueue: GameAction[] = [];
  private readonly previousButtons = new Map<number, boolean>();
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  private lastDevice: InputDevice = 'keyboard';

  constructor(target: Window = window) {
    for (const [action, codes] of Object.entries(DEFAULT_KEYMAP) as Array<[GameAction, readonly string[]]>) {
      for (const code of codes) this.codeToAction.set(code, action);
    }
    this.listen(target, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(target, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    this.listen(target, 'blur', () => this.clear());
    this.listen(target, 'gamepadconnected', (e) => {
      this.gamepadConnected = true;
      this.onGamepadChange?.(true, (e as GamepadEvent).gamepad.id);
    });
    this.listen(target, 'gamepaddisconnected', (e) => {
      this.gamepadConnected = this.anyGamepad() !== null;
      this.onGamepadChange?.(false, (e as GamepadEvent).gamepad.id);
    });
    if (typeof document !== 'undefined') {
      this.listen(document, 'visibilitychange', () => {
        if (document.hidden) this.clear();
      });
    }
  }

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.listeners.push([target, type, handler]);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    const action = this.codeToAction.get(event.code);
    if (!action) return;
    // Evita rolagem da página com setas/espaço durante a corrida.
    if (this.enabled && event.code !== 'Escape') event.preventDefault();
    this.lastDevice = 'keyboard';
    if (!event.repeat && EDGE_ACTIONS.includes(action)) this.edgeQueue.push(action);
    this.pressed.add(event.code);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.pressed.delete(event.code);
  }

  /** Solta todas as teclas (perda de foco, troca de aba). */
  clear(): void {
    this.pressed.clear();
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.touch.steer = 0;
    this.touch.handbrake = 0;
  }

  private actionHeld(action: GameAction): boolean {
    for (const code of DEFAULT_KEYMAP[action]) if (this.pressed.has(code)) return true;
    return false;
  }

  private anyGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) if (pad && pad.connected) return pad;
    return null;
  }

  private deadzone(value: number): number {
    const dz = this.gamepadDeadzone;
    const abs = Math.abs(value);
    if (abs < dz) return 0;
    return Math.sign(value) * ((abs - dz) / (1 - dz));
  }

  /** Atualiza o estado agregado. Chamar uma vez por quadro. */
  poll(): InputState {
    const s = this.state;
    let throttle = this.actionHeld('accelerate') ? 1 : 0;
    let brake = this.actionHeld('brake') ? 1 : 0;
    let steer = (this.actionHeld('right') ? 1 : 0) - (this.actionHeld('left') ? 1 : 0);
    let handbrake = this.actionHeld('handbrake') ? 1 : 0;
    let analog = false;

    const pad = this.anyGamepad();
    if (pad) {
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const stick = this.deadzone(pad.axes[0] ?? 0);
      const hb = pad.buttons[0]?.pressed || pad.buttons[2]?.pressed ? 1 : 0;
      if (rt > 0.05 || lt > 0.05 || Math.abs(stick) > 0 || hb) this.lastDevice = 'gamepad';
      if (this.lastDevice === 'gamepad') {
        throttle = Math.max(throttle, rt);
        brake = Math.max(brake, lt);
        if (Math.abs(stick) > Math.abs(steer)) steer = stick;
        handbrake = Math.max(handbrake, hb);
        analog = true;
      }
      // Botões de ação (borda): Y câmera, B recuperar, Start pausa, Back reiniciar.
      const edges: Array<[number, GameAction]> = [
        [3, 'camera'],
        [1, 'recover'],
        [9, 'pause'],
        [8, 'restart'],
      ];
      for (const [index, action] of edges) {
        const pressed = !!pad.buttons[index]?.pressed;
        const before = this.previousButtons.get(index) ?? false;
        if (pressed && !before) {
          this.edgeQueue.push(action);
          this.lastDevice = 'gamepad';
        }
        this.previousButtons.set(index, pressed);
      }
    }

    if (this.touch.active) {
      if (this.touch.throttle > 0 || this.touch.brake > 0 || this.touch.steer !== 0 || this.touch.handbrake > 0) this.lastDevice = 'touch';
      throttle = Math.max(throttle, this.touch.throttle);
      brake = Math.max(brake, this.touch.brake);
      if (Math.abs(this.touch.steer) > Math.abs(steer)) {
        steer = this.touch.steer;
        analog = true;
      }
      handbrake = Math.max(handbrake, this.touch.handbrake);
    }

    s.throttle = this.enabled ? throttle : 0;
    s.brake = this.enabled ? brake : 0;
    s.steer = this.enabled ? Math.max(-1, Math.min(1, steer)) : 0;
    s.handbrake = this.enabled ? handbrake : 0;
    s.analog = analog;
    s.device = this.lastDevice;
    return s;
  }

  /** Dispara uma ação pontual a partir da interface (ex.: botão de toque). */
  trigger(action: GameAction): void {
    this.edgeQueue.push(action);
  }

  /** Retorna e remove as ações pontuais pendentes. */
  consumeActions(): GameAction[] {
    if (this.edgeQueue.length === 0) return [];
    const actions = [...this.edgeQueue];
    this.edgeQueue.length = 0;
    return actions;
  }

  dispose(): void {
    for (const [target, type, handler] of this.listeners) target.removeEventListener(type, handler);
    this.listeners.length = 0;
    this.clear();
  }
}
