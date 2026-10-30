import { useEffect } from 'react';
import { appStore } from '../../app/appState';
import { closeConfirm } from '../../app/controller';
import { useStore } from '../../app/store';
import { Button } from './Controls';

/** Diálogo de confirmação para ações destrutivas (sair da corrida, redefinir progresso…). */
export function ConfirmDialog() {
  const confirm = useStore(appStore, (s) => s.confirm);
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirm]);
  if (!confirm) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={{ zIndex: 50 }}>
      <div className="panel modal">
        <h2 id="confirm-title">{confirm.title}</h2>
        <p>{confirm.message}</p>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <Button sound="back" onClick={closeConfirm} autoFocus>
            Cancelar
          </Button>
          <Button
            variant={confirm.danger ? 'danger' : 'primary'}
            onClick={() => {
              const action = confirm.onConfirm;
              closeConfirm();
              action();
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
