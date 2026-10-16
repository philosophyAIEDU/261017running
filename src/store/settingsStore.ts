import { create } from 'zustand';
import type { SettingsRepository } from '../db/repositories/types';
import type { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  unit: 'km',
  weightKg: null,
  birthYear: null,
  maxHeartRate: null,
  heightCm: null,
  lastActivityType: 'run',
  autoPauseEnabled: { run: true, walk: true, ride: true },
  voiceEnabled: true,
  theme: 'system',
  highContrast: false,
  privacyZones: [],
  emergencyContacts: [],
  healthSyncEnabled: false,
  lastBackupAt: null,
  safetyNoticeAcknowledged: false,
  rideSafetyNoticeAcknowledged: false,
  simulationEnabled: false,
  simulationSpeed: 5,
  defaultGearIds: {},
  wheelCircumferenceMm: 2105,
  pairedSensors: [],
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  repo: SettingsRepository | null;
  load: (repo: SettingsRepository) => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  repo: null,
  load: async (repo: SettingsRepository): Promise<void> => {
    const stored = await repo.getAll();
    set({ settings: { ...DEFAULT_SETTINGS, ...stored }, loaded: true, repo });
  },
  update: async (patch: Partial<AppSettings>): Promise<void> => {
    set({ settings: { ...get().settings, ...patch } });
    await get().repo?.setMany(patch);
  },
}));

export function getSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}
