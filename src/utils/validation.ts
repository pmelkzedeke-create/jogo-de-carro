/**
 * Utilitários de validação para dados vindos do armazenamento local ou de arquivos.
 * Nunca confiamos cegamente no conteúdo salvo: tudo é verificado e normalizado.
 */

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readNumber(source: UnknownRecord, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const value = source[key];
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function readInteger(source: UnknownRecord, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  return Math.round(readNumber(source, key, fallback, min, max));
}

export function readString(source: UnknownRecord, key: string, fallback: string, maxLength = 200): string {
  const value = source[key];
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

export function readBoolean(source: UnknownRecord, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readEnum<T extends string>(source: UnknownRecord, key: string, allowed: readonly T[], fallback: T): T {
  const value = source[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function readStringArray(source: UnknownRecord, key: string, maxItems = 1000): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, maxItems);
}

export function readRecord(source: UnknownRecord, key: string): UnknownRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

export function readOptionalNumber(source: UnknownRecord, key: string, min = -Infinity, max = Infinity): number | null {
  const value = source[key];
  if (!isFiniteNumber(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Valida cores hexadecimais no formato #rrggbb. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
