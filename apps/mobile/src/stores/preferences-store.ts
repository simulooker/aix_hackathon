import { create } from 'zustand';

import type { RouteProfile } from '@/src/types/route';

const VOICE_KEY = 'withyou.preferences.voiceGuidance';
const HAZARDS_KEY = 'withyou.preferences.showHazards';
const ROUTE_PROFILE_KEY = 'withyou.preferences.routeProfile';

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
  routeProfile?: RouteProfile;
  initialize: () => Promise<void>;
  setVoiceGuidance: (enabled: boolean) => void;
  setShowHazards: (enabled: boolean) => void;
  setRouteProfile: (profile: RouteProfile) => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  initialized: false,
  voiceGuidance: true,
  showHazards: true,
  routeProfile: undefined,
  initialize: async () => {
    const secureStore = await getSecureStore();
    const [voice, hazards, routeProfile] = await Promise.all([
      secureStore?.getItemAsync(VOICE_KEY),
      secureStore?.getItemAsync(HAZARDS_KEY),
      secureStore?.getItemAsync(ROUTE_PROFILE_KEY),
    ]);
    set({
      voiceGuidance: voice !== 'false',
      showHazards: hazards !== 'false',
      routeProfile:
        routeProfile === 'general' || routeProfile === 'elderly' || routeProfile === 'wheelchair'
          ? routeProfile
          : undefined,
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
  setRouteProfile: (profile) => {
    set({ routeProfile: profile });
    void getSecureStore().then((store) => store?.setItemAsync(ROUTE_PROFILE_KEY, profile));
  },
}));
