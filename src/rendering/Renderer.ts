/**
 * Renderer WebGL2 (three.js) com pós-processamento opcional, escala de resolução,
 * redimensionamento responsivo e tratamento de perda/restauração de contexto.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Settings } from '../persistence/SaveSchema';

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  width: number;
  height: number;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly maxAnisotropy: number;
  width = 1;
  height = 1;
  contextLost = false;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private graphics: Settings['graphics'];
  private readonly resizeObserver: ResizeObserver;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, graphics: Settings['graphics']) {
    this.container = container;
    this.graphics = graphics;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.setAttribute('aria-label', 'Cena 3D do jogo');
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = graphics.shadows !== 'off';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyGraphics(graphics);
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.applyGraphics(this.graphics);
    this.onContextRestored?.();
  };

  get pixelRatio(): number {
    const device = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(0.35, device * this.graphics.renderScale);
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
    }
  }

  get aspect(): number {
    return this.width / this.height;
  }

  applyGraphics(graphics: Settings['graphics']): void {
    const shadowsChanged = (this.graphics.shadows === 'off') !== (graphics.shadows === 'off');
    this.graphics = graphics;
    this.renderer.shadowMap.enabled = graphics.shadows !== 'off';
    if (shadowsChanged) this.renderer.shadowMap.needsUpdate = true;
    this.resize();
    this.configurePost(graphics.effects);
  }

  private composerLevel: Settings['graphics']['effects'] | null = null;

  /** Cria/recria a cadeia de pós-processamento conforme o nível de efeitos. */
  private configurePost(level: Settings['graphics']['effects']): void {
    if (this.composerLevel === level && (level === 'low') === !this.composer) return;
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer.dispose();
      this.bloomPass?.dispose();
      this.composer = null;
      this.renderPass = null;
      this.bloomPass = null;
    }
    this.composerLevel = level;
    if (level === 'low') return;
    const target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: level === 'high' ? 4 : 2,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    // Bloom sutil: o limiar alto (HDR) restringe o brilho a fontes emissivas fortes (faróis, lanternas, sol).
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), level === 'high' ? 0.32 : 0.24, 0.35, 1.6);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) return;
    this.renderer.info.reset();
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  stats(): RendererStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.pixelRatio,
      width: this.width,
      height: this.height,
    };
  }

  /** Compila shaders antecipadamente para evitar travadas na primeira renderização. */
  async precompile(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    try {
      await this.renderer.compileAsync(scene, camera);
    } catch {
      /* compilação antecipada é opcional */
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.composer?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** Verifica suporte a WebGL2 antes de iniciar o jogo. */
export function detectWebGL2(): { supported: boolean; renderer: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { supported: false, renderer: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { supported: true, renderer: name };
  } catch {
    return { supported: false, renderer: null };
  }
}
