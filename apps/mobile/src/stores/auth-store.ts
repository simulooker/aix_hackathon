import { create } from 'zustand';

import { restoreAccessToken, setAccessToken } from '@/src/services/api';

const USERNAME_KEY = 'withyou.username';

async function getSecureStore() {
  try {
    return await import('expo-secure-store');
  } catch {
    return undefined;
  }
}

type AuthState = {
  username?: string;
  initialized: boolean;
  initialize: () => Promise<void>;
  setUsername: (username: string) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  username: undefined,
  initialized: false,
  initialize: async () => {
    try {
      const secureStore = await getSecureStore();
      const username = (await secureStore?.getItemAsync(USERNAME_KEY)) ?? undefined;
      await restoreAccessToken();
      set({ username, initialized: true });
    } catch {
      setAccessToken(undefined);
      set({ username: undefined, initialized: true });
    }
  },
  setUsername: (username) => {
    set({ username });
    void getSecureStore().then((secureStore) => secureStore?.setItemAsync(USERNAME_KEY, username));
  },
  clearUser: () => {
    set({ username: undefined });
    setAccessToken(undefined);
    void getSecureStore().then(async (secureStore) => {
      await secureStore?.deleteItemAsync(USERNAME_KEY);
      await secureStore?.deleteItemAsync('withyou.accessToken');
    });
  },
}));
