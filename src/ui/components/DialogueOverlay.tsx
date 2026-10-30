import { useEffect, useState } from 'react';
import { appStore } from '../../app/appState';
import { closeDialogue, uiSound } from '../../app/controller';
import { useStore } from '../../app/store';
import { CHARACTERS } from '../../career/CareerData';
import { Button } from './Controls';

/** Diálogos fixos da carreira, avançados por clique, Enter ou Espaço. */
export function DialogueOverlay() {
  const dialogue = useStore(appStore, (s) => s.dialogue);
  const playerName = useStore(appStore, (s) => s.save.profile.driverName);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [dialogue]);
  useEffect(() => {
    if (!dialogue) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        advance();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDialogue();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (!dialogue) return null;
  const line = dialogue.lines[Math.min(index, dialogue.lines.length - 1)];
  const character = line.speaker === 'player' ? { name: playerName, role: 'Você', color: '#ffffff' } : CHARACTERS[line.speaker];
  const last = index >= dialogue.lines.length - 1;
  function advance() {
    uiSound('click');
    if (last) closeDialogue();
    else setIndex((i) => i + 1);
  }
  return (
    <div className="overlay dialogue-overlay" role="dialog" aria-modal="true" aria-label={dialogue.title} onClick={advance} data-testid="dialogue">
      <div className="panel dialogue-box" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{dialogue.title}</div>
        {character.name && (
          <div className="dialogue-speaker">
            <span className="avatar" style={{ borderColor: character.color, color: character.color }}>
              {character.name.slice(0, 1)}
            </span>
            <span>
              <strong>{character.name}</strong>
              <small>{character.role}</small>
            </span>
          </div>
        )}
        <p className={`dialogue-text ${character.name ? '' : 'narration'}`}>{line.text}</p>
        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {index + 1}/{dialogue.lines.length}
          </span>
          <span className="btn-row">
            {!last && (
              <Button small sound="back" onClick={closeDialogue}>
                Pular
              </Button>
            )}
            <Button variant="primary" small onClick={advance} autoFocus testId="dialogue-next">
              {last ? 'Continuar' : 'Próximo'}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
