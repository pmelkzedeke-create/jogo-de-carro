import { useEffect, useState } from 'react';
import { appStore } from '../../app/appState';
import { navigate } from '../../app/controller';
import { useStore } from '../../app/store';
import { ACHIEVEMENTS } from '../../career/Achievements';
import { levelProgress, reputationTitle } from '../../career/Progression';
import { MODES, type GameMode } from '../../racing/RaceTypes';
import { TRACKS } from '../../tracks/TrackCatalog';
import { formatCredits, formatTime } from '../../utils/format';
import { findVehicle } from '../../vehicles/VehicleCatalog';
import { ScreenHeader } from '../components/Controls';

type Tab = 'stats' | 'records' | 'history' | 'achievements';

export function StatsScreen() {
  const save = useStore(appStore, (s) => s.save);
  const [tab, setTab] = useState<Tab>('stats');
  const st = save.stats;
  const lvl = levelProgress(save.profile.xp);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const hours = Math.floor(st.timeDrivingSec / 3600);
  const minutes = Math.floor((st.timeDrivingSec % 3600) / 60);
  return (
    <div className="screen solid" style={{ flexDirection: 'column' }}>
      <ScreenHeader title="Estatísticas" onBack={() => navigate('menu')} />
      <div className="tabs" role="tablist">
        {(
          [
            ['stats', 'Piloto'],
            ['records', 'Recordes'],
            ['history', 'Histórico'],
            ['achievements', 'Conquistas'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel settings-panel" style={{ maxWidth: 900 }}>
        {tab === 'stats' && (
          <div className="summary-list" style={{ padding: '0.8rem 0' }}>
            {(
              [
                ['Nível', `${lvl.level} (${save.profile.xp.toLocaleString('pt-BR')} XP)`],
                ['Reputação', `${save.profile.reputation} — ${reputationTitle(save.profile.reputation)}`],
                ['Créditos', formatCredits(save.profile.credits)],
                ['Corridas iniciadas / concluídas', `${st.racesStarted} / ${st.racesFinished}`],
                ['Vitórias / pódios', `${st.wins} / ${st.podiums}`],
                ['Distância percorrida', `${st.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`],
                ['Tempo pilotando', `${hours} h ${minutes} min`],
                ['Velocidade máxima', `${Math.round(st.topSpeedKmh)} km/h`],
                ['Pontos de drift (total)', st.driftPoints.toLocaleString('pt-BR')],
                ['Melhor sequência de drift', st.bestDriftChain.toLocaleString('pt-BR')],
                ['Colisões fortes', String(st.collisions)],
                ['Carros na garagem', String(save.garage.owned.length)],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'records' && (
          <table className="results-table" style={{ margin: '0.6rem 0' }}>
            <thead>
              <tr>
                <th>Pista</th>
                <th>Melhor volta</th>
                <th>Carro</th>
                <th>Melhor corrida</th>
                <th>Melhor drift</th>
              </tr>
            </thead>
            <tbody>
              {TRACKS.map((t) => {
                const r = save.records[t.id];
                const v = r?.bestLapVehicle ? findVehicle(r.bestLapVehicle) : undefined;
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{formatTime(r?.bestLap ?? null)}</td>
                    <td className="muted">{v ? `${v.manufacturer} ${v.name}` : '—'}</td>
                    <td>{formatTime(r?.bestRace ?? null)}</td>
                    <td>{r?.bestDrift ? r.bestDrift.toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'history' &&
          (save.history.length === 0 ? (
            <p className="muted">Nenhuma corrida registrada ainda.</p>
          ) : (
            <table className="results-table" style={{ margin: '0.6rem 0' }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Modo</th>
                  <th>Pista</th>
                  <th>Pos.</th>
                  <th>Tempo</th>
                  <th>Ganhos</th>
                </tr>
              </thead>
              <tbody>
                {save.history.slice(0, 25).map((h) => (
                  <tr key={h.id}>
                    <td className="muted">{h.date ? new Date(h.date).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{MODES[h.mode as GameMode]?.label ?? h.mode}</td>
                    <td>{TRACKS.find((t) => t.id === h.trackId)?.name ?? h.trackId}</td>
                    <td>{h.racers > 1 ? `${h.position}º/${h.racers}` : '—'}</td>
                    <td>{formatTime(h.totalTime)}</td>
                    <td>{h.credits > 0 ? formatCredits(h.credits) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {tab === 'achievements' && (
          <div style={{ display: 'grid', gap: '0.5rem', padding: '0.8rem 0' }}>
            {ACHIEVEMENTS.map((a) => {
              const date = save.achievements[a.id];
              return (
                <div key={a.id} className="field" style={{ opacity: date ? 1 : 0.55 }}>
                  <div className="label">
                    {date ? '🏆 ' : '🔒 '}
                    {a.name}
                    <span className="hint">{a.description}</span>
                  </div>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {date ? new Date(date).toLocaleDateString('pt-BR') : 'Bloqueada'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
