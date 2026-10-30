/**
 * Carregamento assíncrono de modelos GLB de veículos (GLTFLoader + DRACO + KTX2), com cache,
 * validação e fallback explícito para o modelo procedural em caso de falha.
 * Os decodificadores são servidos localmente em /assets/decoders (sem CDN externo).
 */
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { VehicleDefinition } from '../vehicles/VehicleConfig';
import { prepareVehicleScene, type VehicleAssetReport } from './VehicleAsset';

export interface LoadedVehicleAsset {
  vehicleId: string;
  /** Cena original (modelo-base); cada carro em jogo recebe um clone. */
  scene: THREE.Group;
  report: VehicleAssetReport;
}

export type AssetLoadResult = { status: 'loaded'; asset: LoadedVehicleAsset } | { status: 'failed'; error: string } | { status: 'none' };

export class VehicleAssetLoader {
  private readonly gltf: GLTFLoader;
  private readonly draco: DRACOLoader;
  private readonly ktx2: KTX2Loader;
  private readonly cache = new Map<string, Promise<AssetLoadResult>>();
  private readonly base: string;

  constructor(renderer: THREE.WebGLRenderer, base = `${import.meta.env.BASE_URL}assets/`) {
    this.base = base;
    this.draco = new DRACOLoader().setDecoderPath(`${base}decoders/draco/`);
    this.ktx2 = new KTX2Loader().setTranscoderPath(`${base}decoders/basis/`);
    this.ktx2.detectSupport(renderer);
    this.gltf = new GLTFLoader().setDRACOLoader(this.draco).setKTX2Loader(this.ktx2);
  }

  /** Carrega (uma única vez) o modelo GLB de um veículo, se houver. */
  load(definition: VehicleDefinition, onProgress?: (fraction: number | null) => void): Promise<AssetLoadResult> {
    const spec = definition.visual.gltf;
    if (!spec) return Promise.resolve({ status: 'none' });
    const cached = this.cache.get(definition.id);
    if (cached) return cached;
    const url = `${this.base}${spec.url}`;
    const promise = new Promise<AssetLoadResult>((resolve) => {
      this.gltf.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          const report = prepareVehicleScene(scene, spec);
          for (const w of report.warnings) console.warn(`[veículo ${definition.id}] ${w}`);
          if (!report.ok) {
            const error = report.errors.join(' ');
            console.error(`[veículo ${definition.id}] modelo GLB rejeitado: ${error}`);
            resolve({ status: 'failed', error });
            return;
          }
          resolve({ status: 'loaded', asset: { vehicleId: definition.id, scene, report } });
        },
        (event) => {
          if (onProgress) onProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
        },
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[veículo ${definition.id}] falha ao carregar ${url}: ${message}`);
          resolve({ status: 'failed', error: `Falha ao carregar ${spec.url}: ${message}` });
        },
      );
    });
    this.cache.set(definition.id, promise);
    return promise;
  }

  /** Resultado já resolvido (ou null se ainda não carregado). */
  async peek(definition: VehicleDefinition): Promise<AssetLoadResult | null> {
    const cached = this.cache.get(definition.id);
    return cached ? cached : null;
  }

  /** Permite tentar novamente após uma falha. */
  forget(vehicleId: string): void {
    this.cache.delete(vehicleId);
  }

  dispose(): void {
    this.draco.dispose();
    this.ktx2.dispose();
    this.cache.clear();
  }
}
