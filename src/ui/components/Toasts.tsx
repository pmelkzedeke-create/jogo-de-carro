import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';

/** Avisos fora da corrida (menus, garagem): mesma fila de mensagens do HUD. */
export function Toasts() {
  const messages = useStore(appStore, (s) => s.messages);
  if (messages.length === 0) return null;
  return (
    <div className="toasts passthrough" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`hud-message ${m.kind}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
