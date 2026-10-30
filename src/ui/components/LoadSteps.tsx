import type { LoadStep } from '../../game/Game';

/** Lista de etapas de carregamento com estado real (sem porcentagens inventadas). */
export function LoadSteps(props: { steps: LoadStep[] }) {
  const done = props.steps.filter((s) => s.status === 'done').length;
  const total = props.steps.length;
  return (
    <>
      <ul className="load-steps" aria-live="polite">
        {props.steps.map((step) => (
          <li key={step.id} className={step.status}>
            <span aria-hidden="true">{step.status === 'done' ? '✓' : step.status === 'active' ? <span className="spinner" /> : step.status === 'error' ? '✕' : '·'}</span>
            <span>{step.label}</span>
            <span className="detail">{step.detail ?? ''}</span>
          </li>
        ))}
      </ul>
      {total > 0 ? (
        <div className="progress-determinate" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Etapas concluídas">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
      ) : (
        <div className="progress-indeterminate" aria-label="Carregando" />
      )}
    </>
  );
}
