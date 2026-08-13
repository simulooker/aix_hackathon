import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { restoreAccessToken, setAccessToken } from '@/src/services/api';

const USERNAME_KEY = 'withyou.username';

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
    const username = (await SecureStore.getItemAsync(USERNAME_KEY)) ?? undefined;
    await restoreAccessToken();
    set({ username, initialized: true });
  },
  setUsername: (username) => {
    set({ username });
    void SecureStore.setItemAsync(USERNAME_KEY, username);
  },
  clearUser: () => {
    set({ username: undefined });
    setAccessToken(undefined);
    void SecureStore.deleteItemAsync(USERNAME_KEY);
    void SecureStore.deleteItemAsync('withyou.accessToken');
  },
}));
