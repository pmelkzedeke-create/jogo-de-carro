/**
 * Orquestrador do jogo (independente da interface React).
 * Responsável por: renderer, áudio, entrada, garagem/menu 3D, preparo de pistas, sessão de corrida,
 * passo fixo, pausa, ciclo de vida da página e dados do HUD.
 */
import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { GarageScene } from '../garage/GarageScene';
import { InputManager } from '../input/InputManager';
import type { CameraView, Settings } from '../persistence/SaveSchema';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../physics/rapier';
import { buildRaceResults } from '../racing/RaceRewards';
import { RaceSession, type RacePhase } from '../racing/RaceSession';
import { MODES, type RaceConfig, type RaceResults } from '../racing/RaceTypes';
import { CAMERA_LABELS } from '../rendering/CameraRig';
import { MaterialLibrary } from '../rendering/Materials';
import { TextureLibrary } from '../rendering/ProceduralTextures';
import { RaceView } from '../rendering/RaceView';
import { Renderer } from '../rendering/Renderer';
import { VehicleMaterials } from '../rendering/VehicleModelFactory';
import { VehicleAssetLoader, type LoadedVehicleAsset } from '../rendering/VehicleAssetLoader';
import type { Track } from '../tracks/Track';
import { buildTrack } from '../tracks/TrackBuilder';
import { getTrackDefinition } from '../tracks/TrackCatalog';
import { buildTrackColliders, buildTrackRibbons, type TrackPhysics, type TrackRibbons } from '../tracks/TrackColliders';
import { buildTerrain, type TerrainData } from '../tracks/Terrain';
import { TypedEmitter } from '../utils/events';
import { formatTime } from '../utils/format';
import { assistLevelValue } from '../vehicles/VehicleController';
import { getPaint, getVehicle } from '../vehicles/VehicleCatalog';
import { FixedTimestep } from './FixedTimestep';
import { GameLoop } from './GameLoop';
import { createHudData, type HudData } from './HudData';

export type LoadStatus = 'pending' | 'active' | 'done' | 'error';

export interface LoadStep {
  id: string;
  label: string;
  status: LoadStatus;
  detail?: string;
}

export type ProgressCallback = (steps: LoadStep[]) => void;

export type MessageKind = 'info' | 'good' | 'warn' | 'bad' | 'drift';

export interface GameEvents {
  message: { text: string; kind: MessageKind; key?: string; duration?: number };
  raceFinished: { results: RaceResults };
  raceComplete: { results: RaceResults };
  pauseRequested: Record<string, never>;
  contextLost: { lost: boolean };
  gamepad: { connected: boolean; id: string };
  phase: { phase: RacePhase };
  cameraChanged: { view: CameraView };
}

interface PreparedTrack {
  track: Track;
  ribbons: TrackRibbons;
  terrain: TerrainData;
}

