import { useEffect } from 'react';
import { DIFFICULTIES } from '../../ai/Difficulty';
import { appStore } from '../../app/appState';
import { maybeShowChapterIntro, navigate, startCareerEvent } from '../../app/controller';
import { useStore } from '../../app/store';
import { CAREER } from '../../career/CareerData';
import { careerFinished, eventStatus, isChapterUnlocked } from '../../career/CareerProgress';
import { MODES } from '../../racing/RaceTypes';
import { getTrackDefinition } from '../../tracks/TrackCatalog';
import { formatCredits } from '../../utils/format';
import { getVehicle } from '../../vehicles/VehicleCatalog';
import { Button, ScreenHeader } from '../components/Controls';

const MODE_LABEL = { career: 'Corrida', timeTrial: 'Contrarrelógio', drift: 'Drift' } as const;

export function CareerScreen() {
  const save = useStore(appStore, (s) => s.save);
  const dialogueOpen = useStore(appStore, (s) => s.dialogue !== null);
  const car = getVehicle(save.garage.selected);

  useEffect(() => {
    if (dialogueOpen) return;
    const current = CAREER.findIndex((_, i) => isChapterUnlocked(save, i) && !save.career.completedChapters.includes(CAREER[i].id));
    if (current >= 0) maybeShowChapterIntro(current);
  }, [save, dialogueOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !appStore.get().dialogue) navigate('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen solid" style={{ flexDirection: 'column' }}>
      <ScreenHeader title="Carreira — Do Litoral à Liga" onBack={() => navigate('menu')}>
        <span className="tag">Carro ativo: {car.manufacturer} {car.name}</span>{' '}
        <Button small onClick={() => navigate('garage')}>
          Garagem
        </Button>
      </ScreenHeader>
      {careerFinished(save) && <div className="warning-banner" style={{ marginBottom: '1rem', borderColor: 'rgba(52,199,89,.5)', color: '#b9f5c9', background: 'rgba(52,199,89,.08)' }}>História concluída! Você chegou à Liga Nacional. Os eventos podem ser repetidos para melhorar sua posição.</div>}
      <div style={{ display: 'grid', gap: '1.2rem', maxWidth: 1100 }}>
        {CAREER.map((chapter, ci) => {
          const unlocked = isChapterUnlocked(save, ci);
          const done = save.career.completedChapters.includes(chapter.id);
          return (
            <section key={chapter.id} className="panel setup-section" style={{ opacity: unlocked ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0, color: '#fff', letterSpacing: '0.06em' }}>{chapter.title}</h2>
                <span className={`tag ${done ? 'good' : unlocked ? 'accent' : ''}`}>{done ? 'Concluído' : unlocked ? 'Em andamento' : 'Bloqueado'}</span>
              </div>
              <p className="muted" style={{ marginTop: '0.4rem', fontSize: '0.88rem' }}>
                {unlocked ? chapter.subtitle : 'Conclua o capítulo anterior para desbloquear.'}
              </p>
              <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {chapter.events.map((event) => {
                  const status = eventStatus(save, event.id);
                  const track = getTrackDefinition(event.trackId);
                  const best = save.career.eventBest[event.id];
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`choice ${status === 'available' ? 'selected' : ''}`}
                      disabled={status === 'locked'}
                      onClick={() => startCareerEvent(event.id)}
                      data-testid={`career-${event.id}`}
                    >
                      <span className="meta">
                        {event.championshipId ? 'Campeonato' : MODE_LABEL[event.mode]} · {track.name}
                        {event.mode === 'career' && !event.championshipId ? ` · ${event.laps} ${event.laps === 1 ? 'volta' : 'voltas'}` : ''}
                      </span>
                      <span className="title">{event.title}</span>
                      <span className="meta" style={{ lineHeight: 1.45 }}>
                        {event.description}
                      </span>
                      <span className="meta">
                        {MODES[event.mode].hasOpponents && !event.championshipId ? `${event.fieldSize - 1} adversários · ${DIFFICULTIES[event.difficulty].label}` : ''}
                        {event.rivals.length ? ` · Rival: ${event.rivals.map((r) => r.name).join(', ')}` : ''}
                      </span>
                      <span className="meta">Objetivo: {event.objectives.map((o) => o.label).join('; ')}</span>
                      <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', alignItems: 'center' }}>
                        <span className="credits" style={{ fontSize: '0.95rem' }}>
                          Bônus {formatCredits(event.completionBonus.credits)}
                        </span>
                        <span className={`tag ${status === 'completed' ? 'good' : status === 'available' ? 'accent' : ''}`}>
                          {status === 'completed' ? `Concluído${best ? ` · ${best}º` : ''}` : status === 'available' ? 'Disponível' : 'Bloqueado'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
