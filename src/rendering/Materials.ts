/**
 * Biblioteca de materiais compartilhados (evita duplicação de materiais e shaders).
 */
import * as THREE from 'three';
import type { TextureLibrary } from './ProceduralTextures';

export class MaterialLibrary {
  private readonly cache = new Map<string, THREE.Material>();

  constructor(private readonly textures: TextureLibrary) {}

  private memo<T extends THREE.Material>(key: string, factory: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = factory();
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  road(): THREE.MeshStandardMaterial {
    return this.memo('road', () => {
      const t = this.textures.asphalt();
      return new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: t.roughnessMap,
        roughness: 1,
        metalness: 0,
        color: 0xffffff,
      });
    });
  }

  shoulder(): THREE.MeshStandardMaterial {
    return this.memo('shoulder', () => {
      const t = this.textures.shoulder();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, metalness: 0 });
    });
  }

  curb(): THREE.MeshStandardMaterial {
    return this.memo('curb', () => {
      const t = this.textures.curb();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.7, metalness: 0 });
    });
  }

  runoff(): THREE.MeshStandardMaterial {
    return this.memo('runoff', () => {
      const t = this.textures.grass(true);
      return new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      });
    });
  }

  terrain(): THREE.MeshStandardMaterial {
    return this.memo('terrain', () => {
      const t = this.textures.terrain();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.96, metalness: 0 });
    });
  }

  decal(texture: THREE.Texture, key: string): THREE.MeshStandardMaterial {
    return this.memo(`decal-${key}`, () => {
      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.75,
        metalness: 0,
        transparent: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      });
    });
  }

  paint(): THREE.MeshStandardMaterial {
    return this.memo('paint-white', () =>
      new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    );
  }

  guardrail(): THREE.MeshStandardMaterial {
    return this.memo('guardrail', () => new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.32, metalness: 0.85, side: THREE.DoubleSide }));
  }

  post(): THREE.MeshStandardMaterial {
    return this.memo('post', () => new THREE.MeshStandardMaterial({ color: 0x5c6168, roughness: 0.5, metalness: 0.7 }));
  }

  concrete(): THREE.MeshStandardMaterial {
    return this.memo('concrete', () => {
      const t = this.textures.concrete();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.88, metalness: 0 });
    });
  }

  structure(): THREE.MeshStandardMaterial {
    return this.memo('structure', () => new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.55, metalness: 0.6 }));
  }

  structureLight(): THREE.MeshStandardMaterial {
    return this.memo('structure-light', () => new THREE.MeshStandardMaterial({ color: 0xd9dce0, roughness: 0.6, metalness: 0.2 }));
  }

  trunk(): THREE.MeshStandardMaterial {
    return this.memo('trunk', () => new THREE.MeshStandardMaterial({ color: 0x5a4332, roughness: 0.95, metalness: 0 }));
  }

  foliage(): THREE.MeshStandardMaterial {
    return this.memo('foliage', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }));
  }

  corrugated(): THREE.MeshStandardMaterial {
    return this.memo('corrugated', () => {
      const t = this.textures.corrugated();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.55, metalness: 0.45 });
    });
  }

  crowd(): THREE.MeshStandardMaterial {
    return this.memo('crowd', () => new THREE.MeshStandardMaterial({ map: this.textures.crowd(), roughness: 0.9, metalness: 0 }));
  }

  banner(text: string, bg: string, fg: string): THREE.MeshStandardMaterial {
    return this.memo(`banner-${text}`, () => new THREE.MeshStandardMaterial({ map: this.textures.banner(text, bg, fg), roughness: 0.6, metalness: 0, side: THREE.DoubleSide }));
  }

  water(): THREE.MeshStandardMaterial {
    return this.memo('water', () => {
      const normal = this.textures.waterNormal();
      normal.repeat.set(60, 60);
      return new THREE.MeshStandardMaterial({ color: 0x1d4f6e, roughness: 0.12, metalness: 0.2, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35) });
    });
  }

  mountains(): THREE.MeshStandardMaterial {
    return this.memo('mountains', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
  }

  lightOff(): THREE.MeshStandardMaterial {
    return this.memo('light-off', () => new THREE.MeshStandardMaterial({ color: 0x220806, roughness: 0.4, metalness: 0.1, emissive: 0x000000 }));
  }

  lightRed(): THREE.MeshStandardMaterial {
    return this.memo('light-red', () => new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff1a10, emissiveIntensity: 4, roughness: 0.3 }));
  }

  lightGreen(): THREE.MeshStandardMaterial {
    return this.memo('light-green', () => new THREE.MeshStandardMaterial({ color: 0x043008, emissive: 0x20ff40, emissiveIntensity: 4, roughness: 0.3 }));
  }

  paintRed(): THREE.MeshStandardMaterial {
    return this.memo('paint-red', () => new THREE.MeshStandardMaterial({ color: 0xb3121c, roughness: 0.6, metalness: 0 }));
  }

  lamp(): THREE.MeshStandardMaterial {
    return this.memo('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 1.5 }));
  }

  crane(): THREE.MeshStandardMaterial {
    return this.memo('crane', () => new THREE.MeshStandardMaterial({ color: 0xd9631e, roughness: 0.6, metalness: 0.4 }));
  }

  cone(): THREE.MeshStandardMaterial {
    return this.memo('cone', () => new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.55, metalness: 0 }));
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
