/**
 * Gerenciador de áudio (Web Audio API).
 * - O AudioContext só é criado/retomado após um gesto do usuário (política de autoplay).
 * - Barramentos com volume independente: geral, motor, efeitos, interface e ambiente.
 * - Todos os sons atuais são SINTETIZADOS e PROVISÓRIOS; o manifesto lista os arquivos esperados
 *   em public/assets/audio para substituição futura por gravações reais licenciadas.
 */
import type { Settings } from '../persistence/SaveSchema';

export type UiSound = 'hover' | 'click' | 'confirm' | 'back' | 'error' | 'purchase' | 'toggle';

/** Arquivos de áudio esperados (ainda não fornecidos — o jogo usa síntese procedural). */
export const AUDIO_MANIFEST: ReadonlyArray<{ id: string; file: string; description: string }> = [
  { id: 'engine-i4', file: 'engines/i4-loop.ogg', description: 'Motor 4 cilindros (loops por faixa de RPM)' },
  { id: 'engine-v6', file: 'engines/v6-loop.ogg', description: 'Motor V6' },
  { id: 'engine-v8', file: 'engines/v8-loop.ogg', description: 'Motor V8' },
  { id: 'engine-v10', file: 'engines/v10-loop.ogg', description: 'Motor V10' },
  { id: 'engine-ev', file: 'engines/electric-loop.ogg', description: 'Motor elétrico' },
  { id: 'tire-squeal', file: 'sfx/tire-squeal.ogg', description: 'Pneus derrapando' },
  { id: 'impact', file: 'sfx/impact.ogg', description: 'Colisões' },
  { id: 'gear-shift', file: 'sfx/gear-shift.ogg', description: 'Troca de marcha' },
  { id: 'ambience', file: 'ambience/track.ogg', description: 'Ambiente da pista' },
  { id: 'ui', file: 'ui/click.ogg', description: 'Sons de interface' },
];

export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engineBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  uiBus: GainNode | null = null;
  ambienceBus: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;
  private settings: Settings['audio'];
  private suspendedByGame = false;
  readonly supported: boolean;

  constructor(settings: Settings['audio']) {
    this.settings = settings;
    this.supported = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state !== 'closed';
  }

  /** Deve ser chamado dentro de um manipulador de gesto do usuário (clique/tecla/toque). */
  unlock(): void {
    if (!this.supported) return;
    if (!this.ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      this.master.connect(compressor);
      compressor.connect(ctx.destination);
      this.engineBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.uiBus = ctx.createGain();
      this.ambienceBus = ctx.createGain();
      for (const bus of [this.engineBus, this.sfxBus, this.uiBus, this.ambienceBus]) bus.connect(this.master);
      this.noiseBuffer = this.createNoise(2);
      this.applySettings(this.settings);
    }
    if (this.ctx.state === 'suspended' && !this.suspendedByGame) void this.ctx.resume();
  }

  private createNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  applySettings(settings: Settings['audio']): void {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(settings.master, t, 0.05);
    this.engineBus!.gain.setTargetAtTime(settings.engine * 0.9, t, 0.05);
    this.sfxBus!.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.uiBus!.gain.setTargetAtTime(settings.ui * 0.6, t, 0.05);
    this.ambienceBus!.gain.setTargetAtTime(settings.ambience * 0.7, t, 0.05);
  }

  /** Pausa todo o áudio (pausa do jogo, aba oculta). */
  setPaused(paused: boolean): void {
    this.suspendedByGame = paused;
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    if (!paused && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Abafa motor/efeitos (menus de pausa) mantendo a interface audível. */
  duck(active: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineBus!.gain.setTargetAtTime(active ? this.settings.engine * 0.15 : this.settings.engine * 0.9, t, 0.08);
    this.sfxBus!.gain.setTargetAtTime(active ? this.settings.sfx * 0.2 : this.settings.sfx, t, 0.08);
  }

  private envelopeTone(bus: GainNode, type: OscillatorType, freq: number, duration: number, volume: number, endFreq?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  playUi(sound: UiSound): void {
    if (!this.ctx || !this.uiBus || this.ctx.state !== 'running') return;
    switch (sound) {
      case 'hover':
        this.envelopeTone(this.uiBus, 'sine', 1400, 0.05, 0.05);
        break;
      case 'click':
      case 'toggle':
        this.envelopeTone(this.uiBus, 'triangle', 900, 0.07, 0.12, 1200);
        break;
      case 'confirm':
        this.envelopeTone(this.uiBus, 'triangle', 660, 0.1, 0.14);
        this.envelopeTone(this.uiBus, 'triangle', 990, 0.16, 0.14, undefined, 0.07);
        break;
      case 'back':
        this.envelopeTone(this.uiBus, 'triangle', 700, 0.1, 0.12, 450);
        break;
      case 'error':
        this.envelopeTone(this.uiBus, 'square', 220, 0.18, 0.08, 180);
        break;
      case 'purchase':
        [660, 880, 1320].forEach((f, i) => this.envelopeTone(this.uiBus!, 'triangle', f, 0.16, 0.13, undefined, i * 0.08));
        break;
    }
  }

  playCountdown(go: boolean): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    this.envelopeTone(this.sfxBus, 'sine', go ? 1320 : 660, go ? 0.55 : 0.18, 0.25);
  }

  playLap(best: boolean): void {
    if (!this.ctx || !this.uiBus || this.ctx.state !== 'running') return;
    const notes = best ? [880, 1108, 1320] : [784, 988];
    notes.forEach((f, i) => this.envelopeTone(this.uiBus!, 'sine', f, 0.22, 0.16, undefined, i * 0.1));
  }

  playImpact(intensity: number): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.min(0.9, 0.08 + intensity * 0.045);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.6 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900 + Math.min(4000, intensity * 250), t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + Math.min(0.5, intensity * 0.03));
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.9);
    // Baque grave.
    this.envelopeTone(this.sfxBus, 'sine', 90, 0.25, vol * 0.8, 40);
    if (intensity > 6) {
      // Rangido metálico em batidas fortes.
      this.envelopeTone(this.sfxBus, 'sawtooth', 340, 0.3, vol * 0.15, 180);
    }
  }

  playShift(): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    this.envelopeTone(this.sfxBus, 'square', 160, 0.05, 0.05, 90);
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
