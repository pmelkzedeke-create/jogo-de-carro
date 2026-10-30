/**
 * Converte a entrada do jogador em comandos do veículo.
 * - Teclado (digital): rampas progressivas de acelerador/freio e direção com retorno ao centro.
 * - Analógico (gamepad/toque): suavização leve, respeitando a posição do gatilho/stick.
 * - Sensibilidade e assistência de contraesterço configuráveis.
 */
import { clamp, damp, lerp, moveTowards, smoothstep } from '../utils/math';
import type { InputState } from '../input/InputManager';
import type { VehicleControls, VehiclePhysics } from './VehiclePhysics';

export interface ControllerSettings {
  steeringSensitivity: number;
  /** 0..1 */
  assist: number;
}

export class PlayerController {
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

  reset(): void {
    this.controls.throttle = 0;
    this.controls.brake = 0;
    this.controls.steer = 0;
    this.controls.handbrake = 0;
  }

  update(dt: number, input: InputState, vehicle: VehiclePhysics, settings: ControllerSettings): VehicleControls {
    const c = this.controls;
    const steering = vehicle.phys.spec.steering;
    const speedFactor = smoothstep(5, 50, Math.abs(vehicle.forwardSpeed));

    // --- Direção ---
    const sensitivity = clamp(settings.steeringSensitivity, 0.5, 1.5);
    let target = clamp(input.steer, -1, 1);
    if (input.analog) {
      // Curva de resposta: mais precisão perto do centro.
      target = Math.sign(target) * Math.pow(Math.abs(target), lerp(1.6, 1.1, (sensitivity - 0.5) / 1));
      c.steer = damp(c.steer, target, 20, dt);
    } else {
      const reversing = Math.sign(target) !== Math.sign(c.steer) && c.steer !== 0;
      const baseRate = target === 0 ? steering.returnRate : steering.steerRate * (reversing ? 1.6 : 1);
      // Em alta velocidade o volante gira mais devagar (estabilidade com teclado).
      const rate = baseRate * sensitivity * lerp(1, 0.55, speedFactor);
      c.steer = moveTowards(c.steer, target, rate * dt);
    }

    // Assistência de contraesterço durante derrapagens (mantém o drift controlável).
    const assist = clamp(settings.assist, 0, 1) * vehicle.phys.spec.handling.driftAssist;
    const slide = Math.abs(vehicle.driftAngle) - 0.12;
    if (assist > 0 && slide > 0 && vehicle.forwardSpeed > 4) {
      const correction = Math.sign(vehicle.driftAngle) * Math.min(slide * 1.4, 0.6) * assist;
      // Só ajuda se o jogador não estiver esterçando ativamente para o lado oposto.
      if (Math.sign(input.steer) !== -Math.sign(correction) || input.steer === 0) {
        c.steer = clamp(c.steer + correction * dt * 6, -1, 1);
      }
    }

    // --- Acelerador e freio ---
    if (input.analog) {
      c.throttle = damp(c.throttle, input.throttle, 25, dt);
      c.brake = damp(c.brake, input.brake, 25, dt);
    } else {
      c.throttle = moveTowards(c.throttle, input.throttle, (input.throttle > c.throttle ? 5.5 : 9) * dt);
      c.brake = moveTowards(c.brake, input.brake, (input.brake > c.brake ? 7 : 12) * dt);
    }
    c.handbrake = input.handbrake;
    return c;
  }
}

export function assistLevelValue(level: 'off' | 'low' | 'medium' | 'high'): number {
  switch (level) {
    case 'off':
      return 0;
    case 'low':
      return 0.3;
    case 'medium':
      return 0.6;
    case 'high':
      return 1;
  }
}
