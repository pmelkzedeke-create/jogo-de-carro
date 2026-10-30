import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';
import { PauseMenu } from './PauseMenu';
import { RaceHUD } from './RaceHUD';
import { ResultsScreen } from './ResultsScreen';
import { TouchControls } from './TouchControls';

export function RaceScreen() {
  const paused = useStore(appStore, (s) => s.race?.paused ?? false);
  const showResults = useStore(appStore, (s) => s.race?.showResults ?? false);
  const settings = useStore(appStore, (s) => s.save.settings);
  const touchDevice = useStore(appStore, (s) => s.touchDevice);
  const touch = settings.controls.touch === 'on' || (settings.controls.touch === 'auto' && touchDevice);
  return (
    <div className="passthrough" style={{ position: 'absolute', inset: 0 }}>
      {!showResults && <RaceHUD minimal={settings.gameplay.minimalHud} showMinimap={settings.gameplay.showMinimap} showFps={settings.graphics.showFps} touch={touch} />}
      {touch && !paused && !showResults && <TouchControls />}
      {showResults && !paused && <ResultsScreen />}
      {paused && <PauseMenu />}
    </div>
  );
}
