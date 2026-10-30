/**
 * HUD da corrida. Valores de alta frequência (velocidade, giro, tempos, minimapa) são escritos
 * diretamente no DOM a partir do HudData a cada quadro; o React só re-renderiza em mudanças raras
 * (contagem, contramão, drift ativo, mensagens).
 */
import { useEffect, useRef, useState } from 'react';
import { appStore } from '../../app/appState';
import { getGame, pauseRace } from '../../app/controller';
import { useStore } from '../../app/store';
import { convertSpeed, formatTime, speedUnitLabel } from '../../utils/format';

const RPM_SEGMENTS = 24;

interface RareState {
  phase: string;
  countdown: number;
  wrongWay: boolean;
  drift: boolean;
  showTimeLeft: boolean;
  infinite: boolean;
  competitive: boolean;
}

export function RaceHUD(props: { minimal: boolean; showMinimap: boolean; showFps: boolean; touch: boolean }) {
  const units = useStore(appStore, (s) => s.save.settings.gameplay.units);
  const messages = useStore(appStore, (s) => s.messages);
  const refs = {
    speed: useRef<HTMLSpanElement>(null),
    gear: useRef<HTMLDivElement>(null),
    rpm: useRef<HTMLDivElement>(null),
    position: useRef<HTMLSpanElement>(null),
    racers: useRef<HTMLSpanElement>(null),
    lap: useRef<HTMLSpanElement>(null),
    lapTime: useRef<HTMLSpanElement>(null),
    best: useRef<HTMLSpanElement>(null),
    last: useRef<HTMLSpanElement>(null),
    total: useRef<HTMLSpanElement>(null),
    progress: useRef<HTMLDivElement>(null),
    dots: useRef<SVGGElement>(null),
    driftPoints: useRef<HTMLDivElement>(null),
    driftMult: useRef<HTMLDivElement>(null),
    driftTotal: useRef<HTMLSpanElement>(null),
    timeLeft: useRef<HTMLSpanElement>(null),
    perf: useRef<HTMLDivElement>(null),
  };
  const [rare, setRare] = useState<RareState>({ phase: 'intro', countdown: 3, wrongWay: false, drift: false, showTimeLeft: false, infinite: false, competitive: true });
  const [path, setPath] = useState('');

  useEffect(() => {
    const game = getGame();
    if (!game) return;
    setPath(game.minimapPath());
    let raf = 0;
    let lastRare = '';
    const segs = refs.rpm.current ? [...refs.rpm.current.children] : [];
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const hud = game.hud;
      if (!hud.active) return;
      if (refs.speed.current) refs.speed.current.textContent = String(Math.round(convertSpeed(hud.speed, units)));
      if (refs.gear.current) {
        refs.gear.current.textContent = hud.gear;
        refs.gear.current.className = `gear-box${hud.shifting ? ' shifting' : ''}${hud.rpm >= hud.limiter * 0.985 ? ' limiter' : ''}`;
      }
      const rpmFraction = Math.min(1, hud.rpm / hud.limiter);
      const lit = Math.round(rpmFraction * RPM_SEGMENTS);
      for (let i = 0; i < segs.length; i++) {
        const on = i < lit;
        const el = segs[i] as HTMLElement;
        if ((el.dataset.on === '1') !== on) {
          el.dataset.on = on ? '1' : '0';
          el.classList.toggle('on', on);
        }
      }
      if (refs.position.current) refs.position.current.textContent = String(hud.position);
      if (refs.racers.current) refs.racers.current.textContent = `/${hud.racers}`;
      if (refs.lap.current) refs.lap.current.textContent = hud.infiniteLaps ? String(hud.lap) : `${hud.lap}/${hud.totalLaps}`;
      if (refs.lapTime.current) refs.lapTime.current.textContent = formatTime(hud.lapTime);
      if (refs.best.current) refs.best.current.textContent = formatTime(hud.bestLap ?? hud.personalBest);
      if (refs.last.current) refs.last.current.textContent = formatTime(hud.lastLap);
      if (refs.total.current) refs.total.current.textContent = formatTime(hud.totalTime);
      if (refs.progress.current) refs.progress.current.style.width = `${(hud.progress * 100).toFixed(1)}%`;
      if (refs.timeLeft.current && hud.timeLeft !== null) refs.timeLeft.current.textContent = formatTime(hud.timeLeft).slice(0, -2);
      if (refs.driftPoints.current) refs.driftPoints.current.textContent = hud.driftChain.toLocaleString('pt-BR');
      if (refs.driftMult.current) refs.driftMult.current.textContent = `×${hud.driftMultiplier.toFixed(1)}`;
      if (refs.driftTotal.current) refs.driftTotal.current.textContent = hud.driftTotal.toLocaleString('pt-BR');
      const dots = refs.dots.current;
      if (dots) {
        for (let i = 0; i < dots.children.length; i++) {
          const dot = dots.children[i] as SVGCircleElement;
          if (i >= hud.minimapCount) {
            dot.setAttribute('visibility', 'hidden');
            continue;
          }
          dot.setAttribute('visibility', 'visible');
          dot.setAttribute('cx', (hud.minimap[i * 2] * 100).toFixed(1));
          dot.setAttribute('cy', (hud.minimap[i * 2 + 1] * 100).toFixed(1));
          const cls = i === hud.playerIndex ? 'dot player' : hud.rivalMask[i] ? 'dot rival' : 'dot';
          if (dot.getAttribute('class') !== cls) dot.setAttribute('class', cls);
          dot.setAttribute('r', i === hud.playerIndex ? '4.2' : '3');
        }
      }
      if (refs.perf.current) {
        refs.perf.current.textContent = `${hud.fps.toFixed(0)} FPS · CPU ${hud.frameMs.toFixed(1)} ms · física ${hud.physicsMs.toFixed(2)} ms · ${hud.drawCalls} draw calls · ${(hud.triangles / 1000).toFixed(0)}k triângulos`;
      }
      const competitive = hud.racers > 1;
      const key = `${hud.phase}|${hud.countdown}|${hud.wrongWay}|${hud.driftActive}|${hud.timeLeft !== null}|${hud.infiniteLaps}|${competitive}`;
      if (key !== lastRare) {
        lastRare = key;
        setRare({ phase: hud.phase, countdown: hud.countdown, wrongWay: hud.wrongWay, drift: hud.driftActive, showTimeLeft: hud.timeLeft !== null, infinite: hud.infiniteLaps, competitive });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  const showCountdown = rare.phase === 'countdown' || (rare.phase === 'racing' && rare.countdown === 0);
  return (
    <div className={`hud ${props.minimal ? 'minimal' : ''}`} data-testid="hud">
      {props.showFps && <div className="perf-overlay" ref={refs.perf} />}

      <div className="hud-tl">
        {rare.competitive && (
          <div className="hud-position">
            <span className="big" ref={refs.position} data-testid="hud-position">
              1
            </span>
            <span className="total" ref={refs.racers}>
              /1
            </span>
          </div>
        )}
        <div>
          <div className="hud-label">Volta</div>
          <span className="hud-lap" ref={refs.lap} data-testid="hud-lap">
            1/1
          </span>
        </div>
      </div>

      <div className="hud-tr">
        <span className="hud-label">Volta atual</span>
        <span className="time main" ref={refs.lapTime}>
          --:--.---
        </span>
        <span className="hud-label secondary">Melhor</span>
        <span className="time best secondary" ref={refs.best}>
          --:--.---
        </span>
        <span className="hud-label secondary">Última</span>
        <span className="time secondary" ref={refs.last}>
          --:--.---
        </span>
        <span className="hud-label secondary">Total</span>
        <span className="time secondary" ref={refs.total}>
          --:--.---
        </span>
      </div>

      {rare.showTimeLeft && (
        <div className="hud-center-top">
          <div className="hud-label">Tempo restante</div>
          <span className="value" ref={refs.timeLeft}>
            --:--
          </span>
          <div className="hud-label" style={{ marginTop: '0.3rem' }}>
            Drift total <span ref={refs.driftTotal}>0</span>
          </div>
        </div>
      )}

      <div className="hud-messages">
        {messages.map((m) => (
          <div key={m.id} className={`hud-message ${m.kind}`}>
            {m.text}
          </div>
        ))}
      </div>

      {showCountdown && rare.phase === 'countdown' && (
        <div key={rare.countdown} className="countdown" aria-live="assertive">
          {rare.countdown}
        </div>
      )}
      {rare.phase === 'racing' && rare.countdown === 0 && <GoFlash />}
      {rare.wrongWay && <div className="wrong-way">Contramão</div>}

      <div className="drift-meter" style={{ opacity: rare.drift ? 1 : 0 }} aria-hidden={!rare.drift}>
        <div className="hud-label">Drift</div>
        <div className="points" ref={refs.driftPoints}>
          0
        </div>
        <div className="mult" ref={refs.driftMult}>
          ×1.0
        </div>
      </div>

      {(props.showMinimap || !props.minimal) && (
        <div className="hud-bl">
          {props.showMinimap && (
            <div className="minimap" aria-label="Minimapa">
              <svg viewBox="0 0 100 100">
                <path className="track-line" d={path} />
                <g ref={refs.dots}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <circle key={i} className="dot" r="3" cx="-10" cy="-10" visibility="hidden" />
                  ))}
                </g>
              </svg>
            </div>
          )}
          <div className="progress-bar" aria-label="Progresso da corrida">
            <div ref={refs.progress} />
          </div>
        </div>
      )}

      <div className="hud-br" style={props.touch ? { bottom: '10.5rem' } : undefined}>
        <div className="speedo">
          <span className="speed-value" ref={refs.speed} data-testid="hud-speed">
            0
          </span>
          <span className="speed-unit">{speedUnitLabel(units)}</span>
          <div className="rpm-bar" ref={refs.rpm}>
            {Array.from({ length: RPM_SEGMENTS }, (_, i) => (
              <span key={i} className={i >= RPM_SEGMENTS * 0.86 ? 'red' : ''} />
            ))}
          </div>
        </div>
        <div className="gear-box" ref={refs.gear}>
          N
        </div>
      </div>

      {props.touch && (
        <button type="button" className="icon-btn hud-pause-btn" aria-label="Pausar" onClick={pauseRace}>
          ❚❚
        </button>
      )}
    </div>
  );
}

function GoFlash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return <div className="countdown go">Vai!</div>;
}