interface ActiveRace {
  config: RaceConfig;
  physics: PhysicsWorld;
  trackPhysics: TrackPhysics;
  session: RaceSession;
  view: RaceView;
  prepared: PreparedTrack;
  finishedResults: RaceResults | null;
  personalBest: number | null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export class Game {
  readonly events = new TypedEmitter<GameEvents>();
  readonly hud: HudData = createHudData();
  readonly renderer: Renderer;
  readonly audio: AudioManager;
  readonly input: InputManager;
  readonly textures: TextureLibrary;
  readonly materials: MaterialLibrary;
  readonly vehicleMaterials: VehicleMaterials;
  readonly garage: GarageScene;
  readonly assets: VehicleAssetLoader;
  readonly loop: GameLoop;
  readonly stepper = new FixedTimestep(1 / 120, 8);
  settings: Settings;
  state: 'menu' | 'loading' | 'race' = 'menu';
  paused = false;
  timeScale = 1;
  /** Para testes: IA pilota o carro do jogador. */
  autopilot = false;
  race: ActiveRace | null = null;
  private readonly R: RapierModule;
  private readonly trackCache = new Map<string, PreparedTrack>();
  private readonly listeners: Array<() => void> = [];
  private minimapBounds = { minX: 0, minZ: 0, size: 1 };
  private lastRender = 0;
  private hiddenPaused = false;

  static async create(container: HTMLElement, settings: Settings, onProgress?: ProgressCallback): Promise<Game> {
    const steps: LoadStep[] = [
      { id: 'physics', label: 'Inicializando física (Rapier/WebAssembly)', status: 'pending' },
      { id: 'renderer', label: 'Criando renderizador WebGL2', status: 'pending' },
      { id: 'textures', label: 'Gerando texturas procedurais', status: 'pending' },
      { id: 'garage', label: 'Preparando garagem 3D', status: 'pending' },
    ];
    const set = (id: string, status: LoadStatus, detail?: string) => {
      const step = steps.find((s) => s.id === id)!;
      step.status = status;
      step.detail = detail;
      onProgress?.(steps.map((s) => ({ ...s })));
    };
    set('physics', 'active');
    let R: RapierModule;
    try {
      R = await loadRapier();
      set('physics', 'done');
    } catch (error) {
      set('physics', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
    await nextFrame();
    set('renderer', 'active');
    const renderer = new Renderer(container, settings.graphics);
    set('renderer', 'done');
    await nextFrame();
    set('textures', 'active');
    const textureSize = settings.graphics.preset === 'low' ? 512 : 1024;
    const textures = new TextureLibrary(textureSize, Math.min(8, renderer.maxAnisotropy));
    textures.asphalt();
    await nextFrame();
    textures.grass(true);
    textures.terrain();
    textures.curb();
    await nextFrame();
    set('textures', 'done');
    set('garage', 'active');
    const game = new Game(R, renderer, textures, settings);
    set('garage', 'done');
    return game;
  }

  private constructor(R: RapierModule, renderer: Renderer, textures: TextureLibrary, settings: Settings) {
    this.R = R;
    this.renderer = renderer;
    this.textures = textures;
    this.settings = settings;
    this.materials = new MaterialLibrary(textures);
    this.vehicleMaterials = new VehicleMaterials();
    this.audio = new AudioManager(settings.audio);
    this.input = new InputManager(window);
    this.input.gamepadDeadzone = settings.controls.gamepadDeadzone;
    this.input.onGamepadChange = (connected, id) => this.events.emit('gamepad', { connected, id });
    this.assets = new VehicleAssetLoader(renderer.renderer);
    this.garage = new GarageScene(renderer.renderer, this.vehicleMaterials);
    this.garage.resize(renderer.aspect);
    this.loop = new GameLoop((dt) => this.frame(dt));
    this.loop.fpsLimit = settings.graphics.fpsLimit;

    renderer.onContextLost = () => {
      if (this.state === 'race' && !this.paused) {
        this.setPaused(true);
        this.events.emit('pauseRequested', {});
      }
      this.events.emit('contextLost', { lost: true });
    };
    renderer.onContextRestored = () => this.events.emit('contextLost', { lost: false });

    const onVisibility = () => {
      if (document.hidden) {
        if (this.state === 'race' && !this.paused) {
          this.setPaused(true);
          this.events.emit('pauseRequested', {});
        }
        this.hiddenPaused = true;
        this.audio.setPaused(true);
        this.loop.stop();
      } else if (this.hiddenPaused) {
        this.hiddenPaused = false;
        this.audio.setPaused(false);
        this.stepper.accumulator = 0;
        this.loop.start();
      }
    };
    const onBlur = () => {
      if (this.settings.gameplay.autoPause && this.state === 'race' && !this.paused && this.race?.session.phase !== 'intro') {
        this.setPaused(true);
        this.events.emit('pauseRequested', {});
      }
    };
    const onResize = () => this.handleResize();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    this.listeners.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('resize', onResize),
    );
    this.input.enabled = false;
    this.loop.start();
  }

  private handleResize(): void {
    this.renderer.resize();
    this.garage.resize(this.renderer.aspect);
    this.race?.view.resize(this.renderer.aspect);
  }

  // ---------------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------------

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.renderer.applyGraphics(settings.graphics);
    this.audio.applySettings(settings.audio);
    this.input.gamepadDeadzone = settings.controls.gamepadDeadzone;
    this.loop.fpsLimit = settings.graphics.fpsLimit;
    if (this.race) {
      this.race.view.applySettings(settings);
      this.race.session.player.vehicle.assistLevel = assistLevelValue(settings.controls.assist);
    }
    this.handleResize();
  }

  // ---------------------------------------------------------------------------
  // Garagem / menu
  // ---------------------------------------------------------------------------

  /**
   * Mostra um carro na garagem/menu. Exibe o modelo procedural imediatamente e troca para o GLB
   * assim que ele termina de carregar (se houver); falhas são informadas, nunca silenciosas.
   */
  showVehicle(vehicleId: string, paintId: string): void {
    const def = getVehicle(vehicleId);
    const paint = getPaint(def, paintId);
    if (!def.visual.gltf) {
      this.garage.setVehicle(def, paint, null);
      return;
    }
    if (this.garage.currentVehicleId !== def.id) this.garage.setVehicle(def, paint, null);
    else this.garage.setPaint(paint);
    void this.assets.load(def).then((result) => {
      if (this.garage.currentVehicleId !== def.id) return;
      if (result.status === 'loaded') this.garage.setVehicle(def, getPaint(def, paintId), result.asset);
      else if (result.status === 'failed') this.events.emit('message', { text: `Modelo 3D de ${def.name} indisponível — usando modelo provisório`, kind: 'warn', key: 'asset', duration: 3500 });
    });
  }

  setGarageMode(mode: 'menu' | 'garage', controls: HTMLElement | null): void {
    this.garage.setMode(mode);
    if (controls) this.garage.attachControls(controls);
    else this.garage.detachControls();
  }

  // ---------------------------------------------------------------------------
  // Corrida
  // ---------------------------------------------------------------------------

  private prepareTrack(trackId: string): PreparedTrack {
    let prepared = this.trackCache.get(trackId);
    if (!prepared) {
      const track = buildTrack(getTrackDefinition(trackId));
      prepared = { track, ribbons: buildTrackRibbons(track), terrain: buildTerrain(track) };
      // Mantém apenas a última pista em cache (memória).
      this.trackCache.clear();
      this.trackCache.set(trackId, prepared);
    }
    return prepared;
  }

  async startRace(config: RaceConfig, onProgress?: ProgressCallback, personalBest: number | null = null): Promise<void> {
    if (this.race) this.exitRace();
    this.state = 'loading';
    const steps: LoadStep[] = [
      { id: 'models', label: 'Carregando modelos 3D dos carros', status: 'pending' },
      { id: 'track', label: 'Construindo pista e terreno', status: 'pending' },
      { id: 'physics', label: 'Criando colisores físicos', status: 'pending' },
      { id: 'cars', label: 'Preparando carros e pilotos', status: 'pending' },
      { id: 'scene', label: 'Montando cenário', status: 'pending' },
      { id: 'shaders', label: 'Compilando shaders', status: 'pending' },
    ];
    const set = (id: string, status: LoadStatus, detail?: string) => {
      const step = steps.find((s) => s.id === id)!;
      step.status = status;
      step.detail = detail;
      onProgress?.(steps.map((s) => ({ ...s })));
    };
    let physics: PhysicsWorld | null = null;
    let session: RaceSession | null = null;
    let view: RaceView | null = null;
    let current = 'models';
    try {
      set('models', 'active');
      const assets = new Map<string, LoadedVehicleAsset>();
      const vehicleIds = [...new Set([config.player.vehicleId, ...config.opponents.map((o) => o.vehicleId)])];
      const withModel = vehicleIds.map(getVehicle).filter((d) => d.visual.gltf);
      let failed = 0;
      for (const def of withModel) {
        const result = await this.assets.load(def, (fraction) => set('models', 'active', fraction === null ? def.name : `${def.name} ${Math.round(fraction * 100)}%`));
        if (result.status === 'loaded') assets.set(def.id, result.asset);
        else if (result.status === 'failed') {
          failed++;
          this.events.emit('message', { text: `Modelo 3D de ${def.name} indisponível — usando modelo provisório`, kind: 'warn', key: `asset-${def.id}`, duration: 4000 });
        }
      }
      set('models', 'done', withModel.length === 0 ? 'modelos procedurais' : `${assets.size} GLB${failed ? `, ${failed} com falha (provisório)` : ''}`);
      current = 'track';
      set('track', 'active', getTrackDefinition(config.trackId).name);
      await nextFrame();
      const prepared = this.prepareTrack(config.trackId);
      set('track', 'done', `${(prepared.track.length / 1000).toFixed(2)} km`);
      current = 'physics';
      set('physics', 'active');
      await nextFrame();
      physics = new PhysicsWorld(this.R, 1 / 120);
      const trackPhysics = buildTrackColliders(physics, prepared.track, prepared.ribbons, prepared.terrain);
      set('physics', 'done', `${trackPhysics.colliders.length} colisores`);
      current = 'cars';
      set('cars', 'active');
      await nextFrame();
      session = new RaceSession({
        physics,
        track: prepared.track,
        config,
        controllerSettings: () => ({ steeringSensitivity: this.settings.controls.steeringSensitivity, assist: assistLevelValue(this.settings.controls.assist) }),
        input: () => (this.paused ? null : this.input.state),
        playerAutopilot: this.autopilot,
      });
      set('cars', 'done', `${session.racers.length} ${session.racers.length === 1 ? 'carro' : 'carros'}`);
      current = 'scene';
      set('scene', 'active');
      await nextFrame();
      view = new RaceView(session, prepared.ribbons, prepared.terrain, {
        renderer: this.renderer,
        textures: this.textures,
        materials: this.materials,
        vehicleMaterials: this.vehicleMaterials,
        audio: this.audio,
        settings: this.settings,
        assets,
      });
      set('scene', 'done');
      current = 'shaders';
      set('shaders', 'active');
      await nextFrame();
      await this.renderer.precompile(view.scene, view.camera);
      set('shaders', 'done');
      this.race = { config, physics, trackPhysics, session, view, prepared, finishedResults: null, personalBest };
      this.setupMinimap(prepared.track);
      this.bindSessionEvents(session);
      this.stepper.reset();
      this.paused = false;
      this.timeScale = 1;
      this.input.enabled = true;
      this.input.consumeActions();
      this.audio.duck(false);
      this.state = 'race';
      this.hud.active = true;
    } catch (error) {
      set(current, 'error', error instanceof Error ? error.message : String(error));
      view?.dispose();
      session?.dispose();
      physics?.dispose();
      this.state = 'menu';
      throw error;
    }
  }

  private bindSessionEvents(session: RaceSession): void {
    const emit = (text: string, kind: MessageKind = 'info', key?: string, duration?: number) => this.events.emit('message', { text, kind, key, duration });
    session.events.on('phase', (e) => this.events.emit('phase', { phase: e.phase }));
    session.events.on('lap', (e) => {
      if (!e.racer.isPlayer) return;
      const best = e.isBest && e.lap > 1 ? ' — melhor volta!' : '';
      emit(`Volta ${e.lap}: ${formatTime(e.lapTime)}${best}`, e.isBest ? 'good' : 'info', 'lap', 3200);
    });
    session.events.on('start', (e) => {
      if (e.racer.isPlayer && MODES[session.config.mode].timing === 'firstCrossing') emit('Cronômetro iniciado', 'info', 'lap', 1800);
    });
    session.events.on('wrongWay', (e) => {
      if (e.racer.isPlayer && e.active) emit('Contramão! Dê meia-volta', 'bad', 'wrongway', 2500);
    });
    session.events.on('missedCheckpoint', (e) => {
      if (e.racer.isPlayer && e.active) emit('Checkpoint não registrado — volte ou pressione R', 'warn', 'checkpoint', 3500);
    });
    session.events.on('recovered', (e) => {
      if (e.racer.isPlayer) emit(e.automatic ? 'Carro recuperado automaticamente' : 'Carro recuperado', 'info', 'recover', 1800);
    });
    session.events.on('positionChange', (e) => {
      if (session.phase !== 'racing' || !MODES[session.config.mode].hasOpponents) return;
      if (e.to < e.from) emit(`Você subiu para ${e.to}º`, 'good', 'position', 1600);
      else emit(`Você caiu para ${e.to}º`, 'bad', 'position', 1600);
    });
    session.events.on('drift', (e) => {
      if (e.event.type === 'chainBanked' && e.event.points >= 100) emit(`Drift +${e.event.points.toLocaleString('pt-BR')}`, 'drift', 'drift', 1800);
      if (e.event.type === 'chainLost' && e.event.points >= 200) emit(`Drift perdido (${e.event.reason})`, 'bad', 'drift', 1800);
    });
    session.events.on('timeUp', () => emit('Tempo esgotado!', 'warn', 'lap', 2500));
    session.events.on('finish', (e) => {
      if (!e.racer.isPlayer || !this.race) return;
      const results = buildRaceResults(session, session.track.definition.name, this.race.personalBest);
      this.race.finishedResults = results;
      this.events.emit('raceFinished', { results });
    });
    session.events.on('complete', () => {
      if (!this.race) return;
      const results = buildRaceResults(session, session.track.definition.name, this.race.personalBest);
      // Mantém recompensas/identificador calculados na chegada do jogador.
      if (this.race.finishedResults) {
        results.rewards = this.race.finishedResults.rewards;
        results.resultId = this.race.finishedResults.resultId;
      }
      this.race.finishedResults = results;
      this.timeScale = 1;
      this.events.emit('raceComplete', { results });
    });
  }

  private setupMinimap(track: Track): void {
    const b = track.bounds;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.minimapBounds = { minX: (b.minX + b.maxX) / 2 - size / 2, minZ: (b.minZ + b.maxZ) / 2 - size / 2, size };
  }

  /** Caminho SVG normalizado (0..100) do traçado, para o minimapa. */
  minimapPath(): string {
    if (!this.race) return '';
    const track = this.race.prepared.track;
    const S = track.samples;
    const { minX, minZ, size } = this.minimapBounds;
    const parts: string[] = [];
    for (let i = 0; i < S.count; i += 6) {
      const x = ((S.px[i] - minX) / size) * 100;
      const y = ((S.pz[i] - minZ) / size) * 100;
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    if (track.closed) parts.push('Z');
    return parts.join(' ');
  }

  setPaused(paused: boolean): void {
    if (this.state !== 'race') return;
    this.paused = paused;
    this.input.enabled = !paused;
    this.input.clear();
    this.input.consumeActions();
    this.audio.duck(paused);
    this.stepper.accumulator = 0;
  }

  restartRace(): void {
    if (!this.race) return;
    this.race.session.restart();
    this.race.view.resetEffects();
    this.race.finishedResults = null;
    this.stepper.reset();
    this.timeScale = 1;
    this.setPaused(false);
    this.events.emit('message', { text: 'Corrida reiniciada', kind: 'info', key: 'restart', duration: 1500 });
  }

  exitRace(): void {
    if (!this.race) return;
    const { view, session, physics, trackPhysics } = this.race;
    view.dispose();
    session.dispose();
    trackPhysics.dispose();
    physics.dispose();
    this.race = null;
    this.state = 'menu';
    this.paused = false;
    this.timeScale = 1;
    this.input.enabled = false;
    this.input.clear();
    this.hud.active = false;
    this.audio.duck(false);
    this.renderer.renderer.toneMappingExposure = 0.9;
  }

  /** Acelera a simulação (resultados: concluir a corrida dos adversários). */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(1, Math.min(8, scale));
  }

  cycleCamera(): void {
    if (!this.race) return;
    const view = this.race.view.cameraRig.cycleView();
    this.events.emit('cameraChanged', { view });
    this.events.emit('message', { text: `Câmera: ${CAMERA_LABELS[view]}`, kind: 'info', key: 'camera', duration: 1200 });
  }

  requestRecovery(): void {
    if (!this.race || this.paused) return;
    if (!this.race.session.requestPlayerRecovery()) {
      this.events.emit('message', { text: 'Aguarde para recuperar novamente', kind: 'warn', key: 'recover', duration: 1000 });
    }
  }

  // ---------------------------------------------------------------------------
  // Quadro
  // ---------------------------------------------------------------------------

  private frame(dt: number): void {
    if (this.state === 'race' && this.race) {
      this.raceFrame(dt, this.race);
    } else {
      this.garage.update(dt);
      this.renderer.render(this.garage.scene, this.garage.camera);
    }
    this.hud.fps = this.loop.fps;
    this.hud.frameMs = this.loop.frameMs;
    const stats = this.renderer.stats();
    this.hud.drawCalls = stats.drawCalls;
    this.hud.triangles = stats.triangles;
  }

  private raceFrame(dt: number, race: ActiveRace): void {
    const session = race.session;
    this.input.poll();
    for (const action of this.input.consumeActions()) {
      if (action === 'pause') {
        if (!this.paused) {
          this.setPaused(true);
          this.events.emit('pauseRequested', {});
        }
      } else if (this.paused) {
        continue;
      } else if (action === 'camera') {
        this.cycleCamera();
      } else if (action === 'recover') {
        this.requestRecovery();
      } else if (action === 'restart') {
        this.restartRace();
      }
    }

    let physicsMs = 0;
    if (!this.paused) {
      if (session.phase === 'intro') {
        const s = this.input.state;
        if (s.throttle > 0 || s.brake > 0 || Math.abs(s.steer) > 0 || s.handbrake > 0) session.skipIntro();
      }
      const steps = this.stepper.advance(dt, this.timeScale);
      const t0 = performance.now();
      for (let i = 0; i < steps; i++) session.step(this.stepper.step);
      physicsMs = performance.now() - t0;
    } else {
      // Pausado: renderiza com frequência reduzida (economia de GPU/bateria).
      const now = performance.now();
      if (now - this.lastRender < 100) return;
      this.lastRender = now;
    }
    this.hud.physicsMs = this.hud.physicsMs * 0.9 + physicsMs * 0.1;
    race.view.update(dt, this.stepper.alpha, this.paused);
    this.updateHud(race);
    this.renderer.render(race.view.scene, race.view.camera);
  }

  private updateHud(race: ActiveRace): void {
    const hud = this.hud;
    const session = race.session;
    const player = session.player;
    const v = player.vehicle;
    const mode = MODES[session.config.mode];
    hud.mode = session.config.mode;
    hud.phase = session.phase;
    hud.countdown = session.countdownValue;
    hud.speed = Math.abs(v.forwardSpeed);
    hud.rpm = v.drivetrain.rpm;
    hud.redline = v.phys.spec.engine.redlineRpm;
    hud.limiter = v.phys.spec.engine.limiterRpm;
    hud.gear = session.phase === 'racing' || session.phase === 'finished' ? (v.drivetrain.gear < 0 ? 'R' : String(v.drivetrain.gear)) : 'N';
    hud.shifting = v.drivetrain.isShifting;
    hud.infiniteLaps = !mode.hasFinish;
    hud.totalLaps = player.lap.totalLaps;
    hud.lap = player.lap.currentLap;
    hud.lapTime = player.lap.currentLapTime(session.raceTime);
    hud.lastLap = player.lap.lapTimes.length ? player.lap.lapTimes[player.lap.lapTimes.length - 1] : null;
    hud.bestLap = player.lap.bestLap;
    hud.personalBest = race.personalBest;
    hud.totalTime = session.raceTime;
    hud.position = player.position;
    hud.racers = session.racers.length;
    const track = session.track;
    hud.progress = track.closed
      ? Math.max(0, Math.min(1, player.progress / (track.raceLength * player.lap.totalLaps)))
      : Math.max(0, Math.min(1, player.progress / track.raceLength));
    if (!mode.hasFinish) hud.progress = Math.max(0, track.raceDistance(player.projection.s) / track.raceLength);
    hud.wrongWay = player.wrongWay;
    hud.missedCheckpoint = player.missedCheckpoint;
    hud.ghost = v.ghost;
    hud.driftActive = player.drift.active;
    hud.driftChain = player.drift.chainValue;
    hud.driftMultiplier = player.drift.multiplier;
    hud.driftTotal = player.drift.total;
    hud.timeLeft = session.config.timeLimit ? Math.max(0, session.config.timeLimit - session.raceTime) : null;
    hud.finished = player.finished;
    const { minX, minZ, size } = this.minimapBounds;
    const racers = session.racers;
    if (hud.minimap.length < racers.length * 2) hud.minimap = new Float32Array(racers.length * 2);
    if (hud.rivalMask.length < racers.length) hud.rivalMask = new Uint8Array(racers.length);
    for (let i = 0; i < racers.length; i++) {
      const p = race.view.views.get(racers[i].id)?.position ?? racers[i].vehicle.position;
      hud.minimap[i * 2] = (p.x - minX) / size;
      hud.minimap[i * 2 + 1] = (p.z - minZ) / size;
      hud.rivalMask[i] = racers[i].rival ? 1 : 0;
      if (racers[i] === player) hud.playerIndex = i;
    }
    hud.minimapCount = racers.length;
  }

  /** Estado resumido para depuração/testes automatizados. */
  debugState() {
    const race = this.race;
    if (!race) return { state: this.state, paused: this.paused };
    const p = race.session.player;
    return {
      state: this.state,
      paused: this.paused,
      phase: race.session.phase,
      raceTime: race.session.raceTime,
      speedKmh: Math.abs(p.vehicle.forwardSpeed) * 3.6,
      gear: p.vehicle.drivetrain.gear,
      lap: p.lap.currentLap,
      lapsCompleted: p.lap.lapsCompleted,
      progress: p.lap.progress,
      position: p.position,
      finished: p.finished,
      complete: race.session.complete,
      racers: race.session.racers.length,
      recoveries: p.recoveries,
      lateral: p.projection.lateral,
      fps: this.loop.fps,
      drawCalls: this.hud.drawCalls,
      triangles: this.hud.triangles,
      physicsMs: this.hud.physicsMs,
    };
  }

  /** Acesso para testes: vetor de posição do jogador. */
  get playerPosition(): THREE.Vector3 | null {
    return this.race?.session.player.vehicle.position ?? null;
  }

  dispose(): void {
    this.exitRace();
    this.loop.stop();
    for (const off of this.listeners) off();
    this.input.dispose();
    this.audio.dispose();
    this.garage.dispose();
    this.assets.dispose();
    this.materials.dispose();
    this.vehicleMaterials.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    this.events.clear();
  }
}
