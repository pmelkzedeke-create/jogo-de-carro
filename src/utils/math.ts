/**
 * Funções matemáticas puras, sem dependência de renderização.
 * Usadas pela física, IA, câmera e interface.
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const GRAVITY = 9.81;
export const MS_TO_KMH = 3.6;
export const MS_TO_MPH = 2.2369363;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

export function remapClamped(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, clamp01(inverseLerp(inMin, inMax, value)));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Suavização exponencial independente da taxa de quadros.
 * `lambda` é a "rigidez" (1/s): quanto maior, mais rápido converge.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Fator de suavização exponencial para um passo `dt`. */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Módulo sempre positivo (útil para distâncias em pistas fechadas). */
export function wrap(value: number, length: number): number {
  if (length <= 0) return value;
  const r = value % length;
  return r < 0 ? r + length : r;
}

/** Diferença assinada mínima entre dois valores em um domínio circular de comprimento `length`. */
export function wrappedDelta(from: number, to: number, length: number): number {
  let d = wrap(to - from, length);
  if (d > length / 2) d -= length;
  return d;
}

/** Normaliza um ângulo para o intervalo (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

export function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/**
 * Interpolação linear em uma tabela de pontos [x, y] ordenada por x.
 * Valores fora do intervalo são limitados às extremidades.
 */
export function sampleCurve(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return last[1];
}

/** Média ponderada simples para suavizar ruído em telemetria. */
export class RollingAverage {
  private readonly values: number[];
  private index = 0;
  private filled = 0;
  private sum = 0;

  constructor(private readonly size: number) {
    this.values = new Array<number>(size).fill(0);
  }

  push(value: number): number {
    this.sum -= this.values[this.index];
    this.values[this.index] = value;
    this.sum += value;
    this.index = (this.index + 1) % this.size;
    this.filled = Math.min(this.filled + 1, this.size);
    return this.average;
  }

  get average(): number {
    return this.filled === 0 ? 0 : this.sum / this.filled;
  }

  reset(): void {
    this.values.fill(0);
    this.index = 0;
    this.filled = 0;
    this.sum = 0;
  }
}
