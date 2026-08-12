import { create } from 'zustand';

type AuthState = {
  username?: string;
  setUsername: (username: string) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  username: undefined,
  setUsername: (username) => set({ username }),
  clearUser: () => set({ username: undefined }),
}));
