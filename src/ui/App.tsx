/**
 * Componente raiz: canvas do jogo ao fundo e telas da interface por cima.
 */
import { useEffect, useRef } from 'react';
import { appStore } from '../app/appState';
import { boot, pruneMessages, unlockAudio } from '../app/controller';
import { useStore } from '../app/store';
import { ConfirmDialog } from './components/ConfirmDialog';
import { RaceScreen } from './race/RaceScreen';
import { BootScreen } from './screens/BootScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { EventSetupScreen } from './screens/EventSetupScreen';
import { GarageScreen } from './screens/GarageScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { MainMenu } from './screens/MainMenu';
import { SettingsScreen } from './screens/SettingsScreen';
import { UnsupportedScreen } from './screens/UnsupportedScreen';

let booted = false;

export function App() {
  const screen = useStore(appStore, (s) => s.screen);
  const contextLost = useStore(appStore, (s) => s.contextLost);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (booted || !containerRef.current) return;
    booted = true;
    void boot(containerRef.current);
  }, []);

  useEffect(() => {
    // O áudio só é liberado após um gesto do usuário (política de reprodução automática).
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const timer = window.setInterval(pruneMessages, 250);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="app">
      <div className="game-root" ref={containerRef} />
      <div className="ui-root">
        {screen === 'boot' && <BootScreen />}
        {screen === 'unsupported' && <UnsupportedScreen />}
        {screen === 'menu' && <MainMenu />}
        {screen === 'setup' && <EventSetupScreen />}
        {screen === 'loading' && <LoadingScreen />}
        {screen === 'race' && <RaceScreen />}
        {screen === 'garage' && <GarageScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'credits' && <CreditsScreen />}
        <ConfirmDialog />
        {contextLost && (
          <div className="panel toast-context" role="alert">
            O contexto gráfico (WebGL) foi perdido. Aguardando restauração pelo navegador…
          </div>
        )}
      </div>
    </div>
  );
}
