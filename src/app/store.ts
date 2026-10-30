/**
 * Store mínimo baseado em useSyncExternalStore (sem dependências externas).
 * Apenas estado de baixa frequência fica aqui; dados por quadro (velocímetro etc.) são lidos do HudData.
 */
import { useRef, useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const partial = typeof update === 'function' ? update(state) : update;
      state = { ...state, ...partial };
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** Seleciona parte do estado; re-renderiza apenas quando o resultado muda (comparação rasa). */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const cache = useRef<{ value: S } | null>(null);
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current && shallowEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
