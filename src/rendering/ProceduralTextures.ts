/**
 * Texturas procedurais geradas em tempo de carregamento (Canvas 2D), sem downloads externos.
 * São originais e servem como base visual provisória — podem ser substituídas por texturas
 * fotográficas/PBR em public/assets/textures sem alterar o restante do código.
 */
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

function createCanvas(size: number, height = size): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas.');
  return { canvas, ctx };
}

/** Ruído de valor periódico (textura sem emendas). */
class TileNoise {
  private readonly values: Float32Array;
  constructor(
    private readonly period: number,
    seed: number,
  ) {
    this.values = new Float32Array(period * period);
    let s = seed >>> 0 || 1;
    for (let i = 0; i < this.values.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      this.values[i] = s / 4294967296;
    }
  }
  private v(x: number, y: number): number {
    const p = this.period;
    return this.values[(((y % p) + p) % p) * p + (((x % p) + p) % p)];
  }
  sample(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.v(ix, iy);
    const b = this.v(ix + 1, iy);
    const c = this.v(ix, iy + 1);
    const d = this.v(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
}

/** fBm periódico em [0,1] para coordenadas normalizadas u,v em [0,1). */
function tileFbm(noises: TileNoise[], periods: number[], u: number, v: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < noises.length; i++) {
    sum += noises[i].sample(u * periods[i], v * periods[i]) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function makeNoises(seed: number, periods: number[]): TileNoise[] {
  return periods.map((p, i) => new TileNoise(p, seed + i * 7919));
}

/** Converte um mapa de altura em mapa normal (com bordas periódicas). */
function heightToNormal(height: Float32Array, w: number, h: number, strength: number): ImageData {
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x];
      const d = height[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export interface SurfaceTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export class TextureLibrary {
  private readonly cache = new Map<string, unknown>();
  constructor(
    private readonly size: number,
    private readonly anisotropy: number,
  ) {}

  private memo<T>(key: string, factory: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, factory());
    return this.cache.get(key) as T;
  }

  /** Asfalto com faixas brancas laterais, desgaste e microrrelevo. */
  asphalt(): SurfaceTextures {
    return this.memo('asphalt', () => {
      const w = this.size;
      const h = this.size;
      const noises = makeNoises(11, [8, 32, 128]);
      const fine = makeNoises(97, [256]);
      const { canvas, ctx } = createCanvas(w, h);
      const rough = createCanvas(w, h);
      const img = ctx.createImageData(w, h);
      const rimg = rough.ctx.createImageData(w, h);
      const height = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const n = tileFbm(noises, [8, 32, 128], u, v);
          const grain = fine[0].sample(u * 256, v * 256);
          // Desgaste: faixas mais escuras onde os carros passam (trilhos de pneu).
          const wear = Math.exp(-(((u - 0.32) / 0.07) ** 2)) + Math.exp(-(((u - 0.68) / 0.07) ** 2));
          let base = 44 + (n - 0.5) * 14 + (grain - 0.5) * 14 - wear * 6;
          let line = 0;
          if ((u > 0.012 && u < 0.03) || (u > 0.97 && u < 0.988)) line = 1;
          const speck = grain > 0.9 ? 9 : 0;
          base += speck;
          const i = (y * w + x) * 4;
          if (line) {
            const paint = 200 + (n - 0.5) * 26;
            img.data[i] = paint;
            img.data[i + 1] = paint;
            img.data[i + 2] = paint - 6;
          } else {
            img.data[i] = clamp255(base + 2);
            img.data[i + 1] = clamp255(base + 1);
            img.data[i + 2] = clamp255(base);
          }
          img.data[i + 3] = 255;
          const r = line ? 150 : clamp255(225 - wear * 30 + (grain - 0.5) * 40);
          rimg.data[i] = r;
          rimg.data[i + 1] = r;
          rimg.data[i + 2] = r;
          rimg.data[i + 3] = 255;
          height[y * w + x] = grain * 0.7 + n * 0.3 + (line ? 0.4 : 0);
        }
      }
      ctx.putImageData(img, 0, 0);
      rough.ctx.putImageData(rimg, 0, 0);
      const normal = createCanvas(w, h);
      normal.ctx.putImageData(heightToNormal(height, w, h, 1.4), 0, 0);
      const map = toTexture(canvas, true);
      const normalMap = toTexture(normal.canvas, false);
      const roughnessMap = toTexture(rough.canvas, false);
      for (const t of [map, normalMap, roughnessMap]) t.anisotropy = this.anisotropy;
      return { map, normalMap, roughnessMap };
    });
  }

  /** Acostamento pavimentado (sem faixas). */
  shoulder(): SurfaceTextures {
    return this.memo('shoulder', () => {
      const w = Math.max(128, this.size / 4);
      const noises = makeNoises(23, [8, 32]);
      const { canvas, ctx } = createCanvas(w);
      const img = ctx.createImageData(w, w);
      const height = new Float32Array(w * w);
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const n = tileFbm(noises, [8, 32], x / w, y / w);
          const base = 70 + (n - 0.5) * 30;
          const i = (y * w + x) * 4;
          img.data[i] = base;
          img.data[i + 1] = base;
          img.data[i + 2] = base + 3;
          img.data[i + 3] = 255;
          height[y * w + x] = n;
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w);
      normal.ctx.putImageData(heightToNormal(height, w, w, 1.5), 0, 0);
      const map = toTexture(canvas, true);
      const normalMap = toTexture(normal.canvas, false);
      map.anisotropy = this.anisotropy;
      return { map, normalMap };
    });
  }

