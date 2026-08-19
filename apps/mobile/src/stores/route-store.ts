import { create } from 'zustand';

import { requestRoute } from '@/src/services/api';
import { usePreferencesStore } from '@/src/stores/preferences-store';
import type { RoutePoint, RouteResponse } from '@/src/types/route';

type RouteState = {
  route?: RouteResponse;
  loading: boolean;
  error?: string;
  fetchRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  clear: () => void;
  clearRoute: () => void; // map.tsx와의 완벽한 호환을 위해 추가
};

export const useRouteStore = create<RouteState>((set) => ({
  loading: false,
  fetchRoute: async (origin, destination) => {
    set({ loading: true, error: undefined });
    try {
      const profile = usePreferencesStore.getState().routeProfile;
      if (!profile) {
        set({ route: undefined, loading: false, error: '설정 → 이용자 유형에서 이용자 유형을 먼저 설정해 주세요.' });
        return undefined;
      }
      const route = await requestRoute({ origin, destination, profile });
      if (route.used_fallback_graph || route.geometry.length < 3) {
        set({ route: undefined, loading: false, error: route.message || '실제 보행 경로를 찾지 못했습니다. 목적지를 다시 선택해 주세요.' });
        return undefined;
      }
      set({ route, loading: false });
      return route;
    } catch (error) {
      const message = error instanceof Error ? error.message : '실제 보행 경로를 찾지 못했습니다.';
      set({ route: undefined, loading: false, error: message });
      return undefined;
    }
  },
  clear: () => set({ route: undefined, error: undefined }),
  clearRoute: () => set({ route: undefined, error: undefined }),
}));
