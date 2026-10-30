import { useEffect, useMemo } from 'react';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../ai/Difficulty';
import { appStore } from '../../app/appState';
import { navigate, startFromSetup, updateSetup } from '../../app/controller';
import { buildRaceConfig } from '../../app/raceSetup';
import { useStore } from '../../app/store';
import { MODES } from '../../racing/RaceTypes';
import { ENVIRONMENT_PRESETS } from '../../rendering/Environment';
import { TRACKS } from '../../tracks/TrackCatalog';
import { formatCredits, formatDistance, formatTime } from '../../utils/format';
import { CATEGORY_LABELS, getVehicle } from '../../vehicles/VehicleCatalog';
import { estimatePerformance, performanceClass } from '../../vehicles/VehiclePerformance';
import { Button, Field, ScreenHeader, Segmented, Stepper } from '../components/Controls';
import { TrackThumb, trackOutline } from '../components/TrackThumb';

export function EventSetupScreen() {
  const setup = useStore(appStore, (s) => s.setup);
  const save = useStore(appStore, (s) => s.save);
  const mode = MODES[setup.mode];
  const track = TRACKS.find((t) => t.id === setup.trackId) ?? TRACKS[0];
  const isSprint = track.type === 'sprint';
  const record = save.records[track.id];
  const config = useMemo(() => buildRaceConfig(setup, save, 1), [setup, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen solid" style={{ flexDirection: 'column' }}>
      <ScreenHeader title={mode.label} onBack={() => navigate('menu')} />
      <div className="setup-layout">
        <div style={{ display: 'grid', gap: '1.2rem', alignContent: 'start' }}>
          <section className="panel setup-section">
            <h2>Pista</h2>
            <div className="choice-grid">
              {TRACKS.map((t) => {
                const outline = trackOutline(t.id);
                return (
                  <button key={t.id} type="button" className={`choice ${t.id === track.id ? 'selected' : ''}`} onClick={() => updateSetup({ trackId: t.id })} data-testid={`track-${t.id}`}>
                    <TrackThumb trackId={t.id} />
                    <span className="title">{t.name}</span>
                    <span className="meta">
                      {t.type === 'sprint' ? 'Sprint' : 'Circuito'} · {formatDistance(outline.length)} · {ENVIRONMENT_PRESETS[t.environment].label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
              {track.description}
            </p>
          </section>

          <section className="panel setup-section">
            <h2>Carro</h2>
            <div className="choice-grid">
              {save.garage.owned.map((owned) => {
                const v = getVehicle(owned.id);
                const perf = estimatePerformance(v);
                return (
                  <button key={v.id} type="button" className={`choice ${v.id === setup.vehicleId ? 'selected' : ''}`} onClick={() => updateSetup({ vehicleId: v.id })}>
                    <span className="meta">{v.manufacturer}</span>
                    <span className="title">{v.name}</span>
                    <span className="meta">
                      {CATEGORY_LABELS[v.category]} · Classe {performanceClass(perf.index)} {perf.index}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
              Novos carros podem ser comprados na garagem.
            </p>
          </section>
        </div>

        <div style={{ display: 'grid', gap: '1.2rem', alignContent: 'start' }}>
          <section className="panel setup-section">
            <h2>Regras</h2>
            {mode.hasFinish && setup.mode !== 'drift' && (
              <Field label="Voltas" hint={isSprint ? 'Sprint: percurso único de ponto a ponto' : undefined}>
                {isSprint ? <span className="muted">—</span> : <Stepper label="voltas" value={setup.laps} min={1} max={10} onChange={(laps) => updateSetup({ laps })} />}
              </Field>
            )}
            {setup.mode === 'drift' && (
              <Field label="Duração" hint="Pontue o máximo possível dentro do tempo">
                <span className="tabular">{formatTime(config.timeLimit ?? 0).slice(0, -4)}</span>
              </Field>
            )}
            {!mode.hasFinish && (
              <Field label="Voltas" hint="Livre — saia pelo menu de pausa quando quiser">
                <span className="muted">Ilimitadas</span>
              </Field>
            )}
            {mode.hasOpponents && (
              <>
                <Field label="Adversários" hint="Controlados pela IA, com carros de desempenho semelhante">
                  <Stepper label="adversários" value={Math.min(setup.opponents, track.gridSlots - 1)} min={1} max={track.gridSlots - 1} onChange={(opponents) => updateSetup({ opponents })} />
                </Field>
                <Field label="Dificuldade" hint={`Recompensas ×${DIFFICULTIES[setup.difficulty].rewardMultiplier.toFixed(1)}`}>
                  <Segmented
                    label="Dificuldade"
                    value={setup.difficulty}
                    options={DIFFICULTY_ORDER.map((d) => ({ value: d, label: DIFFICULTIES[d].label }))}
                    onChange={(difficulty) => updateSetup({ difficulty })}
                  />
                </Field>
              </>
            )}
          </section>

          <section className="panel setup-section">
            <h2>Resumo</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
              {mode.description}
            </p>
            <div className="summary-list">
              <div>
                <span>Pista</span>
                <span>{track.name}</span>
              </div>
              <div>
                <span>Carro</span>
                <span>
                  {getVehicle(setup.vehicleId).manufacturer} {getVehicle(setup.vehicleId).name}
                </span>
              </div>
              {mode.hasOpponents && (
                <div>
                  <span>Largada</span>
                  <span>Última posição do grid ({config.opponents.length + 1} carros)</span>
                </div>
              )}
              {mode.rewards && (
                <div>
                  <span>Recompensa (vitória/conclusão)</span>
                  <span className="credits" style={{ fontSize: '1rem' }}>
                    até {formatCredits(config.rewardBase * (mode.hasOpponents ? DIFFICULTIES[setup.difficulty].rewardMultiplier : 1))}
                  </span>
                </div>
              )}
              {!mode.rewards && (
                <div>
                  <span>Recompensas</span>
                  <span>Não há (modo de treino)</span>
                </div>
              )}
              <div>
                <span>Seu recorde de volta</span>
                <span className="tabular">{formatTime(record?.bestLap ?? null)}</span>
              </div>
              {config.objectives.map((o) => (
                <div key={o.label}>
                  <span>Objetivo</span>
                  <span>{o.label}</span>
                </div>
              ))}
            </div>
            <Button variant="primary" onClick={() => void startFromSetup()} testId="start-race">
              Iniciar
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
