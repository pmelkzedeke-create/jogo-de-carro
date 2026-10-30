import { useEffect } from 'react';
import { appStore } from '../../app/appState';
import { navigate } from '../../app/controller';
import { useStore } from '../../app/store';
import { ScreenHeader } from '../components/Controls';
import { SettingsPanel } from './SettingsPanel';

export function SettingsScreen() {
  const back = useStore(appStore, (s) => s.settingsReturn);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) navigate(back === 'settings' ? 'menu' : back);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);
  return (
    <div className="screen solid" style={{ flexDirection: 'column' }}>
      <ScreenHeader title="Configurações" onBack={() => navigate(back === 'settings' ? 'menu' : back)} />
      <SettingsPanel />
    </div>
  );
}
