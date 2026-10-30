/**
 * Sistema de partículas em billboards instanciados (uma chamada de desenho por sistema).
 * Simulação na CPU com arrays pré-alocados — sem alocações por quadro.
 */
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute vec3 instanceOffset;
  attribute vec4 instanceData; // x = tamanho, y = alfa, z = rotação
  attribute vec3 instanceTint;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vTint;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vAlpha = instanceData.y;
    vTint = instanceTint;
    float c = cos(instanceData.z);
    float s = sin(instanceData.z);
    vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * instanceData.x;
    vec4 mvPosition = viewMatrix * vec4(instanceOffset, 1.0);
    mvPosition.xy += corner;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vTint;
  #include <fog_pars_fragment>
  void main() {
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4(vTint * tex.rgb, tex.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }
`;

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  growth: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
  drag: number;
}

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly growth: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly rot: Float32Array;
  private readonly offsets: THREE.InstancedBufferAttribute;
  private readonly data: THREE.InstancedBufferAttribute;
  private readonly tints: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;
  enabled = true;

  constructor(texture: THREE.Texture, max: number, additive: boolean) {
    this.max = Math.max(1, max);
    const n = this.max;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.growth = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.rot = new Float32Array(n);
    const base = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.attributes.position);
    this.geometry.setAttribute('uv', base.attributes.uv);
    this.offsets = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceOffset', this.offsets);
    this.geometry.setAttribute('instanceData', this.data);
    this.geometry.setAttribute('instanceTint', this.tints);
    this.geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture } }]),
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    material.uniforms.map.value = texture;
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  get alive(): number {
    return this.count;
  }

  emit(o: EmitOptions): void {
    if (!this.enabled || this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx;
    this.vel[i * 3 + 1] = o.vy;
    this.vel[i * 3 + 2] = o.vz;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.size[i] = o.size;
    this.growth[i] = o.growth;
    this.alpha0[i] = o.alpha;
    this.gravity[i] = o.gravity;
    this.drag[i] = o.drag;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.tints.setXYZ(i, o.r, o.g, o.b);
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Remove trocando com o último (ordem não importa).
        const last = --this.count;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.growth[i] * dt;
      this.rot[i] += dt * 0.4;
      const t = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, (1 - t) * 6) * t;
      this.offsets.setXYZ(i, this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.data.setXYZW(i, this.size[i], this.alpha0[i] * fade * 1.6, this.rot[i], 0);
      i++;
    }
    this.geometry.instanceCount = this.count;
    if (this.count > 0) {
      this.offsets.needsUpdate = true;
      this.data.needsUpdate = true;
      this.tints.needsUpdate = true;
    }
  }

  private copy(from: number, to: number): void {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.growth[to] = this.growth[from];
    this.alpha0[to] = this.alpha0[from];
    this.gravity[to] = this.gravity[from];
    this.drag[to] = this.drag[from];
    this.rot[to] = this.rot[from];
    this.tints.setXYZ(to, this.tints.getX(from), this.tints.getY(from), this.tints.getZ(from));
  }

  clear(): void {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
