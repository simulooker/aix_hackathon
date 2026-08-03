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
  profile: 'general',
  loading: false,
  setProfile: (profile) => set({ profile }),
  fetchRoute: async (origin, destination) => {
    set({ loading: true, error: undefined });
    try {
      const raw = await requestRoute({ origin, destination, profile: get().profile });
      // 백엔드가 아직 geometry/distance_m 등을 채워주기 전(스캐폴드 상태)에도
      // 화면이 죽지 않도록 누락된 필드를 기본값으로 채웁니다.
      const route: RouteResponse = {
        ...raw,
        geometry: raw.geometry ?? [],
        distance_m: raw.distance_m ?? 0,
        hazards_avoided: raw.hazards_avoided ?? 0,
        used_fallback_graph: raw.used_fallback_graph ?? false,
      };
      set({ route, loading: false });
      return route;
    } catch {
      set({ error: '안심 경로를 계산하지 못했습니다.', loading: false });
      return undefined;
    }
  },
  clear: () => set({ route: undefined, error: undefined }),
}));
