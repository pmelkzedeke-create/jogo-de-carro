/**
 * Som de motor sintetizado (provisório) controlado por RPM e carga, mais pneus, vento e terreno.
 * Perfis diferentes para 4/6/8/10 cilindros e motor elétrico. Suporta posicionamento 3D (adversários).
 */
import type { EngineSoundProfile } from '../vehicles/VehicleConfig';
import type { AudioManager } from './AudioManager';

interface ProfileConfig {
  cylinders: number;
  baseGain: number;
  rasp: number;
  filterBase: number;
  harmonics: [number, number, number];
}

const PROFILES: Record<EngineSoundProfile, ProfileConfig> = {
  i4: { cylinders: 4, baseGain: 0.16, rasp: 0.28, filterBase: 700, harmonics: [1, 0.5, 2] },
  v6: { cylinders: 6, baseGain: 0.17, rasp: 0.24, filterBase: 650, harmonics: [1, 0.5, 1.5] },
  v8: { cylinders: 8, baseGain: 0.2, rasp: 0.35, filterBase: 480, harmonics: [1, 0.5, 0.25] },
  flat6: { cylinders: 6, baseGain: 0.17, rasp: 0.3, filterBase: 720, harmonics: [1, 0.5, 1.5] },
  v10: { cylinders: 10, baseGain: 0.18, rasp: 0.3, filterBase: 820, harmonics: [1, 0.5, 2] },
  electric: { cylinders: 0, baseGain: 0.1, rasp: 0, filterBase: 2000, harmonics: [1, 2, 3] },
};

function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export interface VehicleAudioState {
  rpm: number;
  idleRpm: number;
  redlineRpm: number;
  load: number;
  speed: number;
  skid: number;
  offroad: number;
  limiter: boolean;
}

export class VehicleAudio {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly oscGains: GainNode[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly engineGain: GainNode;
  private readonly raspGain: GainNode;
  private readonly raspFilter: BiquadFilterNode;
  private readonly tireGain: GainNode;
  private readonly tireFilter: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly windGain: GainNode;
  private readonly output: GainNode;
  private readonly panner: PannerNode | null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly profile: ProfileConfig;
  private stopped = false;

  constructor(
    private readonly manager: AudioManager,
    profileId: EngineSoundProfile,
    positional: boolean,
    withEnvironment: boolean,
  ) {
    const ctx = manager.ctx!;
    this.profile = PROFILES[profileId];
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    if (positional) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = 'equalpower';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 6;
      this.panner.maxDistance = 250;
      this.panner.rolloffFactor = 1.4;
      this.output.connect(this.panner);
      this.panner.connect(manager.engineBus!);
    } else {
      this.panner = null;
      this.output.connect(manager.engineBus!);
    }

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.2;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(profileId === 'electric' ? 1.2 : 2.4);
    this.engineGain = ctx.createGain();
    shaper.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.output);

