import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveManager, BACKUP_KEY, STORAGE_KEY } from '../../src/persistence/SaveManager';
import { createDefaultSave, SAVE_VERSION, validateSave } from '../../src/persistence/SaveSchema';

describe('Persistência', () => {
  it('cria save padrão válido e versionado', () => {
    const save = createDefaultSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.garage.owned.length).toBe(1);
    expect(validateSave(JSON.parse(JSON.stringify(save))).warnings).toHaveLength(0);
  });

  it('propriedade ausente não apaga o restante do progresso', () => {
    const save = createDefaultSave();
    save.profile.credits = 123456;
    save.records['costa-azul'] = { bestLap: 61.2, bestLapVehicle: 'valkar-sprint-gt', bestRace: null, bestDrift: null };
    const raw = JSON.parse(JSON.stringify(save));
    delete raw.settings;
    delete raw.stats;
    const { data } = validateSave(raw);
    expect(data.profile.credits).toBe(123456);
    expect(data.records['costa-azul'].bestLap).toBeCloseTo(61.2);
    expect(data.settings.graphics.preset).toBe('high');
    expect(data.stats.racesStarted).toBe(0);
  });

  it('valores fora de faixa ou de tipo errado são normalizados', () => {
    const raw = { version: 1, profile: { credits: -50, xp: 'muito', driverName: '   ' }, settings: { graphics: { renderScale: 99, shadows: 'ultra-rt' }, audio: { master: 7 } } };
    const { data } = validateSave(raw);
    expect(data.profile.credits).toBe(0);
    expect(data.profile.xp).toBe(0);
    expect(data.profile.driverName).toBe('Piloto');
    expect(data.settings.graphics.renderScale).toBe(1.5);
    expect(data.settings.graphics.shadows).toBe('medium');
    expect(data.settings.audio.master).toBe(1);
  });

  it('garagem corrompida restaura o carro inicial e mantém seleção válida', () => {
    const { data, warnings } = validateSave({ version: 1, garage: { owned: 'quebrado', selected: 'inexistente' } });
    expect(data.garage.owned.length).toBe(1);
    expect(data.garage.owned.map((o) => o.id)).toContain(data.garage.selected);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('JSON corrompido recupera a cópia de segurança', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    const save = createDefaultSave();
    save.profile.credits = 777;
    manager.save(save);
    save.profile.credits = 888;
    manager.save(save); // a versão anterior (777) vai para o backup
    storage.setItem(STORAGE_KEY, '{corrompido');
    const loaded = manager.load();
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.data.profile.credits).toBe(777);
    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
  });

  it('redefinição explícita apaga o progresso', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    const save = createDefaultSave();
    save.profile.credits = 99999;
    manager.save(save);
    const fresh = manager.reset();
    expect(fresh.profile.credits).toBe(createDefaultSave().profile.credits);
    expect(manager.load().data.profile.credits).toBe(createDefaultSave().profile.credits);
  });
});
