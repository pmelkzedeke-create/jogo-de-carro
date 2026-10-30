/**
 * Estado global da interface (baixa frequência).
 */
import type { LoadStep, MessageKind } from '../game/Game';
import type { RacePhase } from '../racing/RaceSession';
import type { RaceConfig, RaceResults } from '../racing/RaceTypes';
import { createDefaultSave, type SaveData } from '../persistence/SaveSchema';
import { createStore } from './store';
import type { SetupState } from './raceSetup';

export type Screen =
  | 'boot'
  | 'unsupported'
  | 'menu'
  | 'setup'
  | 'loading'
  | 'race'
  | 'garage'
  | 'settings'
  | 'credits'
  | 'career'
  | 'championships'
  | 'stats';

export interface UiMessage {
  id: number;
  text: string;
  kind: MessageKind;
  key?: string;
  expires: number;
}

export interface ResultOutcome {
  applied: boolean;
  levelUp: number | null;
  newRecord: boolean;
  achievements: string[];
}

export interface RaceUiState {
  config: RaceConfig;
  paused: boolean;
  pauseView: 'main' | 'settings' | 'confirmExit' | 'confirmRestart';
  results: RaceResults | null;
  final: boolean;
  outcome: ResultOutcome | null;
  phase: RacePhase;
  showResults: boolean;
}

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface DialogueState {
  title: string;
  lines: import('../career/CareerData').DialogueLine[];
  onDone?: () => void;
}

export interface AppState {
  screen: Screen;
  settingsReturn: Screen;
  bootSteps: LoadStep[];
  bootError: string | null;
  loadSteps: LoadStep[];
  loadError: string | null;
  loadTitle: string;
  unsupported: string[];
  save: SaveData;
  persistent: boolean;
  warnings: string[];
  race: RaceUiState | null;
  messages: UiMessage[];
  setup: SetupState;
  confirm: ConfirmState | null;
  contextLost: boolean;
  gamepad: string | null;
  touchDevice: boolean;
  /** Evento de carreira/campeonato em andamento (para retornar à tela correta). */
  pendingEvent: { kind: 'career' | 'championship'; id: string } | null;
  dialogue: DialogueState | null;
  /** Campeonato selecionado na tela de campeonatos. */
  selectedChampionship: string;
}

const defaults = createDefaultSave();

export const appStore = createStore<AppState>({
  screen: 'boot',
  settingsReturn: 'menu',
  bootSteps: [],
  bootError: null,
  loadSteps: [],
  loadError: null,
  loadTitle: '',
  unsupported: [],
  save: defaults,
  persistent: true,
  warnings: [],
  race: null,
  messages: [],
  setup: {
    mode: 'quickRace',
    trackId: defaults.lastSetup.trackId,
    vehicleId: defaults.lastSetup.vehicleId,
    laps: defaults.lastSetup.laps,
    opponents: defaults.lastSetup.opponents,
    difficulty: defaults.lastSetup.difficulty,
  },
  confirm: null,
  contextLost: false,
  gamepad: null,
  touchDevice: false,
  pendingEvent: null,
  dialogue: null,
  selectedChampionship: 'copa-litoral',
});
