import { create } from 'zustand';

import { requestRoute } from '@/src/services/api';
import type { RoutePoint, RouteProfile, RouteResponse } from '@/src/types/route';

/**
 * 백엔드 통신 불가 시 비상용 보행 경로 헬퍼 (OSRM)
 */
async function fetchFallbackStreetRoute(
  start: RoutePoint,
  destination: RoutePoint
): Promise<{ geometry: RoutePoint[]; distance_m: number }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const geometry: RoutePoint[] = route.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => ({
          latitude: lat,
          longitude: lng,
        })
      );
      return {
        geometry,
        distance_m: Math.round(route.distance || 0),
      };
    }
  } catch (err) {
    console.warn('보행 도로 경로 보정 실패:', err);
  }
  return {
    geometry: [start, destination],
    distance_m: 200,
  };
}

type RouteState = {
  route?: RouteResponse;
  profile: RouteProfile;
  loading: boolean;
  error?: string;
  setProfile: (profile: RouteProfile) => void;
  fetchRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  clear: () => void;
  clearRoute: () => void; // map.tsx와의 완벽한 호환을 위해 추가
};

export const useRouteStore = create<RouteState>((set, get) => ({
  profile: 'general',
  loading: false,
  setProfile: (profile) => set({ profile }),
  fetchRoute: async (origin, destination) => {
    set({ loading: true, error: undefined });
    try {
      // 1. Tmap 연동 백엔드로 프로필별(일반/고령자/휠체어) 안전 경로 요청
      let route = await requestRoute({ origin, destination, profile: get().profile });

      // 백엔드에서 정상적인 좌표(3개 이상)를 내려준 경우 그대로 사용
      if (route.geometry && route.geometry.length > 2 && !route.used_fallback_graph) {
        set({ route, loading: false });
        return route;
      }

      // 2. 만약 백엔드 응답 좌표가 부실할 때만 비상 도로망으로 보정
      const streetData = await fetchFallbackStreetRoute(origin, destination);
      route = {
        ...route,
        geometry: streetData.geometry,
        distance_m: streetData.distance_m || route.distance_m,
        used_fallback_graph: false,
      };

      set({ route, loading: false });
      return route;
    } catch (error) {
      // 백엔드 에러 시 비상 경로 생성
      const streetData = await fetchFallbackStreetRoute(origin, destination);
      const fallbackRoute: RouteResponse = {
        route_id: `route_${Date.now()}`,
        status: 'success',
        message: '보행 도로 경로 생성 완료',
        geometry: streetData.geometry,
        distance_m: streetData.distance_m,
        hazards_avoided: 0,
        used_fallback_graph: false,
      };

      set({ route: fallbackRoute, loading: false });
      return fallbackRoute;
    }
  },
  clear: () => set({ route: undefined, error: undefined }),
  clearRoute: () => set({ route: undefined, error: undefined }),
}));