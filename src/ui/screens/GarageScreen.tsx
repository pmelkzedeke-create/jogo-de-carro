/**
 * Garagem: visualização 3D (arrastar para girar, rolar/pinça para zoom), estatísticas calculadas a
 * partir da física, seleção do carro ativo, compra de carros e de pinturas.
 */
import { useEffect, useRef, useState } from 'react';
import { appStore } from '../../app/appState';
import { getGame, navigate, persist, pushMessage, uiSound } from '../../app/controller';
import { useStore } from '../../app/store';
import { buyPaint, buyVehicle, canBuyVehicle, isVehicleUnlocked, selectVehicle } from '../../career/CareerManager';
import { levelFromXp } from '../../career/Progression';
import { formatCredits } from '../../utils/format';
import { CATEGORY_LABELS, VEHICLES, getVehicle } from '../../vehicles/VehicleCatalog';
import { resolvePhysics } from '../../vehicles/VehicleConfig';
import { estimatePerformance, performanceClass } from '../../vehicles/VehiclePerformance';
import { Button, StatBar } from '../components/Controls';

const DRIVE_LABEL = { FWD: 'Dianteira', RWD: 'Traseira', AWD: 'Integral' } as const;

export function GarageScreen() {
  const save = useStore(appStore, (s) => s.save);
  const [viewId, setViewId] = useState(save.garage.selected);
  const owned = save.garage.owned.find((o) => o.id === viewId);
  const vehicle = getVehicle(viewId);
  const [paintId, setPaintId] = useState(owned?.paint ?? vehicle.visual.defaultPaint);
  const dragArea = useRef<HTMLDivElement>(null);
  const perf = estimatePerformance(vehicle);
  const phys = resolvePhysics(vehicle.physics);
  const unlocked = isVehicleUnlocked(save, viewId);
  const level = levelFromXp(save.profile.xp);

  useEffect(() => {
    const game = getGame();
    if (!game) return;
    game.setGarageMode('garage', dragArea.current);
    return () => game.setGarageMode('menu', null);
  }, []);

  useEffect(() => {
    getGame()?.showVehicle(viewId, paintId);
  }, [viewId, paintId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = (id: string) => {
    const o = save.garage.owned.find((x) => x.id === id);
    setViewId(id);
    setPaintId(o?.paint ?? getVehicle(id).visual.defaultPaint);
    uiSound('click');
  };

  const purchase = () => {
    const result = buyVehicle(save, viewId);
    if (result.error) {
      uiSound('error');
      pushMessage(result.error === 'funds' ? 'Créditos insuficientes' : result.error === 'locked' ? 'Carro ainda bloqueado' : 'Compra indisponível', 'bad', 'buy', 2500);
      return;
    }
    persist(result.save);
    uiSound('purchase');
    setPaintId(vehicle.visual.defaultPaint);
    pushMessage(`${vehicle.manufacturer} ${vehicle.name} adicionado à garagem`, 'good', 'buy', 2500);
  };

  const choosePaint = (id: string) => {
    setPaintId(id);
    if (!owned) return;
    const paint = vehicle.visual.paints.find((p) => p.id === id)!;
    if (owned.ownedPaints.includes(id)) {
      const result = buyPaint(save, viewId, id);
      persist(result.save);
      uiSound('click');
    } else if (save.profile.credits >= paint.price) {
      // Apenas visualiza; a compra é confirmada no botão.
      uiSound('click');
    }
  };

  const paintPrice = vehicle.visual.paints.find((p) => p.id === paintId)?.price ?? 0;
  const paintOwned = !!owned?.ownedPaints.includes(paintId);
  const purchaseError = owned ? null : canBuyVehicle(save, viewId);

  return (
    <div className="garage-screen">
      <div className="panel garage-list" aria-label="Carros">
        <div className="screen-header" style={{ marginBottom: '0.4rem' }}>
          <Button small sound="back" onClick={() => navigate('menu')}>
            ← Voltar
          </Button>
          <h1 style={{ fontSize: '1.8rem' }}>Garagem</h1>
        </div>
        <div className="credits" style={{ marginBottom: '0.4rem' }}>
          {formatCredits(save.profile.credits)}
        </div>
        {VEHICLES.map((v) => {
          const isOwned = save.garage.owned.some((o) => o.id === v.id);
          const isUnlocked = isVehicleUnlocked(save, v.id);
          const p = estimatePerformance(v);
          return (
            <button key={v.id} type="button" className={`vehicle-row ${v.id === viewId ? 'selected' : ''}`} onClick={() => view(v.id)}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                {v.manufacturer} · {CATEGORY_LABELS[v.category]}
              </span>
              <span className="tag accent">
                {performanceClass(p.index)} {p.index}
              </span>
              <span className="name">{v.name}</span>
              <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                {isOwned ? (
                  save.garage.selected === v.id ? (
                    <span className="tag good">Ativo</span>
                  ) : (
                    <span className="tag">Na garagem</span>
                  )
                ) : isUnlocked ? (
                  <span className="credits" style={{ fontSize: '0.95rem' }}>
                    {formatCredits(v.price)}
                  </span>
                ) : (
                  <span className="tag warn">Nível {v.unlock.level}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="garage-drag" ref={dragArea} aria-label="Visualização 3D do carro — arraste para girar, role para aproximar" />

      <div className="panel garage-details">
        <div>
          <div className="eyebrow">
            {vehicle.manufacturer} · {CATEGORY_LABELS[vehicle.category]}
          </div>
          <h2 className="display" style={{ margin: '0.2rem 0', fontSize: '2.2rem' }}>
            {vehicle.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="tag accent">
              Classe {performanceClass(perf.index)} · {perf.index}
            </span>
            {vehicle.provisionalModel && <span className="tag warn" title="Modelo 3D procedural provisório, substituível por GLB">Modelo provisório</span>}
          </div>
          <p className="muted" style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>
            {vehicle.description}
          </p>
        </div>
        <div className="stat-bars">
          <StatBar label="Velocidade" value={perf.ratings.speed} />
          <StatBar label="Aceleração" value={perf.ratings.acceleration} />
          <StatBar label="Dirigibilidade" value={perf.ratings.handling} />
          <StatBar label="Frenagem" value={perf.ratings.braking} />
        </div>
        <div className="summary-list" style={{ margin: 0 }}>
          <div>
            <span>Potência</span>
            <span>{Math.round(vehicle.physics.engine.maxPowerKw * 1.341)} cv</span>
          </div>
          <div>
            <span>Torque</span>
            <span>{vehicle.physics.engine.maxTorqueNm} N·m</span>
          </div>
          <div>
            <span>Peso</span>
            <span>{phys.mass.toLocaleString('pt-BR')} kg</span>
          </div>
          <div>
            <span>Tração</span>
            <span>{DRIVE_LABEL[vehicle.physics.drive]}</span>
          </div>
          <div>
            <span>0–100 km/h (estimado)</span>
            <span>{perf.zeroTo100.toFixed(1)} s</span>
          </div>
          <div>
            <span>Velocidade máxima</span>
            <span>{Math.round(perf.topSpeedKmh)} km/h</span>
          </div>
          <div>
            <span>Frenagem 100–0</span>
            <span>{perf.braking100to0.toFixed(1)} m</span>
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Pintura
          </div>
          <div className="paint-swatches">
            {vehicle.visual.paints.map((p) => {
              const has = !!owned?.ownedPaints.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`swatch ${p.id === paintId ? 'selected' : ''}`}
                  style={{ background: p.color }}
                  title={`${p.name}${has || !owned ? '' : ` — ${formatCredits(p.price)}`}`}
                  aria-label={p.name}
                  onClick={() => choosePaint(p.id)}
                >
                  {owned && !has && <span className="lock">{p.price > 0 ? '$' : ''}</span>}
                </button>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            {vehicle.visual.paints.find((p) => p.id === paintId)?.name}
          </div>
        </div>
        <div className="btn-row">
          {owned ? (
            <>
              {!paintOwned && (
                <Button
                  disabled={save.profile.credits < paintPrice}
                  onClick={() => {
                    const result = buyPaint(save, viewId, paintId);
                    if (result.error) {
                      uiSound('error');
                      return;
                    }
                    persist(result.save);
                    uiSound('purchase');
                  }}
                >
                  Comprar pintura ({formatCredits(paintPrice)})
                </Button>
              )}
              {save.garage.selected !== viewId ? (
                <Button variant="primary" onClick={() => persist(selectVehicle(save, viewId))}>
                  Usar este carro
                </Button>
              ) : (
                <span className="tag good">Carro ativo</span>
              )}
            </>
          ) : unlocked ? (
            <Button variant="primary" disabled={purchaseError === 'funds'} onClick={purchase}>
              Comprar por {formatCredits(vehicle.price)}
            </Button>
          ) : (
            <div className="warning-banner">
              Desbloqueado no nível {vehicle.unlock.level} (você está no nível {level}).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
