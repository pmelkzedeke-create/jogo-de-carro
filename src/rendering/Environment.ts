/**
 * Ambiente: céu físico (Preetham), sol com sombras estabilizadas, luz hemisférica, neblina e
 * mapa de ambiente (PMREM) gerado a partir do próprio céu — reflexos coerentes sem HDRs externos.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { DrawDistance, ShadowQuality } from '../persistence/SaveSchema';
import type { EnvironmentPresetId } from '../tracks/TrackConfig';

export interface EnvironmentPreset {
  label: string;
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  cloudCoverage: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  exposure: number;
  headlights: boolean;
}

export const ENVIRONMENT_PRESETS: Readonly<Record<EnvironmentPresetId, EnvironmentPreset>> = {
  day: {
    label: 'Dia ensolarado',
    sunElevation: 48,
    sunAzimuth: 140,
    turbidity: 2.6,
    rayleigh: 1.1,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    cloudCoverage: 0.32,
    sunColor: '#fff3e2',
    sunIntensity: 3.1,
    hemiSky: '#cfe2ff',
    hemiGround: '#5b6a4c',
    hemiIntensity: 0.85,
    fogColor: '#c6d6e6',
    fogDensity: 0.00072,
    exposure: 0.62,
    headlights: false,
  },
  morning: {
    label: 'Manhã na serra',
    sunElevation: 17,
    sunAzimuth: 78,
    turbidity: 4.5,
    rayleigh: 1.6,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.82,
    cloudCoverage: 0.45,
    sunColor: '#ffd9ae',
    sunIntensity: 2.7,
    hemiSky: '#c9d4e6',
    hemiGround: '#4f5a43',
    hemiIntensity: 0.9,
    fogColor: '#d4d2cc',
    fogDensity: 0.0012,
    exposure: 0.72,
    headlights: false,
  },
  sunset: {
    label: 'Pôr do sol',
    sunElevation: 5.5,
    sunAzimuth: 252,
    turbidity: 7,
    rayleigh: 2.4,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.86,
    cloudCoverage: 0.38,
    sunColor: '#ffb27a',
    sunIntensity: 2.3,
    hemiSky: '#93a2c7',
    hemiGround: '#4b3c33',
    hemiIntensity: 0.75,
    fogColor: '#d9a585',
    fogDensity: 0.0011,
    exposure: 0.88,
    headlights: true,
  },
  overcast: {
    label: 'Nublado',
    sunElevation: 38,
    sunAzimuth: 165,
    turbidity: 10,
    rayleigh: 0.7,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.7,
    cloudCoverage: 0.88,
    sunColor: '#eef2f6',
    sunIntensity: 1.3,
    hemiSky: '#c3cbd3',
    hemiGround: '#575d55',
    hemiIntensity: 1.35,
    fogColor: '#aeb7bf',
    fogDensity: 0.0017,
    exposure: 0.95,
    headlights: false,
  },
};

const SHADOW_SETTINGS: Record<Exclude<ShadowQuality, 'off'>, { size: number; extent: number }> = {
  low: { size: 1024, extent: 45 },
  medium: { size: 2048, extent: 65 },
  high: { size: 4096, extent: 85 },
};

export const DRAW_DISTANCE: Record<DrawDistance, { far: number; fogScale: number }> = {
  near: { far: 900, fogScale: 1.9 },
  medium: { far: 1800, fogScale: 1.3 },
  far: { far: 3500, fogScale: 1 },
};

export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  readonly preset: EnvironmentPreset;
  readonly sunDirection = new THREE.Vector3();
  readonly fog: THREE.FogExp2;
  envMap: THREE.Texture | null = null;
  private extent = 65;
  private texel = 0.05;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    presetId: EnvironmentPresetId,
    shadows: ShadowQuality,
    private drawDistance: DrawDistance,
  ) {
    const preset = ENVIRONMENT_PRESETS[presetId];
    this.preset = preset;
    this.group.name = 'environment';

    this.sky = new Sky();
    this.sky.name = 'sky';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    const u = this.sky.material.uniforms;
    u.turbidity.value = preset.turbidity;
    u.rayleigh.value = preset.rayleigh;
    u.mieCoefficient.value = preset.mieCoefficient;
    u.mieDirectionalG.value = preset.mieDirectionalG;
    if (u.cloudCoverage) u.cloudCoverage.value = preset.cloudCoverage;
    const phi = THREE.MathUtils.degToRad(90 - preset.sunElevation);
    const theta = THREE.MathUtils.degToRad(preset.sunAzimuth);
    this.sunDirection.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDirection);
    this.group.add(this.sky);

    this.sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
    this.sun.name = 'sun';
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
    this.group.add(this.hemi);

    this.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
    this.setShadowQuality(shadows);
    this.setDrawDistance(drawDistance);
    this.generateEnvMap();
  }

  get exposure(): number {
    return this.preset.exposure;
  }

  /** Gera o mapa de ambiente a partir do céu (sem o disco solar para evitar artefatos). */
  private generateEnvMap(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const scene = new THREE.Scene();
    const skyClone = new Sky();
    const u = skyClone.material.uniforms;
    const src = this.sky.material.uniforms;
    for (const key of Object.keys(u)) {
      const value = src[key]?.value;
      if (value instanceof THREE.Vector3) u[key].value.copy(value);
      else if (value !== undefined) u[key].value = value;
    }
    if (u.showSunDisc) u.showSunDisc.value = 0;
    skyClone.scale.setScalar(1000);
    scene.add(skyClone);
    // Chão escuro aproximado para o hemisfério inferior do ambiente.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: this.preset.hemiGround }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    scene.add(ground);
    const target = pmrem.fromScene(scene, 0.02, 0.1, 2000);
    this.envMap = target.texture;
    pmrem.dispose();
    skyClone.geometry.dispose();
    skyClone.material.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
  }

  apply(scene: THREE.Scene): void {
    scene.add(this.group);
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.85;
    scene.fog = this.fog;
    scene.background = null;
  }

  setShadowQuality(quality: ShadowQuality): void {
    const enabled = quality !== 'off';
    this.sun.castShadow = enabled;
    if (!enabled) return;
    const s = SHADOW_SETTINGS[quality];
    this.extent = s.extent;
    this.texel = (s.extent * 2) / s.size;
    if (this.sun.shadow.mapSize.x !== s.size) {
      this.sun.shadow.mapSize.set(s.size, s.size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const cam = this.sun.shadow.camera;
    cam.left = -s.extent;
    cam.right = s.extent;
    cam.top = s.extent;
    cam.bottom = -s.extent;
    cam.near = 1;
    cam.far = 600;
    cam.updateProjectionMatrix();
  }

  setDrawDistance(distance: DrawDistance): void {
    this.drawDistance = distance;
    this.fog.density = this.preset.fogDensity * DRAW_DISTANCE[distance].fogScale;
    this.sky.scale.setScalar(DRAW_DISTANCE[distance].far * 1.1);
  }

  get far(): number {
    return DRAW_DISTANCE[this.drawDistance].far;
  }

  /** Mantém o céu centrado na câmera e a sombra seguindo o foco (com ajuste à grade de texels). */
  update(cameraPosition: THREE.Vector3, focus: THREE.Vector3): void {
    this.sky.position.copy(cameraPosition);
    const t = this.texel;
    const tx = Math.round(focus.x / t) * t;
    const tz = Math.round(focus.z / t) * t;
    this.sun.target.position.set(tx, focus.y, tz);
    this.sun.position.set(tx, focus.y, tz).addScaledVector(this.sunDirection, 300);
    this.sun.target.updateMatrixWorld();
    void this.extent;
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    this.envMap?.dispose();
    this.group.removeFromParent();
  }
}
