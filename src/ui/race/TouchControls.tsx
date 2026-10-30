/**
 * Controles de toque: volante analógico (arrastar), acelerador, freio, freio de mão, câmera,
 * recuperação e pausa. Cada controle solta imediatamente em pointerup/pointercancel/lostpointercapture,
 * inclusive quando o dedo sai da área do botão. A página não rola durante o uso.
 */
import { useEffect, useRef, useState } from 'react';
import { getGame, pauseRace } from '../../app/controller';

type Pedal = 'throttle' | 'brake' | 'handbrake';

function usePedal(pedal: Pedal) {
  const [pressed, setPressed] = useState(false);
  const pointer = useRef<number | null>(null);
  const set = (value: number) => {
    const game = getGame();
    if (!game) return;
    game.input.touch.active = true;
    game.input.touch[pedal] = value;
  };
  const release = () => {
    pointer.current = null;
    setPressed(false);
    set(0);
  };
  return {
    pressed,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        set(1);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

export function TouchControls() {
  const throttle = usePedal('throttle');
  const brake = usePedal('brake');
  const handbrake = usePedal('handbrake');
  const knob = useRef<HTMLDivElement>(null);
  const steerPointer = useRef<number | null>(null);
  const steerOrigin = useRef(0);
  const steerWidth = useRef(1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Impede rolagem/zoom da página durante a corrida em dispositivos de toque.
    const el = root.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
      const game = getGame();
      if (game) {
        game.input.touch.throttle = 0;
        game.input.touch.brake = 0;
        game.input.touch.steer = 0;
        game.input.touch.handbrake = 0;
        game.input.touch.active = false;
      }
    };
  }, []);

  const setSteer = (value: number) => {
    const game = getGame();
    if (!game) return;
    game.input.touch.active = true;
    game.input.touch.steer = Math.max(-1, Math.min(1, value));
    if (knob.current) knob.current.style.transform = `translateX(${(game.input.touch.steer * steerWidth.current * 0.38).toFixed(1)}px)`;
  };
  const releaseSteer = () => {
    steerPointer.current = null;
    setSteer(0);
  };

  return (
    <div className="touch-controls" ref={root} data-testid="touch-controls">
      <div
        className="touch-steer"
        role="slider"
        aria-label="Direção"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={0}
        onPointerDown={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          steerPointer.current = e.pointerId;
          steerOrigin.current = rect.left + rect.width / 2;
          steerWidth.current = rect.width;
          e.currentTarget.setPointerCapture(e.pointerId);
          setSteer((e.clientX - steerOrigin.current) / (rect.width * 0.38));
        }}
        onPointerMove={(e) => {
          if (steerPointer.current !== e.pointerId) return;
          setSteer((e.clientX - steerOrigin.current) / (steerWidth.current * 0.38));
        }}
        onPointerUp={releaseSteer}
        onPointerCancel={releaseSteer}
        onLostPointerCapture={releaseSteer}
      >
        <div className="knob" ref={knob} />
      </div>

      <div className="touch-pedals">
        <button type="button" className={`touch-btn handbrake ${handbrake.pressed ? 'pressed' : ''}`} aria-label="Freio de mão" {...handbrake.handlers}>
          Freio de mão
        </button>
        <button type="button" className={`touch-btn brake ${brake.pressed ? 'pressed' : ''}`} aria-label="Freio e ré" {...brake.handlers}>
          Freio
        </button>
        <button type="button" className={`touch-btn throttle ${throttle.pressed ? 'pressed' : ''}`} aria-label="Acelerador" {...throttle.handlers}>
          Acelerar
        </button>
      </div>

      <div className="touch-top">
        <button type="button" className="touch-btn" aria-label="Trocar câmera" onClick={() => getGame()?.cycleCamera()}>
          Câm
        </button>
        <button type="button" className="touch-btn" aria-label="Recuperar carro" onClick={() => getGame()?.requestRecovery()}>
          Rec
        </button>
        <button type="button" className="touch-btn" aria-label="Pausar" onClick={pauseRace}>
          ❚❚
        </button>
      </div>
    </div>
  );
}
