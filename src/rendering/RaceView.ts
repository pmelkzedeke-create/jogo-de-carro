/**
 * Cena visual de uma sessão de corrida: ambiente, pista, carros, cones, efeitos e câmera.
 * Lê o estado da simulação (nunca o altera) e interpola entre passos fixos.
 */
import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import { updateListener, VehicleAudio } from '../audio/VehicleAudio';
import type { Settings } from '../persistence/SaveSchema';
import { SURFACES } from '../physics/Surfaces';
import type { Racer } from '../racing/Racer';
import type { RaceSession } from '../racing/RaceSession';
import type { TrackRibbons } from '../tracks/TrackColliders';
import type { TerrainData } from '../tracks/Terrain';
import { getPaint } from '../vehicles/VehicleCatalog';
import { CameraRig } from './CameraRig';
import { ParticleSystem } from './effects/Particles';
import { TireMarks } from './effects/TireMarks';
import { Environment, ENVIRONMENT_PRESETS } from './Environment';
import type { MaterialLibrary } from './Materials';
import type { TextureLibrary } from './ProceduralTextures';
import type { Renderer } from './Renderer';
import { TrackView } from './TrackView';
import { createVehicleModel, type VehicleMaterials, type VehicleModel } from './VehicleModelFactory';
import type { LoadedVehicleAsset } from './VehicleAssetLoader';
import { VehicleView } from './VehicleView';

const PARTICLE_LIMITS: Record<Settings['graphics']['particles'], number> = { off: 0, low: 220, medium: 520, high: 1100 };
const TIRE_MARK_LIMITS: Record<Settings['graphics']['particles'], number> = { off: 600, low: 1500, medium: 3000, high: 5000 };
const SCENERY_DENSITY: Record<Settings['graphics']['preset'], number> = { low: 0.35, medium: 0.65, high: 1, ultra: 1, custom: 0.8 };

export interface RaceViewDeps {
  renderer: Renderer;
  textures: TextureLibrary;
  materials: MaterialLibrary;
  vehicleMaterials: VehicleMaterials;
  audio: AudioManager;
  settings: Settings;
  /** Modelos GLB já carregados e validados, por veículo. */
  assets: Map<string, LoadedVehicleAsset>;
}

export class RaceView {
  readonly scene = new THREE.Scene();
  readonly environment: Environment;
  readonly trackView: TrackView;
  readonly cameraRig: CameraRig;
  readonly views = new Map<string, VehicleView>();
  private readonly tireMarks: TireMarks;
  private readonly smoke: ParticleSystem;
  private readonly sparks: ParticleSystem;
  private readonly cones: THREE.InstancedMesh | null;
  private readonly headlights: THREE.SpotLight[] = [];
  private readonly engineSounds = new Map<string, VehicleAudio>();
  private readonly unsubscribe: Array<() => void> = [];
  private elapsed = 0;
  private emitAccumulator = 0;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3(1, 1, 1);
  private readonly forward = new THREE.Vector3();
  /** Corredor focado pela câmera (normalmente o jogador). */
  focus: Racer;

