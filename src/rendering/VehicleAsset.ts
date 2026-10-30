/**
 * Validação e preparo de modelos GLB de veículos (funções puras sobre a cena three.js — testáveis em Node).
 *
 * Convenções esperadas (documentadas em public/assets/vehicles/README.md):
 * - Unidades em metros, +Y para cima, frente do carro em +Z (ou ajuste `rotationY`).
 * - Origem no solo, no centro da carroceria.
 * - Rodas em nós separados (padrão: wheel_fl, wheel_fr, wheel_rl, wheel_rr) com origem no centro da roda e eixo em X.
 * - Materiais de pintura com nome "paint" (ou definidos em `paintMaterialNames`), luzes "brake_light", "headlight", "reverse_light".
 */
import * as THREE from 'three';
import type { GltfModelSpec } from '../vehicles/VehicleConfig';

export interface VehicleAssetReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  triangles: number;
  size: THREE.Vector3;
  wheels: Record<'fl' | 'fr' | 'rl' | 'rr', THREE.Object3D | null>;
  paintMaterials: THREE.MeshStandardMaterial[];
  brakeLight: THREE.MeshStandardMaterial | null;
  headlight: THREE.MeshStandardMaterial | null;
  reverseLight: THREE.MeshStandardMaterial | null;
}

const DEFAULT_WHEEL_NAMES = { fl: 'wheel_fl', fr: 'wheel_fr', rl: 'wheel_rl', rr: 'wheel_rr' } as const;
const MAX_TRIANGLES = 600_000;

function countTriangles(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3;
  return (geometry.attributes.position?.count ?? 0) / 3;
}

/** Converte materiais não-PBR para MeshStandardMaterial, preservando cor e textura. */
function ensurePbr(material: THREE.Material, warnings: string[]): THREE.Material {
  if (material instanceof THREE.MeshStandardMaterial) return material;
  const legacy = material as THREE.MeshBasicMaterial;
  const converted = new THREE.MeshStandardMaterial({
    name: material.name,
    color: legacy.color ?? new THREE.Color(0xffffff),
    map: legacy.map ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    roughness: 0.6,
    metalness: 0.1,
  });
  warnings.push(`Material "${material.name || '(sem nome)'}" não era PBR e foi convertido para MeshStandardMaterial.`);
  return converted;
}

/** Aplica escala/rotação/deslocamento e valida a cena carregada. Não modifica a hierarquia das rodas. */
export function prepareVehicleScene(scene: THREE.Object3D, spec: GltfModelSpec): VehicleAssetReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  scene.scale.setScalar(spec.scale);
  scene.rotation.set(0, spec.rotationY, 0);
  scene.position.set(spec.offset[0], spec.offset[1], spec.offset[2]);
  scene.updateMatrixWorld(true);

  let triangles = 0;
  let meshes = 0;
  const paintNames = (spec.paintMaterialNames ?? ['paint', 'body_paint']).map((n) => n.toLowerCase());
  const paintMaterials = new Set<THREE.MeshStandardMaterial>();
  let brakeLight: THREE.MeshStandardMaterial | null = null;
  let headlight: THREE.MeshStandardMaterial | null = null;
  let reverseLight: THREE.MeshStandardMaterial | null = null;

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    triangles += countTriangles(mesh.geometry);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const prepared = list.map((m) => ensurePbr(m, warnings) as THREE.MeshStandardMaterial);
    mesh.material = Array.isArray(mesh.material) ? prepared : prepared[0];
    for (const m of prepared) {
      const name = (m.name ?? '').toLowerCase();
      if (paintNames.includes(name)) paintMaterials.add(m);
      if (name === 'brake_light' || name === 'taillight') brakeLight = m;
      if (name === 'headlight') headlight = m;
      if (name === 'reverse_light') reverseLight = m;
    }
  });

  if (meshes === 0) errors.push('O arquivo não contém malhas.');
  if (triangles > MAX_TRIANGLES) errors.push(`Modelo pesado demais (${Math.round(triangles)} triângulos; limite ${MAX_TRIANGLES}).`);
  else if (triangles > 200_000) warnings.push(`Modelo com muitos triângulos (${Math.round(triangles)}); considere uma versão LOD.`);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (meshes > 0) {
    if (size.z < 2.5 || size.z > 7) errors.push(`Comprimento inválido (${size.z.toFixed(2)} m). Verifique escala e orientação (+Z para frente).`);
    if (size.x < 1.2 || size.x > 3) errors.push(`Largura inválida (${size.x.toFixed(2)} m).`);
    if (size.y < 0.8 || size.y > 3) errors.push(`Altura inválida (${size.y.toFixed(2)} m).`);
    if (size.x > size.z) errors.push('O modelo parece estar girado 90° (mais largo que comprido).');
  }

  const names = spec.wheelNodeNames ?? DEFAULT_WHEEL_NAMES;
  const wheels = {
    fl: scene.getObjectByName(names.fl) ?? null,
    fr: scene.getObjectByName(names.fr) ?? null,
    rl: scene.getObjectByName(names.rl) ?? null,
    rr: scene.getObjectByName(names.rr) ?? null,
  };
  const found = Object.values(wheels).filter(Boolean).length;
  if (found > 0 && found < 4) warnings.push(`Apenas ${found} de 4 rodas encontradas; rodas procedurais serão usadas.`);
  if (found === 0) warnings.push('Nenhum nó de roda encontrado; rodas procedurais serão usadas.');
  if (paintMaterials.size === 0) warnings.push('Nenhum material de pintura encontrado; a escolha de cor não terá efeito neste modelo.');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    triangles: Math.round(triangles),
    size,
    wheels: found === 4 ? wheels : { fl: null, fr: null, rl: null, rr: null },
    paintMaterials: [...paintMaterials],
    brakeLight,
    headlight,
    reverseLight,
  };
}
