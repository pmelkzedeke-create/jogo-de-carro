import { useEffect } from 'react';
import { appStore } from '../../app/appState';
import { beginNewCareer, confirmAction, navigate, updateSetup, uiSound } from '../../app/controller';
import { careerFinished, nextCareerEvent } from '../../career/CareerProgress';
import { useStore } from '../../app/store';
import { levelProgress, reputationTitle } from '../../career/Progression';
import type { GameMode } from '../../racing/RaceTypes';
import { formatCredits } from '../../utils/format';
import { CATEGORY_LABELS, getVehicle } from '../../vehicles/VehicleCatalog';
import { estimatePerformance, performanceClass } from '../../vehicles/VehiclePerformance';

interface MenuEntry {
  id: string;
  label: string;
  hint: string;
  action: () => void;
  highlight?: boolean;
}

function openSetup(mode: GameMode) {
  const save = appStore.get().save;
  const setup = appStore.get().setup;
  const vehicleId = save.garage.owned.some((o) => o.id === setup.vehicleId) ? setup.vehicleId : save.garage.selected;
  updateSetup({ mode, vehicleId });
  navigate('setup');
}

export function MainMenu() {
  const save = useStore(appStore, (s) => s.save);
  const warnings = useStore(appStore, (s) => s.warnings);
  const persistent = useStore(appStore, (s) => s.persistent);
  const progress = levelProgress(save.profile.xp);
  const selected = getVehicle(save.garage.selected);
  const perf = estimatePerformance(selected);

  const next = save.career.started ? nextCareerEvent(save) : null;
  const careerEntries: MenuEntry[] = save.career.started
    ? [
        {
          id: 'continue',
          label: 'Continuar carreira',
          hint: careerFinished(save) ? 'História concluída' : next ? `Próximo: ${next.title}` : 'Do Litoral à Liga',
          action: () => navigate('career'),
          highlight: true,
        },
        {
          id: 'new-career',
          label: 'Nova carreira',
          hint: 'Recomeçar a história',
          action: () =>
            confirmAction(
              'Recomeçar a carreira?',
              'O progresso da história (capítulos, eventos e campeonato regional) será reiniciado. Créditos, carros, recordes e conquistas são mantidos.',
              'Recomeçar',
              beginNewCareer,
              true,
            ),
        },
      ]
    : [{ id: 'new-career', label: 'Nova carreira', hint: 'História original: Do Litoral à Liga', action: beginNewCareer, highlight: true }];

  const entries: MenuEntry[] = [
    ...careerEntries,
    { id: 'quick', label: 'Corrida rápida', hint: 'Pista, carro e adversários à sua escolha', action: () => openSetup('quickRace') },
    { id: 'tt', label: 'Contrarrelógio', hint: 'Bata seus recordes de volta', action: () => openSetup('timeTrial') },
    { id: 'practice', label: 'Treino livre', hint: 'Sem adversários e sem pressão', action: () => openSetup('practice') },
    { id: 'drift', label: 'Desafio de drift', hint: 'Pontuação por drifts válidos', action: () => openSetup('drift') },
    { id: 'garage', label: 'Garagem', hint: `${save.garage.owned.length} ${save.garage.owned.length === 1 ? 'carro' : 'carros'}`, action: () => navigate('garage') },
    { id: 'championships', label: 'Campeonatos', hint: 'Temporadas por pontos', action: () => navigate('championships') },
    { id: 'stats', label: 'Estatísticas', hint: 'Recordes, histórico e conquistas', action: () => navigate('stats') },
    { id: 'settings', label: 'Configurações', hint: 'Gráficos, controles, áudio', action: () => navigate('settings') },
    { id: 'credits', label: 'Créditos', hint: 'Tecnologias e licenças', action: () => navigate('credits') },
  ];

  useEffect(() => {
    const first = document.querySelector<HTMLButtonElement>('.menu-item');
    first?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
    uiSound('hover');
    e.preventDefault();
  };

  return (
    <div className="screen">
      <div className="main-menu">
        <div className="logo">
          Apex<span>Velocity</span>
          <small>Corrida 3D original para navegador</small>
        </div>

        <nav className="menu-list" aria-label="Menu principal" onKeyDown={onKeyDown}>
          {entries.map((entry) => (
            <button key={entry.id} type="button" className={`menu-item ${entry.highlight ? 'highlight' : ''}`} onClick={entry.action} onMouseEnter={() => uiSound('hover')} data-testid={`menu-${entry.id}`}>
              {entry.label}
              <small>{entry.hint}</small>
            </button>
          ))}
        </nav>

        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {(!persistent || warnings.length > 0) && (
            <div className="warning-banner" role="status">
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          )}
          <div className="panel driver-card">
            <div className="level-badge" title="Nível do piloto">
              {progress.level}
            </div>
            <div>
              <div className="display" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {save.profile.driverName}
              </div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                {reputationTitle(save.profile.reputation)} · {save.profile.reputation} de reputação
              </div>
              <div className="xp-bar" title={`${save.profile.xp - progress.current} / ${progress.next - progress.current} XP`}>
                <div style={{ width: `${progress.fraction * 100}%` }} />
              </div>
            </div>
            <div className="credits">{formatCredits(save.profile.credits)}</div>
          </div>
        </div>
      </div>

      <div className="menu-vehicle">
        <div className="eyebrow">
          {selected.manufacturer} · {CATEGORY_LABELS[selected.category]}
        </div>
        <div className="name">{selected.name}</div>
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <span className="tag accent">
            Classe {performanceClass(perf.index)} · {perf.index}
          </span>
          {selected.provisionalModel && <span className="tag warn">Modelo provisório</span>}
        </div>
      </div>
    </div>
  );
}