  constructor(
    private readonly session: RaceSession,
    ribbons: TrackRibbons,
    terrain: TerrainData,
    private readonly deps: RaceViewDeps,
  ) {
    const track = session.track;
    const g = deps.settings.graphics;
    this.focus = session.player;
    this.scene.name = 'race';

    this.environment = new Environment(deps.renderer.renderer, track.definition.environment, g.shadows, g.drawDistance);
    this.environment.apply(this.scene);
    deps.renderer.renderer.toneMappingExposure = this.environment.exposure;

    this.trackView = new TrackView(track, ribbons, terrain, deps.textures, deps.materials, {
      sceneryDensity: SCENERY_DENSITY[g.preset],
      shadows: g.shadows !== 'off',
    });
    this.scene.add(this.trackView.group);

    const night = ENVIRONMENT_PRESETS[track.definition.environment].headlights;
    deps.vehicleMaterials.setNight(night);
    for (const racer of session.racers) {
      const model = createVehicleModel(racer.definition, getPaint(racer.definition, racer.paint), deps.vehicleMaterials, deps.assets.get(racer.definition.id) ?? null);
      this.scene.add(model.root);
      this.views.set(racer.id, new VehicleView(model, racer.vehicle));
    }
    if (night) this.createHeadlights(this.views.get(session.player.id)!.model);

    // Cones.
    if (session.cones.length) {
      const geo = new THREE.ConeGeometry(0.21, 0.7, 12);
      this.cones = new THREE.InstancedMesh(geo, deps.materials.cone(), session.cones.length);
      this.cones.castShadow = g.shadows !== 'off';
      this.cones.frustumCulled = false;
      this.scene.add(this.cones);
    } else {
      this.cones = null;
    }

    this.tireMarks = new TireMarks(deps.textures.tireMark(), TIRE_MARK_LIMITS[g.particles]);
    this.scene.add(this.tireMarks.mesh);
    this.smoke = new ParticleSystem(deps.textures.smoke(), PARTICLE_LIMITS[g.particles], false);
    this.sparks = new ParticleSystem(deps.textures.spark(), Math.max(1, Math.round(PARTICLE_LIMITS[g.particles] * 0.3)), true);
    this.smoke.enabled = g.particles !== 'off';
    this.sparks.enabled = g.particles !== 'off';
    this.scene.add(this.smoke.mesh, this.sparks.mesh);

    this.cameraRig = new CameraRig(deps.renderer.aspect);
    this.cameraRig.attach(session.physics, track);
    this.cameraRig.setView(deps.settings.camera.defaultView);
    this.cameraRig.setFar(this.environment.far);
    this.applyCameraSettings(deps.settings);
    if (session.phase === 'intro') this.cameraRig.startOrbit(0.4);

    this.unsubscribe.push(
      session.events.on('impact', (e) => this.onImpact(e.racer, e.intensity, e.point)),
      session.events.on('countdown', (e) => deps.audio.playCountdown(e.value === 0)),
      session.events.on('phase', (e) => {
        if (e.phase === 'countdown' || e.phase === 'racing') this.cameraRig.stopOrbit();
      }),
      session.events.on('lap', (e) => {
        if (e.racer.isPlayer) deps.audio.playLap(e.isBest);
      }),
      session.events.on('shift', (e) => {
        if (e.racer === this.focus) deps.audio.playShift();
      }),
    );
    this.ensureAudio();
  }

  private createHeadlights(model: VehicleModel): void {
    for (const pos of model.headlightPositions) {
      const light = new THREE.SpotLight(0xfff1d6, 60, 70, 0.42, 0.55, 1.6);
      light.position.copy(pos);
      light.target.position.set(pos.x * 1.3, pos.y - 1.2, pos.z + 25);
      light.castShadow = false;
      model.root.add(light);
      model.root.add(light.target);
      this.headlights.push(light);
    }
  }

  /** Cria os sons de motor quando o áudio já foi liberado pelo usuário. */
  ensureAudio(): void {
    const audio = this.deps.audio;
    if (!audio.unlocked || this.engineSounds.size > 0) return;
    for (const racer of this.session.racers) {
      const isFocus = racer === this.focus;
      this.engineSounds.set(racer.id, new VehicleAudio(audio, racer.definition.audio.profile, !isFocus, isFocus));
    }
  }

  applySettings(settings: Settings): void {
    const g = settings.graphics;
    this.environment.setShadowQuality(g.shadows);
    this.environment.setDrawDistance(g.drawDistance);
    this.cameraRig.setFar(this.environment.far);
    this.smoke.enabled = g.particles !== 'off';
    this.sparks.enabled = g.particles !== 'off';
    if (g.particles === 'off') {
      this.smoke.clear();
      this.sparks.clear();
    }
    this.applyCameraSettings(settings);
  }

