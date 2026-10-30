import { appStore } from '../../app/appState';
import { exitRace, fastForwardRace, retryLastRace } from '../../app/controller';
import { useStore } from '../../app/store';
import { achievementName } from '../../career/Achievements';
import { DIFFICULTIES } from '../../ai/Difficulty';
import { MODES } from '../../racing/RaceTypes';
import { formatCredits, formatGap, formatTime } from '../../utils/format';
import { getVehicle } from '../../vehicles/VehicleCatalog';
import { Button } from '../components/Controls';

export function ResultsScreen() {
  const race = useStore(appStore, (s) => s.race);
  const pendingEvent = useStore(appStore, (s) => s.pendingEvent);
  const champProgress = useStore(appStore, (s) => (s.pendingEvent?.kind === 'championship' ? s.save.championships[s.pendingEvent.id] : undefined));
  if (!race?.results) return null;
  const championship = pendingEvent?.kind === 'championship';
  const { results, final, outcome } = race;
  const player = results.player;
  const mode = MODES[results.config.mode];
  const competitive = results.results.length > 1;
  const pending = results.results.filter((r) => !r.finished && !r.dnf).length;
  const rewards = results.rewards;

  return (
    <div className="overlay" data-testid="results">
      <div className="panel results-card">
        <div className="results-head">
          <div>
            <div className="eyebrow">
              {mode.label} · {results.trackName}
              {competitive ? ` · ${DIFFICULTIES[results.config.difficulty].label}` : ''}
            </div>
            <h2 style={{ marginBottom: 0 }}>{player.finished ? (results.config.mode === 'drift' ? 'Desafio concluído' : 'Corrida concluída') : 'Sessão encerrada'}</h2>
            {outcome?.newRecord && <span className="tag good">Novo recorde pessoal de volta</span>}
          </div>
          {competitive ? (
            <div className={`results-position ${player.position === 1 ? 'p1' : ''}`} data-testid="results-position">
              {player.position}º<span style={{ fontSize: '0.4em', color: 'var(--muted)' }}>/{results.results.length}</span>
            </div>
          ) : (
            <div style={{ textAlign: 'right' }}>
              <div className="hud-label">{results.config.mode === 'drift' ? 'Pontuação' : 'Melhor volta'}</div>
              <div className="results-position" style={{ fontSize: '3rem' }}>
                {results.config.mode === 'drift' ? Math.round(results.driftScore).toLocaleString('pt-BR') : formatTime(player.bestLap)}
              </div>
            </div>
          )}
        </div>

        <div className="summary-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', display: 'grid', gap: '0.5rem 1.5rem' }}>
          <div>
            <span>Tempo total</span>
            <span className="tabular">{formatTime(player.totalTime)}</span>
          </div>
          <div>
            <span>Melhor volta</span>
            <span className="tabular">{formatTime(player.bestLap)}</span>
          </div>
          {competitive && (
            <div>
              <span>Diferença p/ 1º</span>
              <span className="tabular">{player.position === 1 ? '—' : formatGap(player.gapToLeader)}</span>
            </div>
          )}
          <div>
            <span>Velocidade máxima</span>
            <span className="tabular">{Math.round(results.topSpeed * 3.6)} km/h</span>
          </div>
          <div>
            <span>Colisões fortes</span>
            <span className="tabular">{results.collisions}</span>
          </div>
          <div>
            <span>Drift</span>
            <span className="tabular">{Math.round(results.driftScore).toLocaleString('pt-BR')} pts</span>
          </div>
        </div>

        {competitive && (
          <table className="results-table" aria-label="Classificação">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Piloto</th>
                <th>Carro</th>
                <th>Tempo</th>
                <th>Melhor volta</th>
                <th>Dif.</th>
              </tr>
            </thead>
            <tbody>
              {results.results.map((r) => {
                const v = getVehicle(r.vehicleId);
                return (
                  <tr key={r.id} className={r.isPlayer ? 'player' : ''}>
                    <td>{r.position}º</td>
                    <td>
                      {r.name}
                      {r.rival ? ' ★' : ''}
                    </td>
                    <td className="muted">
                      {v.manufacturer} {v.name}
                    </td>
                    <td>{r.finished ? formatTime(r.totalTime) : r.dnf ? 'Não terminou' : 'Em corrida…'}</td>
                    <td>{formatTime(r.bestLap)}</td>
                    <td>{r.finished && r.position > 1 ? formatGap(r.gapToLeader) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="results-grid">
          <div>
            <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>
              Objetivos
            </div>
            {results.objectives.length === 0 && <div className="muted">Sem objetivos neste modo.</div>}
            {results.objectives.map((o) => (
              <div key={o.objective.label} className={`objective ${o.achieved ? 'ok' : 'fail'}`}>
                <span className="mark">{o.achieved ? '✓' : '✕'}</span>
                {o.objective.label}
              </div>
            ))}
            {outcome?.levelUp && <div className="tag good" style={{ marginTop: '0.6rem' }}>Nível {outcome.levelUp} alcançado!</div>}
            {outcome?.achievements.map((a) => (
              <div key={a} className="tag accent" style={{ marginTop: '0.4rem', marginRight: '0.4rem' }}>
                Conquista: {achievementName(a)}
              </div>
            ))}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>
              Recompensas
            </div>
            {!results.valid && <div className="muted">Sem recompensas: {mode.rewards ? 'evento não concluído.' : 'modo de treino.'}</div>}
            {results.valid &&
              rewards.breakdown.map((line) => (
                <div key={line.label} className="reward-line">
                  <span>{line.label}</span>
                  <span className="tabular">
                    {line.credits > 0 ? `+${formatCredits(line.credits)}` : ''} {line.xp > 0 ? `+${line.xp} XP` : ''}
                  </span>
                </div>
              ))}
            {results.valid && (
              <div className="reward-total">
                <span className="credits">+{formatCredits(rewards.credits)}</span>
                <span>+{rewards.xp} XP</span>
              </div>
            )}
            {results.valid && outcome && !outcome.applied && (
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>
                Recompensa já registrada para esta corrida.
              </div>
            )}
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: '1.3rem', justifyContent: 'flex-end' }}>
          {!final && pending > 0 && (
            <Button onClick={fastForwardRace} testId="fast-forward">
              {championship ? 'Concluir etapa' : 'Concluir corrida dos adversários'} ({pending})
            </Button>
          )}
          {championship && !final && <span className="muted" style={{ alignSelf: 'center', fontSize: '0.82rem' }}>A etapa é registrada quando todos terminarem.</span>}
          {(!championship || (final && !champProgress?.completed)) && (
            <Button onClick={retryLastRace} testId="retry">
              {championship ? '▶ Próxima etapa' : '↺ Repetir evento'}
            </Button>
          )}
          <Button variant="primary" onClick={exitRace} disabled={championship && !final} testId="results-menu">
            {pendingEvent?.kind === 'career' ? 'Voltar à carreira' : championship ? 'Ver campeonato' : 'Menu principal'}
          </Button>
        </div>
      </div>
    </div>
  );
}