    const types: OscillatorType[] = profileId === 'electric' ? ['sine', 'sine', 'triangle'] : ['sawtooth', 'square', 'sawtooth'];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.35, 0.18][i];
      osc.connect(g);
      g.connect(shaper);
      osc.start();
      this.oscillators.push(osc);
      this.oscGains.push(g);
      this.sources.push(osc);
    }

    // Ruído de escapamento (aspereza) modulado pela carga.
    const noise = ctx.createBufferSource();
    noise.buffer = manager.noiseBuffer;
    noise.loop = true;
    this.raspFilter = ctx.createBiquadFilter();
    this.raspFilter.type = 'bandpass';
    this.raspFilter.Q.value = 0.9;
    this.raspGain = ctx.createGain();
    this.raspGain.gain.value = 0;
    noise.connect(this.raspFilter);
    this.raspFilter.connect(this.raspGain);
    this.raspGain.connect(this.engineGain);
    noise.start(0, Math.random());
    this.sources.push(noise);

    // Pneus, terreno e vento (apenas para o carro do jogador).
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.Q.value = 7;
    this.tireFilter.frequency.value = 1200;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    if (withEnvironment) {
      const tireNoise = ctx.createBufferSource();
      tireNoise.buffer = manager.noiseBuffer;
      tireNoise.loop = true;
      tireNoise.connect(this.tireFilter);
      this.tireFilter.connect(this.tireGain);
      this.tireGain.connect(manager.sfxBus!);
      tireNoise.start(0, Math.random());
      this.sources.push(tireNoise);

      const rumbleNoise = ctx.createBufferSource();
      rumbleNoise.buffer = manager.noiseBuffer;
      rumbleNoise.loop = true;
      rumbleNoise.playbackRate.value = 0.5;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.value = 260;
      rumbleNoise.connect(rumbleFilter);
      rumbleFilter.connect(this.rumbleGain);
      this.rumbleGain.connect(manager.sfxBus!);
      rumbleNoise.start(0, Math.random());
      this.sources.push(rumbleNoise);

      const windNoise = ctx.createBufferSource();
      windNoise.buffer = manager.noiseBuffer;
      windNoise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 650;
      windNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(manager.ambienceBus!);
      windNoise.start(0, Math.random());
      this.sources.push(windNoise);
    }
    this.output.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
  }

  update(state: VehicleAudioState): void {
    const ctx = this.manager.ctx;
    if (!ctx || this.stopped) return;
    const t = ctx.currentTime;
    const p = this.profile;
    const tc = 0.03;
    const rpmNorm = Math.min(1.1, state.rpm / Math.max(1, state.redlineRpm));
    if (p.cylinders > 0) {
      // Frequência de combustão de um motor 4 tempos.
      const firing = (Math.max(state.rpm, state.idleRpm) / 60) * (p.cylinders / 2);
      const base = firing * 0.5;
      for (let i = 0; i < 3; i++) this.oscillators[i].frequency.setTargetAtTime(base * p.harmonics[i], t, tc);
      this.filter.frequency.setTargetAtTime(p.filterBase + 3200 * state.load * rpmNorm + 900 * rpmNorm, t, tc);
      this.raspFilter.frequency.setTargetAtTime(400 + firing * 2.2, t, tc);
      this.raspGain.gain.setTargetAtTime(p.rasp * (0.15 + state.load * 0.85) * (0.4 + rpmNorm), t, 0.05);
      const limiterDip = state.limiter ? 0.55 : 1;
      this.engineGain.gain.setTargetAtTime(p.baseGain * (0.45 + 0.55 * state.load + 0.25 * rpmNorm) * limiterDip, t, 0.04);
    } else {
      // Elétrico: zumbido proporcional à rotação do motor.
      const whine = 120 + state.rpm * 0.32;
      for (let i = 0; i < 3; i++) this.oscillators[i].frequency.setTargetAtTime(whine * p.harmonics[i], t, tc);
      this.filter.frequency.setTargetAtTime(1800 + 3000 * rpmNorm, t, tc);
      this.engineGain.gain.setTargetAtTime(p.baseGain * (0.25 + 0.6 * state.load) * Math.min(1, 0.2 + rpmNorm * 1.5), t, 0.05);
    }

    const speedFactor = Math.min(1, state.speed / 30);
    this.tireGain.gain.setTargetAtTime(Math.min(0.5, state.skid * 0.6) * speedFactor, t, 0.05);
    this.tireFilter.frequency.setTargetAtTime(900 + state.skid * 700 + Math.sin(t * 13) * 80, t, 0.05);
    this.rumbleGain.gain.setTargetAtTime(Math.min(0.6, state.offroad * speedFactor * 0.7), t, 0.08);
    this.windGain.gain.setTargetAtTime(Math.min(0.35, (state.speed / 70) ** 2 * 0.35), t, 0.1);
  }

  setPosition(x: number, y: number, z: number): void {
    if (!this.panner || !this.manager.ctx) return;
    const t = this.manager.ctx.currentTime;
    this.panner.positionX.setTargetAtTime(x, t, 0.05);
    this.panner.positionY.setTargetAtTime(y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(z, t, 0.05);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.manager.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.output.gain.setTargetAtTime(0, t, 0.08);
    for (const src of this.sources) {
      try {
        src.stop(t + 0.4);
      } catch {
        /* já parado */
      }
    }
    setTimeout(() => {
      this.output.disconnect();
      this.panner?.disconnect();
    }, 600);
  }
}

/** Atualiza a posição/orientação do ouvinte (câmera). */
export function updateListener(manager: AudioManager, position: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }): void {
  const ctx = manager.ctx;
  if (!ctx) return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(position.x, t, 0.05);
    l.positionY.setTargetAtTime(position.y, t, 0.05);
    l.positionZ.setTargetAtTime(position.z, t, 0.05);
    l.forwardX.setTargetAtTime(forward.x, t, 0.05);
    l.forwardY.setTargetAtTime(forward.y, t, 0.05);
    l.forwardZ.setTargetAtTime(forward.z, t, 0.05);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }
}