  private applyCameraSettings(settings: Settings): void {
    this.cameraRig.settings = { ...settings.camera };
  }

  private onImpact(racer: Racer, intensity: number, point: { x: number; y: number; z: number } | null): void {
    if (racer === this.focus) this.cameraRig.kick(intensity);
    const view = this.views.get(racer.id);
    if (!view) return;
    const listenerDistance = this.cameraRig.camera.position.distanceTo(view.position);
    if (listenerDistance < 120) this.deps.audio.playImpact(intensity * Math.max(0.2, 1 - listenerDistance / 120));
    if (intensity > 2.2 && point) {
      const count = Math.min(40, Math.round(intensity * 3));
      const v = racer.vehicle.velocity;
      for (let i = 0; i < count; i++) {
        this.sparks.emit({
          x: point.x,
          y: point.y + 0.2,
          z: point.z,
          vx: v.x * 0.4 + (Math.random() - 0.5) * 9,
          vy: Math.random() * 5 + 1,
          vz: v.z * 0.4 + (Math.random() - 0.5) * 9,
          life: 0.35 + Math.random() * 0.45,
          size: 0.12 + Math.random() * 0.12,
          growth: -0.1,
          alpha: 1,
          r: 1,
          g: 0.75,
          b: 0.4,
          gravity: 9.8,
          drag: 1.5,
        });
      }
    }
  }

  /** Atualização visual por quadro. `alpha` = fração do próximo passo físico (interpolação). */
  update(frameDt: number, alpha: number, paused: boolean): void {
    this.elapsed += frameDt;
    const session = this.session;
    for (const view of this.views.values()) view.update(alpha, paused ? 0 : frameDt);

    // Cones a partir dos corpos físicos.
    if (this.cones) {
      session.cones.forEach((cone, i) => {
        const t = cone.body.translation();
        const r = cone.body.rotation();
        this.tmpPos.set(t.x, t.y, t.z);
        this.tmpQuat.set(r.x, r.y, r.z, r.w);
        this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.cones!.setMatrixAt(i, this.tmpMatrix);
      });
      this.cones.instanceMatrix.needsUpdate = true;
    }

    // Luzes de largada.
    if (session.phase === 'intro') this.trackView.setStartLights(-2);
    else if (session.phase === 'countdown') this.trackView.setStartLights(Math.min(5, Math.floor((session.phaseTime / 3) * 5) + 1));
    else if (session.raceTime < 4) this.trackView.setStartLights(-1);
    else this.trackView.setStartLights(-2);

    if (!paused) {
      for (const racer of session.racers) this.tireMarks.update(racer.id, racer.vehicle);
      this.tireMarks.flush();
      this.emitParticles(frameDt);
      this.smoke.update(frameDt);
      this.sparks.update(frameDt);
    }

    // Câmera.
    const focusView = this.views.get(this.focus.id)!;
    const vehicle = this.focus.vehicle;
    let roughness = 0;
    for (const w of vehicle.wheels) if (w.grounded) roughness = Math.max(roughness, SURFACES[w.surface].roughness);
    if (session.phase === 'finished' && this.cameraRig.mode !== 'orbit' && session.playerFinishTime !== null && session.raceTime - session.playerFinishTime > 2.5) {
      this.cameraRig.startOrbit(0);
    }
    this.cameraRig.update(
      paused ? 0 : frameDt,
      {
        position: focusView.position,
        quaternion: focusView.quaternion,
        velocity: vehicle.velocity,
        forwardSpeed: vehicle.forwardSpeed,
        topSpeed: vehicle.phys.topSpeed,
        model: focusView.model,
        roughness,
      },
      this.focus.projection.s,
    );
    const camPos = this.cameraRig.camera.position;
    for (const view of this.views.values()) view.updateDetail(camPos, view === focusView && this.cameraRig.hidesDriver);
    this.environment.update(this.cameraRig.camera.position, focusView.position);
    this.trackView.update(this.elapsed);

    // Áudio.
    this.ensureAudio();
    const cam = this.cameraRig.camera;
    this.forward.set(0, 0, -1).applyQuaternion(cam.quaternion);
    updateListener(this.deps.audio, cam.position, this.forward);
    for (const racer of session.racers) {
      const sound = this.engineSounds.get(racer.id);
      if (!sound) continue;
      const v = racer.vehicle;
      const e = v.phys.spec.engine;
      let offroad = 0;
      for (const w of v.wheels) if (w.grounded && !SURFACES[w.surface].isTrack) offroad += 0.25;
      sound.update({
        rpm: v.drivetrain.rpm,
        idleRpm: e.idleRpm,
        redlineRpm: e.redlineRpm,
        load: v.drivetrain.load,
        speed: v.speed,
        skid: v.skidAmount * 1.4,
        offroad,
        limiter: v.drivetrain.limiterActive,
      });
      if (racer !== this.focus) {
        const view = this.views.get(racer.id)!;
        sound.setPosition(view.position.x, view.position.y, view.position.z);
      }
    }
  }

