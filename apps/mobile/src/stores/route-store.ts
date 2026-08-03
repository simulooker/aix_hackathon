import { create } from 'zustand';

import { requestRoute, type RoutePoint, type RouteProfile, type RouteResponse } from '@/src/services/api';

type RouteState = {
  route?: RouteResponse;
  origin?: RoutePoint;
  destination?: RoutePoint;
  profile: RouteProfile;
  loading: boolean;
  error?: string;
  setProfile: (profile: RouteProfile) => void;
  fetchRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  clear: () => void;
};

export const useRouteStore = create<RouteState>((set, get) => ({
  profile: 'general',
  loading: false,
  setProfile: (profile) => set({ profile }),
  fetchRoute: async (origin, destination) => {
    set({ loading: true, error: undefined, origin, destination });
    try {
      const route = await requestRoute({ origin, destination, profile: get().profile });
      set({ route, loading: false });
      return route;
    } catch {
      set({ error: '안심 경로를 계산하지 못했습니다.', loading: false });
      return undefined;
    }
  },
  clear: () => set({ route: undefined, origin: undefined, destination: undefined, error: undefined }),
}));
