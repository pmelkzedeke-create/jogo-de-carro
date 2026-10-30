import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';
import { Button } from '../components/Controls';
import { LoadSteps } from '../components/LoadSteps';

export function BootScreen() {
  const steps = useStore(appStore, (s) => s.bootSteps);
  const error = useStore(appStore, (s) => s.bootError);
  return (
    <div className="screen center solid">
      <div className="panel loading-card">
        <div className="logo">
          Apex<span>Velocity</span>
          <small>Carregando</small>
        </div>
        <LoadSteps steps={steps} />
        {error && (
          <>
            <div className="error-box" role="alert">
              Não foi possível iniciar o jogo: {error}
            </div>
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <Button variant="primary" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
