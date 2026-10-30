/**
 * Controles reutilizáveis da interface (botões, alternadores, seletores, sliders).
 */
import type { ReactNode } from 'react';
import { uiSound } from '../../app/controller';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'ghost' | 'default';
  small?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  className?: string;
  sound?: 'click' | 'confirm' | 'back' | 'none';
  testId?: string;
}) {
  const classes = ['btn', props.variant && props.variant !== 'default' ? props.variant : '', props.small ? 'small' : '', props.className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      title={props.title}
      data-testid={props.testId}
      onClick={() => {
        if (props.sound !== 'none') uiSound(props.sound ?? (props.variant === 'primary' ? 'confirm' : 'click'));
        props.onClick?.();
      }}
    >
      {props.children}
    </button>
  );
}

export function Toggle(props: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.value}
      aria-label={props.label}
      className={`toggle ${props.value ? 'on' : ''}`}
      onClick={() => {
        uiSound('toggle');
        props.onChange(!props.value);
      }}
    />
  );
}

export function Segmented<T extends string | number>(props: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'active' : ''}
          disabled={o.disabled}
          onClick={() => {
            uiSound('toggle');
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider(props: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; label: string; format?: (v: number) => string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="tabular" style={{ minWidth: '3.2rem', textAlign: 'right' }}>
        {props.format ? props.format(props.value) : props.value}
      </span>
    </span>
  );
}

export function Stepper(props: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  return (
    <span className="stepper" aria-label={props.label}>
      <button type="button" aria-label={`Diminuir ${props.label}`} disabled={props.value <= props.min} onClick={() => props.onChange(Math.max(props.min, props.value - 1))}>
        −
      </button>
      <output>{props.value}</output>
      <button type="button" aria-label={`Aumentar ${props.label}`} disabled={props.value >= props.max} onClick={() => props.onChange(Math.min(props.max, props.value + 1))}>
        +
      </button>
    </span>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="label">
        {props.label}
        {props.hint && <span className="hint">{props.hint}</span>}
      </div>
      <div>{props.children}</div>
    </div>
  );
}

export function StatBar(props: { label: string; value: number; max?: number; display?: string }) {
  const max = props.max ?? 10;
  return (
    <div className="stat-bar">
      <span className="muted">{props.label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(2, Math.min(100, (props.value / max) * 100))}%` }} />
      </div>
      <span className="value">{props.display ?? props.value.toFixed(1)}</span>
    </div>
  );
}

export function ScreenHeader(props: { title: string; onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="screen-header">
      {props.onBack && (
        <Button className="back-btn" small sound="back" onClick={props.onBack}>
          ← Voltar
        </Button>
      )}
      <h1>{props.title}</h1>
      <div style={{ marginLeft: 'auto' }}>{props.children}</div>
    </div>
  );
}
