import { useEffect } from 'react';
import { DIFFICULTIES } from '../../ai/Difficulty';
import { appStore } from '../../app/appState';
import { confirmAction, navigate, newChampionshipSeason, startChampionshipRound } from '../../app/controller';
import { useStore } from '../../app/store';
import { CHAMPIONSHIPS, POINTS_TABLE, emptyProgress, standings } from '../../career/Championships';
import { isChampionshipUnlocked } from '../../career/CareerProgress';
import { getTrackDefinition } from '../../tracks/TrackCatalog';
import { formatCredits } from '../../utils/format';
import { getVehicle } from '../../vehicles/VehicleCatalog';
import { Button, ScreenHeader } from '../components/Controls';
import { TrackThumb } from '../components/TrackThumb';

export function ChampionshipsScreen() {
  const save = useStore(appStore, (s) => s.save);
  const selectedId = useStore(appStore, (s) => s.selectedChampionship);
  const visible = CHAMPIONSHIPS.filter((c) => !c.careerOnly || isChampionshipUnlocked(save, c.id));
  const def = visible.find((c) => c.id === selectedId) ?? visible[0];
  const progress = save.championships[def.id] ?? emptyProgress();
  const unlocked = isChampionshipUnlocked(save, def.id);
  const table = standings(def, progress, save.profile.driverName);

  // Campeonatos da carreira voltam para a carreira; os demais, para o menu.
  const back = def.careerOnly ? 'career' : 'menu';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !appStore.get().confirm) navigate(back);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  return (
    <div className="screen solid" style={{ flexDirection: 'column' }}>
      <ScreenHeader title="Campeonatos" onBack={() => navigate(back)} />
      <div className="setup-layout">
        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <section className="panel setup-section">
            <h2>Temporadas</h2>
            <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
              {visible.map((c) => {
                const p = save.championships[c.id];
                const ok = isChampionshipUnlocked(save, c.id);
                return (
                  <button key={c.id} type="button" className={`choice ${c.id === def.id ? 'selected' : ''}`} onClick={() => appStore.set({ selectedChampionship: c.id })} data-testid={`champ-${c.id}`}>
                    <span className="meta">
                      {c.careerOnly ? 'Carreira · ' : ''}
                      {c.rounds.length} etapas · {DIFFICULTIES[c.difficulty].label}
                    </span>
                    <span className="title">{c.name}</span>
                    <span className="meta">{ok ? (p?.completed ? `Encerrado — ${p.finalPosition}º lugar` : p && p.round > 0 ? `Etapa ${p.round + 1} de ${c.rounds.length}` : 'Não iniciado') : `Desbloqueia no nível ${c.unlockLevel}`}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="panel setup-section">
            <h2>Etapas</h2>
            <div className="choice-grid">
              {def.rounds.map((round, i) => {
                const track = getTrackDefinition(round.trackId);
                const state = i < progress.round ? 'Concluída' : i === progress.round && !progress.completed ? 'Próxima' : 'Pendente';
                return (
                  <div key={i} className={`choice ${i === progress.round && !progress.completed ? 'selected' : ''}`}>
                    <TrackThumb trackId={round.trackId} />
                    <span className="title">
                      {i + 1}. {track.name}
                    </span>
                    <span className="meta">
                      {track.type === 'sprint' ? 'Sprint' : `${round.laps} voltas`} · {state}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <section className="panel setup-section">
            <h2>{def.name}</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
              {def.description} Pontuação: {POINTS_TABLE.join('-')} (top 8).
            </p>
            <table className="results-table" aria-label="Classificação do campeonato">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Piloto</th>
                  <th>Carro</th>
                  <th>Pontos</th>
                </tr>
              </thead>
              <tbody>
                {table.map((entry, i) => {
                  const racer = def.field.find((f) => f.id === entry.id);
                  const car = racer ? getVehicle(racer.vehicleId) : getVehicle(save.garage.selected);
                  return (
                    <tr key={entry.id} className={entry.isPlayer ? 'player' : ''}>
                      <td>{i + 1}º</td>
                      <td>
                        {entry.name}
                        {entry.rival ? ' ★' : ''}
                      </td>
                      <td className="muted">
                        {car.manufacturer} {car.name}
                      </td>
                      <td>{entry.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="summary-list" style={{ marginTop: '0.8rem' }}>
              {def.rewards.map((r, i) => (
                <div key={i}>
                  <span>Prêmio {i + 1}º lugar</span>
                  <span className="credits" style={{ fontSize: '1rem' }}>
                    {formatCredits(r.credits)} · {r.xp} XP
                  </span>
                </div>
              ))}
            </div>
            {!unlocked ? (
              <div className="warning-banner">Disponível a partir do nível {def.unlockLevel}.</div>
            ) : progress.completed ? (
              <div className="btn-row">
                <span className="tag good">Temporada encerrada: {progress.finalPosition}º lugar</span>
                {!def.careerOnly && (
                  <Button onClick={() => confirmAction('Nova temporada?', 'Os pontos atuais serão zerados para disputar o campeonato novamente.', 'Começar', () => newChampionshipSeason(def.id))}>
                    Nova temporada
                  </Button>
                )}
              </div>
            ) : (
              <Button variant="primary" onClick={() => startChampionshipRound(def.id)} testId="champ-start">
                Correr etapa {progress.round + 1}: {getTrackDefinition(def.rounds[progress.round].trackId).name}
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
