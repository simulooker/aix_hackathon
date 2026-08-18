import { create } from 'zustand';

import { getRouteDisasters, requestRoute } from '@/src/services/api';
import { planBusJourney } from '@/src/services/bus';
import { usePreferencesStore } from '@/src/stores/preferences-store';
import type { RoutePoint, RouteResponse, TransitLeg } from '@/src/types/route';

type RouteState = {
  route?: RouteResponse;
  loading: boolean;
  error?: string;
  fetchRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  fetchBusRoute: (origin: RoutePoint, destination: RoutePoint) => Promise<RouteResponse | undefined>;
  clear: () => void;
  clearRoute: () => void; // map.tsx와의 완벽한 호환을 위해 추가
};

function joinGeometry(parts: RoutePoint[][]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const part of parts) {
    for (const point of part) {
      const previous = result[result.length - 1];
      if (previous && previous.latitude === point.latitude && previous.longitude === point.longitude) continue;
      result.push(point);
    }
  }
  return result;
}

async function walkingLeg(
  origin: RoutePoint,
  destination: RoutePoint,
  profile: 'general' | 'elderly' | 'wheelchair',
): Promise<RouteResponse> {
  const route = await requestRoute({ origin, destination, profile });
  if (!route.geometry.length) {
    return {
      route_id: `walk-${Date.now()}`,
      status: 'fallback',
      message: '정류장까지의 도보 경로를 단순 연결했습니다.',
      geometry: [origin, destination],
      distance_m: 0,
      hazards_avoided: 0,
      hazards_on_route: [],
      used_fallback_graph: true,
    };
  }
  return route;
}

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
  fetchBusRoute: async (origin, destination) => {
    set({ loading: true, error: undefined });
    try {
      const profile = usePreferencesStore.getState().routeProfile;
      if (!profile) {
        set({ route: undefined, loading: false, error: '설정 → 이용자 유형에서 이용자 유형을 먼저 설정해 주세요.' });
        return undefined;
      }
      const disasters = await getRouteDisasters(origin, destination).catch(() => []);
      const plan = await planBusJourney(origin, destination, disasters);
      const firstStop = plan.boardingStop;
      const lastStop = plan.alightingStop;
      const [firstWalk, lastWalk] = await Promise.all([
        walkingLeg(origin, firstStop, profile),
        walkingLeg(lastStop, destination, profile),
      ]);
      const legs: TransitLeg[] = [
        {
          mode: 'walk',
          fromName: '출발지',
          toName: firstStop.name,
          geometry: firstWalk.geometry,
          distanceM: firstWalk.distance_m,
        },
        ...plan.segments.map((segment, index) => ({
          mode: 'bus' as const,
          fromName: segment.fromStop.name,
          toName: segment.toStop.name,
          geometry: segment.stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
          distanceM: segment.stops.slice(1).reduce((total, stop, stopIndex) => {
            const previous = segment.stops[stopIndex];
            const latitudeScale = 111_320;
            const longitudeScale = 91_000;
            return total + Math.hypot(
              (stop.latitude - previous.latitude) * latitudeScale,
              (stop.longitude - previous.longitude) * longitudeScale,
            );
          }, 0),
          routeNo: segment.routeNo,
          stopCount: segment.stopCount,
          arrivalMinutes: segment.arrivalMinutes,
          transfer: index > 0,
        })),
        {
          mode: 'walk',
          fromName: lastStop.name,
          toName: '목적지',
          geometry: lastWalk.geometry,
          distanceM: lastWalk.distance_m,
        },
      ];
      const hazardMap = new Map(
        [...(firstWalk.hazards_on_route ?? []), ...(lastWalk.hazards_on_route ?? [])]
          .map((hazard) => [hazard.id, hazard]),
      );
      const route: RouteResponse = {
        route_id: `bus-${Date.now()}`,
        status: 'ok',
        message: plan.transferCount
          ? `버스 ${plan.transferCount}회 환승 경로입니다.`
          : '환승 없는 버스 경로입니다.',
        geometry: joinGeometry(legs.map((leg) => leg.geometry)),
        distance_m: Math.round(legs.reduce((total, leg) => total + leg.distanceM, 0)),
        hazards_avoided: (firstWalk.hazards_avoided ?? 0) + (lastWalk.hazards_avoided ?? 0),
        hazards_on_route: [...hazardMap.values()],
        used_fallback_graph: firstWalk.used_fallback_graph || lastWalk.used_fallback_graph,
        travel_mode: 'bus',
        transit_legs: legs,
        ascent_m: (firstWalk.ascent_m ?? 0) + (lastWalk.ascent_m ?? 0),
        descent_m: (firstWalk.descent_m ?? 0) + (lastWalk.descent_m ?? 0),
        max_grade_percent: Math.max(firstWalk.max_grade_percent ?? 0, lastWalk.max_grade_percent ?? 0),
        slope_segments: [...(firstWalk.slope_segments ?? []), ...(lastWalk.slope_segments ?? [])],
        disaster_zones_avoided: disasters.length,
        disaster_zones: disasters,
      };
      set({ route, loading: false });
      return route;
    } catch (error) {
      const message = error instanceof Error ? error.message : '버스 경로를 찾지 못했습니다.';
      set({ route: undefined, loading: false, error: message });
      return undefined;
    }
  },
  clear: () => set({ route: undefined, error: undefined }),
  clearRoute: () => set({ route: undefined, error: undefined }),
}));
