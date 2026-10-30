import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';

export function UnsupportedScreen() {
  const reasons = useStore(appStore, (s) => s.unsupported);
  return (
    <div className="screen center solid">
      <div className="panel unsupported-card" role="alert">
        <div className="logo" style={{ fontSize: '2.4rem' }}>
          Apex<span>Velocity</span>
        </div>
        <h2 className="display" style={{ marginTop: '1.2rem' }}>
          Seu navegador não suporta o jogo
        </h2>
        <ul>
          {reasons.map((r) => (
            <li key={r} style={{ marginBottom: '0.4rem' }}>
              {r}
            </li>
          ))}
        </ul>
        <p className="muted">
          Use uma versão recente do Chrome, Edge, Firefox ou Safari, com aceleração de hardware ativada. Em alguns computadores, é preciso ativar
          “Usar aceleração de hardware quando disponível” nas configurações do navegador.
        </p>
      </div>
    </div>
  );
}
