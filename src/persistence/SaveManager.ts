/**
 * Gerenciador de salvamento local (localStorage).
 * - Mantém uma cópia de segurança da versão anterior antes de sobrescrever.
 * - Se o armazenamento estiver indisponível (modo privado, cota), o jogo continua funcionando e avisa.
 * - Redefinição explícita apenas com confirmação na interface.
 */
import { createDefaultSave, validateSave, type SaveData } from './SaveSchema';

export const STORAGE_KEY = 'apex-velocity:save';
export const BACKUP_KEY = 'apex-velocity:save-backup';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function detectStorage(): { storage: StorageLike; persistent: boolean } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__apex_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return { storage: window.localStorage, persistent: true };
    }
  } catch {
    /* indisponível */
  }
  return { storage: new MemoryStorage(), persistent: false };
}

export interface LoadResult {
  data: SaveData;
  warnings: string[];
  persistent: boolean;
  recoveredFromBackup: boolean;
  /** Nenhum progresso salvo encontrado (primeira execução). */
  isNew: boolean;
}

export class SaveManager {
  readonly storage: StorageLike;
  readonly persistent: boolean;
  lastError: string | null = null;

  constructor(storage?: StorageLike) {
    if (storage) {
      this.storage = storage;
      this.persistent = true;
    } else {
      const detected = detectStorage();
      this.storage = detected.storage;
      this.persistent = detected.persistent;
    }
  }

  load(): LoadResult {
    const warnings: string[] = [];
    let recoveredFromBackup = false;
    if (!this.persistent) warnings.push('O armazenamento local está indisponível: o progresso não será mantido após fechar a página.');

    const tryParse = (key: string): unknown => {
      const text = this.storage.getItem(key);
      if (text === null) return undefined;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    };

    let raw = tryParse(STORAGE_KEY);
    if (raw === null) {
      const backup = tryParse(BACKUP_KEY);
      if (backup !== undefined && backup !== null) {
        raw = backup;
        recoveredFromBackup = true;
        warnings.push('O arquivo de progresso estava corrompido; restauramos a cópia de segurança mais recente.');
      } else {
        warnings.push('O arquivo de progresso estava corrompido e não havia cópia de segurança; um novo perfil foi criado.');
      }
    }
    if (raw === undefined || raw === null) {
      return { data: createDefaultSave(), warnings, persistent: this.persistent, recoveredFromBackup, isNew: raw === undefined };
    }
    const result = validateSave(raw);
    return { data: result.data, warnings: [...warnings, ...result.warnings], persistent: this.persistent, recoveredFromBackup, isNew: false };
  }

  save(data: SaveData): boolean {
    try {
      const current = this.storage.getItem(STORAGE_KEY);
      if (current) this.storage.setItem(BACKUP_KEY, current);
      const payload: SaveData = { ...data, updatedAt: new Date().toISOString() };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /** Apaga todo o progresso (chamada somente após confirmação explícita). */
  reset(): SaveData {
    try {
      this.storage.removeItem(STORAGE_KEY);
      this.storage.removeItem(BACKUP_KEY);
    } catch {
      /* ignorado */
    }
    const fresh = createDefaultSave();
    this.save(fresh);
    return fresh;
  }
}
