import { MS_TO_KMH, MS_TO_MPH } from './math';

export type SpeedUnit = 'kmh' | 'mph';

/** Formata um tempo em segundos como m:ss.mmm (ou --:--.--- quando inexistente). */
export function formatTime(seconds: number | null | undefined, placeholder = '--:--.---'): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return placeholder;
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/** Diferença de tempo com sinal: +1.234 / -0.512. */
export function formatGap(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const sign = seconds >= 0 ? '+' : '−';
  const abs = Math.abs(seconds);
  if (abs >= 60) return `${sign}${formatTime(abs)}`;
  return `${sign}${abs.toFixed(3)}`;
}

export function convertSpeed(metersPerSecond: number, unit: SpeedUnit): number {
  return metersPerSecond * (unit === 'kmh' ? MS_TO_KMH : MS_TO_MPH);
}

export function speedUnitLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'mph';
}

export function formatCredits(value: number): string {
  return `${Math.round(value).toLocaleString('pt-BR')} CR`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
  return `${Math.round(meters)} m`;
}

export function ordinal(position: number): string {
  return `${position}º`;
}