  private emitParticles(dt: number): void {
    if (!this.smoke.enabled) return;
    this.emitAccumulator += dt;
    const interval = 1 / 40;
    if (this.emitAccumulator < interval) return;
    this.emitAccumulator = 0;
    const camPos = this.cameraRig.camera.position;
    for (const racer of this.session.racers) {
      const v = racer.vehicle;
      const view = this.views.get(racer.id)!;
      if (view.position.distanceToSquared(camPos) > 160 * 160) continue;
      for (const wheel of v.wheels) {
        if (!wheel.grounded) continue;
        const surface = SURFACES[wheel.surface];
        const speed = v.speed;
        if (surface.dust > 0 && speed > 4) {
          const amount = surface.dust * Math.min(1, speed / 25);
          if (Math.random() < amount * 0.8) {
            this.smoke.emit({
              x: wheel.contactPoint.x,
              y: wheel.contactPoint.y + 0.25,
              z: wheel.contactPoint.z,
              vx: v.velocity.x * 0.25 + (Math.random() - 0.5) * 1.5,
              vy: 0.6 + Math.random() * 0.8,
              vz: v.velocity.z * 0.25 + (Math.random() - 0.5) * 1.5,
              life: 1.4 + Math.random() * 0.8,
              size: 0.9,
              growth: 2.4,
              alpha: 0.32 * amount,
              r: 0.62,
              g: 0.53,
              b: 0.4,
              gravity: -0.15,
              drag: 1.2,
            });
          }
        } else if (wheel.skid > 0.38 && speed > 3) {
          const amount = Math.min(1, (wheel.skid - 0.3) * 1.6);
          this.smoke.emit({
            x: wheel.contactPoint.x,
            y: wheel.contactPoint.y + 0.2,
            z: wheel.contactPoint.z,
            vx: v.velocity.x * 0.15 + (Math.random() - 0.5),
            vy: 0.4 + Math.random() * 0.5,
            vz: v.velocity.z * 0.15 + (Math.random() - 0.5),
            life: 1.6 + Math.random() * 0.9,
            size: 0.7,
            growth: 2.8,
            alpha: 0.28 * amount,
            r: 0.88,
            g: 0.88,
            b: 0.9,
            gravity: -0.25,
            drag: 1.4,
          });
        }
      }
    }
  }

  resize(aspect: number): void {
    this.cameraRig.resize(aspect);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cameraRig.camera;
  }

  resetEffects(): void {
    this.tireMarks.clear();
    this.smoke.clear();
    this.sparks.clear();
    this.cameraRig.stopOrbit();
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    for (const sound of this.engineSounds.values()) sound.stop();
    this.engineSounds.clear();
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.tireMarks.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    if (this.cones) {
      this.cones.geometry.dispose();
      this.cones.dispose();
    }
    this.trackView.dispose();
    this.environment.dispose();
    this.scene.clear();
  }
}
