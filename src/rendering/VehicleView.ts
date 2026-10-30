/**
 * Sincroniza o modelo visual de um carro com o estado físico (interpolado entre passos fixos):
 * posição/rotação, suspensão e giro/esterço das rodas, inclinação visual da carroceria,
 * luzes de freio/ré e efeito de "fantasma" durante a proteção pós-recuperação.
 */
import * as THREE from 'three';
import { clamp } from '../utils/math';
import type { VehiclePhysics } from '../vehicles/VehiclePhysics';
import type { VehicleModel } from './VehicleModelFactory';

export class VehicleView {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private blinkTime = 0;
  private lean = new THREE.Euler();

  constructor(
    readonly model: VehicleModel,
    readonly vehicle: VehiclePhysics,
  ) {}

  update(alpha: number, dt: number): void {
    const v = this.vehicle;
    const root = this.model.root;
    this.position.lerpVectors(v.prevPosition, v.position, alpha);
    this.quaternion.slerpQuaternions(v.prevQuaternion, v.quaternion, alpha);
    root.position.copy(this.position);
    root.quaternion.copy(this.quaternion);

    // Rodas: posição da suspensão, esterço e giro.
    for (let i = 0; i < this.model.wheels.length; i++) {
      const visual = this.model.wheels[i];
      const state = v.wheels[i];
      visual.root.position.set(state.localMount.x, state.localMount.y - state.suspensionLength, state.localMount.z);
      visual.root.rotation.y = state.steerAngle;
      visual.spin.rotation.x = state.spinAngle;
    }

    // Inclinação visual (rolagem/arfagem) proporcional às acelerações.
    const roll = clamp(v.lateralAccel * 0.0045, -0.05, 0.05);
    const pitch = clamp(-v.longitudinalAccel * 0.0035, -0.035, 0.035);
    this.lean.set(pitch, 0, roll);
    this.model.body.rotation.copy(this.lean);

    // Luzes.
    const braking = v.controls.brake > 0.05 && v.drivetrain.gear > 0 ? v.controls.brake : v.drivetrain.gear < 0 && v.controls.throttle > 0.05 ? v.controls.throttle : 0;
    this.model.brakeLightMaterial.emissiveIntensity = 0.7 + braking * 3.3 + (v.controls.handbrake > 0.5 ? 1.5 : 0);
    this.model.reverseLightMaterial.emissiveIntensity = v.drivetrain.gear < 0 ? 2.2 : 0;

    // Proteção temporária: o carro pisca.
    if (v.ghost) {
      this.blinkTime += dt;
      root.visible = Math.floor(this.blinkTime * 10) % 2 === 0;
    } else {
      this.blinkTime = 0;
      root.visible = true;
    }
  }

  dispose(): void {
    this.model.dispose();
  }
}
