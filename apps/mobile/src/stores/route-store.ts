import { create } from 'zustand';

import { requestRoute } from '@/src/services/api';
import type { RoutePoint, RouteProfile, RouteResponse } from '@/src/types/route';

type RouteState = {
  route?: RouteResponse;
  profile: RouteProfile;
  loading: boolean;
  error?: string;
  setProfile: (profile: RouteProfile) => void;
  fetchRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  clear: () => void;
};

export const useRouteStore = create<RouteState>((set, get) => ({
  profile: 'general', loading: false,
  setProfile: (profile) => set({ profile }),
  fetchRoute: async (origin, destination) => {
    set({ loading: true, error: undefined });
    try {
      const route = await requestRoute({ origin, destination, profile: get().profile });
      set({ route, loading: false });
      return route;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '안전 경로를 계산하지 못했습니다.', loading: false });
      return undefined;
    }
  },
  clear: () => set({ route: undefined, error: undefined }),
}));
