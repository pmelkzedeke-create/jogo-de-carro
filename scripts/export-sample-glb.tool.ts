/**
 * Gera public/assets/vehicles/valkar-sprint-gt.glb a partir do modelo procedural (PROVISÓRIO),
 * seguindo as convenções de nós/materiais esperadas pelo VehicleAssetLoader.
 * Serve para validar o pipeline GLB de ponta a ponta; substitua o arquivo por um modelo licenciado.
 * Uso: npm run assets:sample-glb
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { test } from 'vitest';
import { createProceduralVehicle, VehicleMaterials } from '../src/rendering/VehicleModelFactory';
import { getPaint, getVehicle } from '../src/vehicles/VehicleCatalog';
import { resolvePhysics } from '../src/vehicles/VehicleConfig';

// FileReader mínimo para o GLTFExporter rodar no Node.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onload: ((e: unknown) => void) | null = null;
  onloadend: ((e: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

test('export sample glb', async () => {
  const id = process.env.VEHICLE ?? 'valkar-sprint-gt';
  const def = getVehicle(id);
  const phys = resolvePhysics(def.physics);
  const model = createProceduralVehicle(def, getPaint(def, def.visual.defaultPaint), new VehicleMaterials());
  const root = new THREE.Group();
  root.name = id;
  // Origem do arquivo no solo: a carroceria sobe a altura de rodagem.
  const body = model.body;
  body.removeFromParent();
  body.position.y = phys.rideHeight;
  body.name = 'body';
  root.add(body);
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  model.wheels.forEach((wheel, i) => {
    const node = new THREE.Group();
    node.name = names[i];
    node.position.set(wheel.root.position.x, def.physics.wheels.radius, wheel.root.position.z);
    // Apenas pneu e aro giram; disco/pinça ficam fora do arquivo.
    const mirror = wheel.spin.children[0];
    mirror.removeFromParent();
    node.add(mirror);
    root.add(node);
  });
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  const buffer = Buffer.from(result as ArrayBuffer);
  mkdirSync('public/assets/vehicles', { recursive: true });
  writeFileSync(`public/assets/vehicles/${id}.glb`, buffer);
  console.log(`GLB gerado: public/assets/vehicles/${id}.glb (${(buffer.length / 1024).toFixed(0)} KB)`);
});
