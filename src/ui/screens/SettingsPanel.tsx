/**
 * Painel de configurações (usado no menu e na pausa). Todas as opções exibidas alteram o jogo de fato
 * e são persistidas no armazenamento local.
 */
import { useState } from 'react';
import { appStore } from '../../app/appState';
import { confirmAction, persist, resetProgress, updateSettings } from '../../app/controller';
import { useStore } from '../../app/store';
import { AUDIO_MANIFEST } from '../../audio/AudioManager';
import { ACTION_LABELS, DEFAULT_KEYMAP, keyLabel, type GameAction } from '../../input/Keymap';
import type { QualityPreset, Settings } from '../../persistence/SaveSchema';
import { CAMERA_LABELS, CAMERA_VIEWS } from '../../rendering/CameraRig';
import { Button, Field, Segmented, Slider, Toggle } from '../components/Controls';

type Tab = 'graphics' | 'controls' | 'camera' | 'audio' | 'game';

const PRESETS: Record<Exclude<QualityPreset, 'custom'>, Partial<Settings['graphics']>> = {
  low: { renderScale: 0.7, shadows: 'off', drawDistance: 'near', particles: 'low', effects: 'low' },
  medium: { renderScale: 0.85, shadows: 'low', drawDistance: 'medium', particles: 'medium', effects: 'low' },
  high: { renderScale: 1, shadows: 'medium', drawDistance: 'far', particles: 'medium', effects: 'medium' },
  ultra: { renderScale: 1.25, shadows: 'high', drawDistance: 'far', particles: 'high', effects: 'high' },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function setGraphics(partial: Partial<Settings['graphics']>, keepPreset = false) {
  updateSettings((s) => ({ ...s, graphics: { ...s.graphics, ...partial, preset: keepPreset ? s.graphics.preset : 'custom' } }));
}

export function SettingsPanel(props: { inRace?: boolean }) {
  const settings = useStore(appStore, (s) => s.save.settings);
  const driverName = useStore(appStore, (s) => s.save.profile.driverName);
  const [tab, setTab] = useState<Tab>('graphics');
  const g = settings.graphics;
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function';

  const toggleFullscreen = async (on: boolean) => {
    try {
      if (on) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      setFullscreen(!!document.fullscreenElement);
    } catch {
      setFullscreen(!!document.fullscreenElement);
    }
  };

  return (
    <div className="settings-layout">
      <div className="tabs" role="tablist">
        {(
          [
            ['graphics', 'Gráficos'],
            ['controls', 'Controles'],
            ['camera', 'Câmera'],
            ['audio', 'Áudio'],
            ['game', 'Jogo'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel settings-panel">
        {tab === 'graphics' && (
          <>
            <Field label="Predefinição de qualidade" hint="Aplica um conjunto equilibrado de opções">
              <Segmented
                label="Qualidade"
                value={g.preset}
                options={[
                  { value: 'low', label: 'Baixa' },
                  { value: 'medium', label: 'Média' },
                  { value: 'high', label: 'Alta' },
                  { value: 'ultra', label: 'Ultra' },
                  { value: 'custom', label: 'Personalizada', disabled: true },
                ]}
                onChange={(preset) => {
                  if (preset === 'custom') return;
                  updateSettings((s) => ({ ...s, graphics: { ...s.graphics, ...PRESETS[preset], preset } }));
                }}
              />
            </Field>
            <Field label="Escala de resolução" hint="Menor = mais desempenho; acima de 100% = supersampling">
              <Slider label="Escala de resolução" value={g.renderScale} min={0.5} max={1.5} step={0.05} format={pct} onChange={(renderScale) => setGraphics({ renderScale })} />
            </Field>
            <Field label="Sombras" hint="Mapa de sombras dinâmico do sol (aproximação, não ray tracing)">
              <Segmented
                label="Sombras"
                value={g.shadows}
                options={[
                  { value: 'off', label: 'Desligadas' },
                  { value: 'low', label: 'Baixas' },
                  { value: 'medium', label: 'Médias' },
                  { value: 'high', label: 'Altas' },
                ]}
                onChange={(shadows) => setGraphics({ shadows })}
              />
            </Field>
            <Field label="Distância de renderização" hint="Alcance da câmera e da neblina">
              <Segmented
                label="Distância"
                value={g.drawDistance}
                options={[
                  { value: 'near', label: 'Curta' },
                  { value: 'medium', label: 'Média' },
                  { value: 'far', label: 'Longa' },
                ]}
                onChange={(drawDistance) => setGraphics({ drawDistance })}
              />
            </Field>
            <Field label="Partículas" hint="Fumaça, poeira e faíscas (marcas de pneu também escalam)">
              <Segmented
                label="Partículas"
                value={g.particles}
                options={[
                  { value: 'off', label: 'Desligadas' },
                  { value: 'low', label: 'Poucas' },
                  { value: 'medium', label: 'Médias' },
                  { value: 'high', label: 'Muitas' },
                ]}
                onChange={(particles) => setGraphics({ particles })}
              />
            </Field>
            <Field label="Efeitos de pós-processamento" hint="Baixo: sem bloom; Médio/Alto: bloom e antisserrilhamento por amostragem múltipla">
              <Segmented
                label="Efeitos"
                value={g.effects}
                options={[
                  { value: 'low', label: 'Baixo' },
                  { value: 'medium', label: 'Médio' },
                  { value: 'high', label: 'Alto' },
                ]}
                onChange={(effects) => setGraphics({ effects })}
              />
            </Field>
            <Field label="Limite de quadros" hint="“Monitor” sincroniza com a taxa de atualização da tela (equivalente ao VSync)">
              <Segmented
                label="Limite de FPS"
                value={g.fpsLimit}
                options={[
                  { value: 0, label: 'Monitor' },
                  { value: 60, label: '60' },
                  { value: 30, label: '30' },
                ]}
                onChange={(fpsLimit) => setGraphics({ fpsLimit }, true)}
              />
            </Field>
            <Field label="Mostrar desempenho" hint="FPS, tempo de CPU e física, chamadas de desenho">
              <Toggle label="Mostrar desempenho" value={g.showFps} onChange={(showFps) => setGraphics({ showFps }, true)} />
            </Field>
            {fullscreenSupported && (
              <Field label="Tela cheia">
                <Toggle label="Tela cheia" value={fullscreen} onChange={(on) => void toggleFullscreen(on)} />
              </Field>
            )}
          </>
        )}

        {tab === 'controls' && (
          <>
            <Field label="Sensibilidade da direção" hint="Velocidade de giro do volante no teclado e resposta do analógico">
              <Slider
                label="Sensibilidade"
                value={settings.controls.steeringSensitivity}
                min={0.5}
                max={1.5}
                step={0.05}
                format={pct}
                onChange={(steeringSensitivity) => updateSettings((s) => ({ ...s, controls: { ...s.controls, steeringSensitivity } }))}
              />
            </Field>
            <Field label="Assistências de pilotagem" hint="ABS, controle de tração, estabilidade e ajuda no contraesterço">
              <Segmented
                label="Assistências"
                value={settings.controls.assist}
                options={[
                  { value: 'off', label: 'Desligadas' },
                  { value: 'low', label: 'Baixas' },
                  { value: 'medium', label: 'Médias' },
                  { value: 'high', label: 'Altas' },
                ]}
                onChange={(assist) => updateSettings((s) => ({ ...s, controls: { ...s.controls, assist } }))}
              />
            </Field>
            <Field label="Controles de toque" hint="Automático: aparecem em telas sensíveis ao toque">
              <Segmented
                label="Controles de toque"
                value={settings.controls.touch}
                options={[
                  { value: 'auto', label: 'Automático' },
                  { value: 'on', label: 'Sempre' },
                  { value: 'off', label: 'Nunca' },
                ]}
                onChange={(touch) => updateSettings((s) => ({ ...s, controls: { ...s.controls, touch } }))}
              />
            </Field>
            <Field label="Zona morta do controle" hint="Ignora pequenos movimentos do analógico">
              <Slider
                label="Zona morta"
                value={settings.controls.gamepadDeadzone}
                min={0.02}
                max={0.4}
                step={0.01}
                format={pct}
                onChange={(gamepadDeadzone) => updateSettings((s) => ({ ...s, controls: { ...s.controls, gamepadDeadzone } }))}
              />
            </Field>
            <div style={{ padding: '0.8rem 0' }}>
              <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>
                Teclado
              </div>
              <div className="grid-2" style={{ gap: '0.3rem 1.5rem', fontSize: '0.88rem' }}>
                {(Object.keys(DEFAULT_KEYMAP) as GameAction[]).map((action) => (
                  <div key={action} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span className="muted">{ACTION_LABELS[action]}</span>
                    <span>{DEFAULT_KEYMAP[action].map(keyLabel).join(' / ')}</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Controle (padrão Xbox/PlayStation): RT acelera, LT freia/ré, analógico esquerdo esterça, A/X freio de mão, Y câmera, B recuperar, Start pausa, Back
                reinicia.
              </p>
            </div>
          </>
        )}

        {tab === 'camera' && (
          <>
            <Field label="Câmera inicial">
              <Segmented
                label="Câmera inicial"
                value={settings.camera.defaultView}
                options={CAMERA_VIEWS.map((v) => ({ value: v, label: CAMERA_LABELS[v].replace('Perseguição ', '') }))}
                onChange={(defaultView) => updateSettings((s) => ({ ...s, camera: { ...s.camera, defaultView } }))}
              />
            </Field>
            <Field label="Distância da câmera">
              <Slider label="Distância" value={settings.camera.distance} min={0.7} max={1.5} step={0.05} format={pct} onChange={(distance) => updateSettings((s) => ({ ...s, camera: { ...s.camera, distance } }))} />
            </Field>
            <Field label="Altura da câmera">
              <Slider label="Altura" value={settings.camera.height} min={0.7} max={1.5} step={0.05} format={pct} onChange={(height) => updateSettings((s) => ({ ...s, camera: { ...s.camera, height } }))} />
            </Field>
            <Field label="Campo de visão (FOV)" hint="Aumenta levemente com a velocidade">
              <Slider label="FOV" value={settings.camera.fov} min={50} max={95} step={1} format={(v) => `${v}°`} onChange={(fov) => updateSettings((s) => ({ ...s, camera: { ...s.camera, fov } }))} />
            </Field>
            <Field label="Intensidade de vibração" hint="Impactos, velocidade e superfícies irregulares">
              <Slider label="Vibração" value={settings.camera.shake} min={0} max={1} step={0.05} format={pct} onChange={(shake) => updateSettings((s) => ({ ...s, camera: { ...s.camera, shake } }))} />
            </Field>
          </>
        )}

        {tab === 'audio' && (
          <>
            {(
              [
                ['master', 'Volume geral'],
                ['engine', 'Motor'],
                ['sfx', 'Efeitos (pneus, colisões)'],
                ['ui', 'Interface'],
                ['ambience', 'Ambiente (vento)'],
              ] as Array<[keyof Settings['audio'], string]>
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Slider label={label} value={settings.audio[key]} min={0} max={1} step={0.05} format={pct} onChange={(value) => updateSettings((s) => ({ ...s, audio: { ...s.audio, [key]: value } }))} />
              </Field>
            ))}
            <div style={{ padding: '0.8rem 0', fontSize: '0.82rem' }} className="muted">
              <strong style={{ color: 'var(--warn)' }}>Sons provisórios:</strong> todos os sons atuais são sintetizados em tempo real (Web Audio). Arquivos de áudio
              esperados e ainda não fornecidos em <code>public/assets/audio</code>:
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                {AUDIO_MANIFEST.map((a) => (
                  <li key={a.id}>
                    {a.description} — <code>{a.file}</code>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {tab === 'game' && (
          <>
            <Field label="Unidade de velocidade">
              <Segmented
                label="Unidade"
                value={settings.gameplay.units}
                options={[
                  { value: 'kmh', label: 'km/h' },
                  { value: 'mph', label: 'mph' },
                ]}
                onChange={(units) => updateSettings((s) => ({ ...s, gameplay: { ...s.gameplay, units } }))}
              />
            </Field>
            <Field label="HUD reduzido" hint="Mostra apenas o essencial">
              <Toggle label="HUD reduzido" value={settings.gameplay.minimalHud} onChange={(minimalHud) => updateSettings((s) => ({ ...s, gameplay: { ...s.gameplay, minimalHud } }))} />
            </Field>
            <Field label="Minimapa">
              <Toggle label="Minimapa" value={settings.gameplay.showMinimap} onChange={(showMinimap) => updateSettings((s) => ({ ...s, gameplay: { ...s.gameplay, showMinimap } }))} />
            </Field>
            <Field label="Pausar ao perder o foco" hint="Pausa automaticamente ao trocar de janela">
              <Toggle label="Pausa automática" value={settings.gameplay.autoPause} onChange={(autoPause) => updateSettings((s) => ({ ...s, gameplay: { ...s.gameplay, autoPause } }))} />
            </Field>
            <Field label="Idioma" hint="Outros idiomas poderão ser adicionados futuramente">
              <span>Português (Brasil)</span>
            </Field>
            {!props.inRace && (
              <>
                <Field label="Nome do piloto">
                  <input
                    className="text-input"
                    maxLength={24}
                    defaultValue={driverName}
                    aria-label="Nome do piloto"
                    onBlur={(e) => {
                      const name = e.target.value.trim().slice(0, 24);
                      if (!name) return;
                      const save = appStore.get().save;
                      persist({ ...save, profile: { ...save.profile, driverName: name } });
                    }}
                  />
                </Field>
                <Field label="Redefinir progresso" hint="Apaga créditos, carros, recordes e carreira deste navegador">
                  <Button
                    variant="danger"
                    small
                    onClick={() =>
                      confirmAction(
                        'Redefinir progresso?',
                        'Todo o progresso salvo neste navegador será apagado permanentemente. Esta ação não pode ser desfeita.',
                        'Apagar tudo',
                        resetProgress,
                        true,
                      )
                    }
                  >
                    Redefinir…
                  </Button>
                </Field>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
