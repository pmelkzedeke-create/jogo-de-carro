import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { prepareVehicleScene } from '../../src/rendering/VehicleAsset';

function loadGlb(path: string): Promise<THREE.Group> {
  const data = readFileSync(path);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject));
}

describe('Pipeline GLB de veículos', () => {
  it('o GLB de exemplo é válido: escala, rodas, pintura e luzes reconhecidas', async () => {
    const scene = await loadGlb('public/assets/vehicles/valkar-sprint-gt.glb');
    const report = prepareVehicleScene(scene, { url: 'x', scale: 1, rotationY: 0, offset: [0, 0, 0] });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.wheels.fl?.name).toBe('wheel_fl');
    expect(report.wheels.rr?.name).toBe('wheel_rr');
    expect(report.paintMaterials.length).toBeGreaterThan(0);
    expect(report.brakeLight?.name).toBe('brake_light');
    expect(report.size.z).toBeGreaterThan(3.5);
    expect(report.size.z).toBeLessThan(4.6);
    expect(report.triangles).toBeGreaterThan(1000);
  });

  it('rejeita escala errada e orientação girada', async () => {
    const wrongScale = await loadGlb('public/assets/vehicles/valkar-sprint-gt.glb');
    expect(prepareVehicleScene(wrongScale, { url: 'x', scale: 10, rotationY: 0, offset: [0, 0, 0] }).ok).toBe(false);
    const rotated = await loadGlb('public/assets/vehicles/valkar-sprint-gt.glb');
    const report = prepareVehicleScene(rotated, { url: 'x', scale: 1, rotationY: Math.PI / 2, offset: [0, 0, 0] });
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toMatch(/girado|Comprimento|Largura/);
  });

  it('rejeita arquivo sem malhas e converte materiais não-PBR', () => {
    expect(prepareVehicleScene(new THREE.Group(), { url: 'x', scale: 1, rotationY: 0, offset: [0, 0, 0] }).ok).toBe(false);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 4.3), new THREE.MeshBasicMaterial({ name: 'paint', color: 0xff0000 }));
    mesh.position.y = 0.65;
    group.add(mesh);
    const report = prepareVehicleScene(group, { url: 'x', scale: 1, rotationY: 0, offset: [0, 0, 0] });
    expect(report.ok).toBe(true);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(report.paintMaterials).toHaveLength(1);
    expect(report.warnings.some((w) => w.includes('rodas procedurais'))).toBe(true);
  });
});