  /** Zebra vermelha e branca com relevo. */
  curb(): SurfaceTextures {
    return this.memo('curb', () => {
      const w = 128;
      const h = 256;
      const { canvas, ctx } = createCanvas(w, h);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k % 2 === 0 ? '#c4161c' : '#ecebe6';
        ctx.fillRect(0, (k * h) / 4, w, h / 4);
      }
      const noises = makeNoises(5, [16]);
      const img = ctx.getImageData(0, 0, w, h);
      const height = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = noises[0].sample((x / w) * 16, (y / h) * 16);
          const i = (y * w + x) * 4;
          img.data[i] = clamp255(img.data[i] - (n - 0.5) * 30);
          img.data[i + 1] = clamp255(img.data[i + 1] - (n - 0.5) * 30);
          img.data[i + 2] = clamp255(img.data[i + 2] - (n - 0.5) * 30);
          // Ondulação transversal (sensação de zebra).
          height[y * w + x] = Math.sin((y / h) * Math.PI * 16) * 0.5 + n * 0.2;
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w, h);
      normal.ctx.putImageData(heightToNormal(height, w, h, 3), 0, 0);
      return { map: toTexture(canvas, true), normalMap: toTexture(normal.canvas, false) };
    });
  }

  /** Grama com faixas de corte (para a área de escape). */
  grass(stripes: boolean): SurfaceTextures {
    return this.memo(`grass-${stripes}`, () => {
      const w = Math.max(256, this.size / 2);
      const noises = makeNoises(41, [4, 16, 64]);
      const blades = makeNoises(77, [128]);
      const { canvas, ctx } = createCanvas(w);
      const img = ctx.createImageData(w, w);
      const height = new Float32Array(w * w);
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / w;
          const n = tileFbm(noises, [4, 16, 64], u, v);
          const b = blades[0].sample(u * 128, v * 128 * 0.35);
          const stripe = stripes ? (v < 0.5 ? 1 : -1) * 0.06 : 0;
          const g = 0.42 + (n - 0.5) * 0.25 + (b - 0.5) * 0.18 + stripe;
          const i = (y * w + x) * 4;
          img.data[i] = clamp255(g * 120 + 18);
          img.data[i + 1] = clamp255(g * 200 + 30);
          img.data[i + 2] = clamp255(g * 70 + 10);
          img.data[i + 3] = 255;
          height[y * w + x] = b * 0.7 + n * 0.3;
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w);
      normal.ctx.putImageData(heightToNormal(height, w, w, 1.6), 0, 0);
      const map = toTexture(canvas, true);
      map.anisotropy = this.anisotropy;
      return { map, normalMap: toTexture(normal.canvas, false) };
    });
  }

  /** Terreno natural: grama + terra, usado com cores por vértice. */
  terrain(): SurfaceTextures {
    return this.memo('terrain', () => {
      const w = Math.max(256, this.size / 2);
      const noises = makeNoises(131, [4, 16, 64]);
      const { canvas, ctx } = createCanvas(w);
      const img = ctx.createImageData(w, w);
      const height = new Float32Array(w * w);
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const n = tileFbm(noises, [4, 16, 64], x / w, y / w);
          const v = 0.75 + (n - 0.5) * 0.5;
          const i = (y * w + x) * 4;
          img.data[i] = clamp255(v * 255);
          img.data[i + 1] = clamp255(v * 255);
          img.data[i + 2] = clamp255(v * 255);
          img.data[i + 3] = 255;
          height[y * w + x] = n;
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w);
      normal.ctx.putImageData(heightToNormal(height, w, w, 2.5), 0, 0);
      return { map: toTexture(canvas, true), normalMap: toTexture(normal.canvas, false) };
    });
  }

  /** Muro de concreto com juntas e faixa pintada. */
  concrete(): SurfaceTextures {
    return this.memo('concrete', () => {
      const w = 256;
      const h = 128;
      const noises = makeNoises(201, [8, 32]);
      const { canvas, ctx } = createCanvas(w, h);
      const img = ctx.createImageData(w, h);
      const height = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = tileFbm(noises, [8, 32], x / w, y / h);
          let c = 168 + (n - 0.5) * 40;
          const joint = x < 3 || x > w - 3;
          if (joint) c -= 50;
          const stripe = y > h * 0.78 ? ((Math.floor(x / (w / 4)) % 2 === 0) ? 'r' : 'w') : null;
          const i = (y * w + x) * 4;
          if (stripe === 'r') {
            img.data[i] = 178;
            img.data[i + 1] = 28;
            img.data[i + 2] = 30;
          } else if (stripe === 'w') {
            img.data[i] = 225;
            img.data[i + 1] = 225;
            img.data[i + 2] = 220;
          } else {
            img.data[i] = c;
            img.data[i + 1] = c;
            img.data[i + 2] = c - 4;
          }
          img.data[i + 3] = 255;
          height[y * w + x] = n + (joint ? -0.6 : 0);
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w, h);
      normal.ctx.putImageData(heightToNormal(height, w, h, 2), 0, 0);
      return { map: toTexture(canvas, true), normalMap: toTexture(normal.canvas, false) };
    });
  }

  /** Linha de largada quadriculada. */
  checker(): THREE.Texture {
    return this.memo('checker', () => {
      const { canvas, ctx } = createCanvas(256, 64);
      const cells = 16;
      for (let x = 0; x < cells; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#121212';
          ctx.fillRect((x * 256) / cells, (y * 64) / 4, 256 / cells, 64 / 4);
        }
      }
      return toTexture(canvas, true, false);
    });
  }

  /** Sprite suave de fumaça/poeira. */
  smoke(): THREE.Texture {
    return this.memo('smoke', () => {
      const s = 128;
      const noises = makeNoises(303, [4, 8]);
      const { canvas, ctx } = createCanvas(s);
      const img = ctx.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const dx = (x + 0.5) / s - 0.5;
          const dy = (y + 0.5) / s - 0.5;
          const r = Math.hypot(dx, dy) * 2;
          const n = tileFbm(noises, [4, 8], x / s, y / s);
          const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + n * 0.6);
          const i = (y * s + x) * 4;
          img.data[i] = 255;
          img.data[i + 1] = 255;
          img.data[i + 2] = 255;
          img.data[i + 3] = clamp255(a * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      return toTexture(canvas, true, false);
    });
  }

  /** Brilho de faísca. */
  spark(): THREE.Texture {
    return this.memo('spark', () => {
      const s = 32;
      const { canvas, ctx } = createCanvas(s);
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,220,150,0.9)');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return toTexture(canvas, true, false);
    });
  }

  /** Faixa de marca de pneu (bordas suaves). */
  tireMark(): THREE.Texture {
    return this.memo('tiremark', () => {
      const { canvas, ctx } = createCanvas(64, 16);
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.2, 'rgba(255,255,255,1)');
      g.addColorStop(0.8, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 16);
      const tex = toTexture(canvas, true, false);
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    });
  }

  /** Sombra de contato (blob) sob os carros. */
  blobShadow(): THREE.Texture {
    return this.memo('blob', () => {
      const s = 128;
      const { canvas, ctx } = createCanvas(s);
      const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return toTexture(canvas, true, false);
    });
  }

  /** Faixa publicitária com marcas fictícias. */
  banner(text: string, background: string, foreground: string): THREE.Texture {
    return this.memo(`banner-${text}-${background}`, () => {
      const { canvas, ctx } = createCanvas(512, 64);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = foreground;
      ctx.font = 'bold 40px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 34);
      return toTexture(canvas, true);
    });
  }

  /** Metal corrugado (contêineres e galpões), tingido por cor de instância. */
  corrugated(): SurfaceTextures {
    return this.memo('corrugated', () => {
      const w = 256;
      const noises = makeNoises(404, [8, 32]);
      const { canvas, ctx } = createCanvas(w);
      const img = ctx.createImageData(w, w);
      const height = new Float32Array(w * w);
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const n = tileFbm(noises, [8, 32], x / w, y / w);
          const ridge = Math.sin((x / w) * Math.PI * 2 * 16);
          const c = 200 + ridge * 18 + (n - 0.5) * 50;
          const i = (y * w + x) * 4;
          img.data[i] = clamp255(c);
          img.data[i + 1] = clamp255(c);
          img.data[i + 2] = clamp255(c);
          img.data[i + 3] = 255;
          height[y * w + x] = ridge * 0.5 + n * 0.2;
        }
      }
      ctx.putImageData(img, 0, 0);
      const normal = createCanvas(w);
      normal.ctx.putImageData(heightToNormal(height, w, w, 2.5), 0, 0);
      return { map: toTexture(canvas, true), normalMap: toTexture(normal.canvas, false) };
    });
  }

  /** Arquibancada com público estilizado (pontos coloridos). */
  crowd(): THREE.Texture {
    return this.memo('crowd', () => {
      const w = 256;
      const h = 128;
      const { canvas, ctx } = createCanvas(w, h);
      ctx.fillStyle = '#2a2d33';
      ctx.fillRect(0, 0, w, h);
      const colors = ['#d94a3d', '#f2c14e', '#3d7dd9', '#f2f2f2', '#2e8b57', '#e57f2f', '#9b59b6', '#1c1c1c'];
      let seed = 9;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let row = 0; row < 8; row++) {
        for (let k = 0; k < 40; k++) {
          if (rnd() < 0.18) continue;
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          const x = k * (w / 40) + rnd() * 2;
          const y = row * (h / 8) + 3 + rnd() * 2;
          ctx.fillRect(x, y, 4, 7);
          ctx.fillStyle = '#e0b48c';
          ctx.fillRect(x + 0.5, y - 3, 3, 3);
        }
      }
      return toTexture(canvas, true);
    });
  }

  /** Normal map para a superfície do mar. */
  waterNormal(): THREE.Texture {
    return this.memo('water', () => {
      const w = 256;
      const noises = makeNoises(505, [8, 16, 32]);
      const height = new Float32Array(w * w);
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) height[y * w + x] = tileFbm(noises, [8, 16, 32], x / w, y / w);
      const normal = createCanvas(w);
      normal.ctx.putImageData(heightToNormal(height, w, w, 4), 0, 0);
      return toTexture(normal.canvas, false);
    });
  }

  dispose(): void {
    for (const value of this.cache.values()) {
      if (value instanceof THREE.Texture) value.dispose();
      else if (value && typeof value === 'object') {
        for (const t of Object.values(value as Record<string, unknown>)) if (t instanceof THREE.Texture) t.dispose();
      }
    }
    this.cache.clear();
  }
}
