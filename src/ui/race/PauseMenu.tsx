import { useEffect } from 'react';
import { appStore } from '../../app/appState';
import { exitRace, restartRace, resumeRace, setPauseView } from '../../app/controller';
import { useStore } from '../../app/store';
import { ACTION_LABELS, DEFAULT_KEYMAP, keyLabel, type GameAction } from '../../input/Keymap';
import { MODES } from '../../racing/RaceTypes';
import { getTrackDefinition } from '../../tracks/TrackCatalog';
import { Button } from '../components/Controls';
import { SettingsPanel } from '../screens/SettingsPanel';

export function PauseMenu() {
  const race = useStore(appStore, (s) => s.race);
  const view = race?.pauseView ?? 'main';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (view === 'main') resumeRace();
      else setPauseView('main');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (!race) return null;
  const track = getTrackDefinition(race.config.trackId);

  if (view === 'settings') {
    return (
      <div className="overlay" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 'min(860px, 100%)' }}>
          <div className="screen-header">
            <Button small sound="back" onClick={() => setPauseView('main')}>
              ← Voltar
            </Button>
            <h1 className="display" style={{ margin: 0 }}>
              Configurações
            </h1>
          </div>
          <SettingsPanel inRace />
        </div>
      </div>
    );
  }

  if (view === 'confirmExit' || view === 'confirmRestart') {
    const exit = view === 'confirmExit';
    return (
      <div className="overlay">
        <div className="panel modal" role="dialog" aria-modal="true">
          <h2>{exit ? 'Sair da corrida?' : 'Reiniciar a corrida?'}</h2>
          <p>{exit ? 'O progresso desta corrida será perdido e nenhuma recompensa será concedida.' : 'Todos os carros voltam ao grid e os tempos são zerados.'}</p>
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <Button sound="back" onClick={() => setPauseView('main')} autoFocus>
              Cancelar
            </Button>
            <Button variant={exit ? 'danger' : 'primary'} onClick={exit ? exitRace : restartRace} testId={exit ? 'confirm-exit' : 'confirm-restart'}>
              {exit ? 'Sair para o menu' : 'Reiniciar'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" data-testid="pause-menu">
      <div className="panel pause-card" role="dialog" aria-modal="true" aria-label="Pausa">
        <div className="eyebrow">
          {MODES[race.config.mode].label} · {track.name}
        </div>
        <h2>Pausado</h2>
        <Button variant="primary" onClick={resumeRace} autoFocus testId="resume">
          ▶ Continuar
        </Button>
        <Button onClick={() => setPauseView('confirmRestart')}>↺ Reiniciar corrida</Button>
        <Button onClick={() => setPauseView('settings')}>⚙ Configurações</Button>
        <Button variant="danger" onClick={() => setPauseView('confirmExit')} testId="exit-race">
          ⏏ Sair para o menu
        </Button>
        <div style={{ marginTop: '0.8rem', fontSize: '0.8rem' }} className="muted">
          {(Object.keys(DEFAULT_KEYMAP) as GameAction[]).map((a) => (
            <div key={a} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{ACTION_LABELS[a]}</span>
              <span>{DEFAULT_KEYMAP[a].map(keyLabel).join(' / ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
