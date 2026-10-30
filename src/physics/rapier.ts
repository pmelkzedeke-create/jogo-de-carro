/**
 * Inicialização única do Rapier 3D (WASM embutido no pacote "compat").
 * O módulo é carregado sob demanda para não bloquear a primeira renderização da interface.
 */
import type RapierNamespace from '@dimforge/rapier3d-compat';

export type RapierModule = typeof RapierNamespace;

let loading: Promise<RapierModule> | null = null;
let loaded: RapierModule | null = null;

export function loadRapier(): Promise<RapierModule> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = import('@dimforge/rapier3d-compat')
      .then(async (mod) => {
        const R = (mod.default ?? mod) as RapierModule;
        await R.init();
        loaded = R;
        return R;
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function getRapier(): RapierModule {
  if (!loaded) throw new Error('Rapier ainda não foi inicializado. Chame loadRapier() antes.');
  return loaded;
}
