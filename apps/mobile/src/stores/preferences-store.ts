import { create } from 'zustand';

const VOICE_KEY = 'withyou.preferences.voiceGuidance';
const HAZARDS_KEY = 'withyou.preferences.showHazards';

async function getSecureStore() {
  try {
    return await import('expo-secure-store');
  } catch {
    return undefined;
  }
}

type PreferencesState = {
  initialized: boolean;
  voiceGuidance: boolean;
  showHazards: boolean;
  initialize: () => Promise<void>;
  setVoiceGuidance: (enabled: boolean) => void;
  setShowHazards: (enabled: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  initialized: false,
  voiceGuidance: true,
  showHazards: true,
  initialize: async () => {
    const secureStore = await getSecureStore();
    const [voice, hazards] = await Promise.all([
      secureStore?.getItemAsync(VOICE_KEY),
      secureStore?.getItemAsync(HAZARDS_KEY),
    ]);
    set({
      voiceGuidance: voice !== 'false',
      showHazards: hazards !== 'false',
      initialized: true,
    });
  },
  setVoiceGuidance: (enabled) => {
    set({ voiceGuidance: enabled });
    void getSecureStore().then((store) => store?.setItemAsync(VOICE_KEY, String(enabled)));
  },
  setShowHazards: (enabled) => {
    set({ showHazards: enabled });
    void getSecureStore().then((store) => store?.setItemAsync(HAZARDS_KEY, String(enabled)));
  },
}));
