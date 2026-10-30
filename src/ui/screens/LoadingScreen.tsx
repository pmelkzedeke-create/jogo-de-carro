import { appStore } from '../../app/appState';
import { navigate, retryLastRace } from '../../app/controller';
import { useStore } from '../../app/store';
import { Button } from '../components/Controls';
import { LoadSteps } from '../components/LoadSteps';

export function LoadingScreen() {
  const steps = useStore(appStore, (s) => s.loadSteps);
  const error = useStore(appStore, (s) => s.loadError);
  const title = useStore(appStore, (s) => s.loadTitle);
  return (
    <div className="screen center">
      <div className="panel loading-card">
        <div className="eyebrow">Preparando evento</div>
        <h2 className="display" style={{ margin: '0.3rem 0 0', fontSize: '1.9rem' }}>
          {title}
        </h2>
        <LoadSteps steps={steps} />
        {error && (
          <>
            <div className="error-box" role="alert">
              Falha ao carregar: {error}
            </div>
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <Button variant="primary" onClick={retryLastRace}>
                Tentar novamente
              </Button>
              <Button onClick={() => navigate('menu')}>Voltar ao menu</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
