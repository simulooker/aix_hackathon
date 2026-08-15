import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BusApiKeyMissingError,
  getBusesOnRoute,
  getGwangjuCityCode,
  getNearbyBusStops,
  getRoutesThroughStop,
} from '@/src/services/bus';
import type { BusStop, LiveBus } from '@/src/types/bus';
import type { RoutePoint } from '@/src/types/route';

/** 실시간 위치를 추적할 노선을 뽑아낼 기준 정류장 수 */
const STOPS_FOR_ROUTE_DISCOVERY = 3;
/** 동시에 추적하는 노선 수 상한 (공공데이터포털 일일 호출 한도 보호) */
const MAX_TRACKED_ROUTES = 5;
/** 버스 위치 갱신 주기 */
const POLL_INTERVAL_MS = 20000;
/** 이 거리 이상 움직였을 때만 정류장/노선 목록을 다시 조회 */
const REFRESH_STOPS_DISTANCE_M = 400;

function distanceMeters(a: RoutePoint, b: RoutePoint): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

type UseLiveBusesResult = {
  stops: BusStop[];
  buses: LiveBus[];
  loading: boolean;
  error?: string;
  updatedAt?: number;
};

/**
 * 주변 버스정류장과, 그 정류장을 지나는 노선의 실시간 버스 위치를 주기적으로 가져온다.
 * `enabled` 가 false 이면 폴링을 완전히 멈춘다.
 */
export function useLiveBuses(coordinates: RoutePoint | undefined, enabled: boolean): UseLiveBusesResult {
  const [stops, setStops] = useState<BusStop[]>([]);
  const [buses, setBuses] = useState<LiveBus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<number>();

  const routeIdsRef = useRef<string[]>([]);
  const cityCodeRef = useRef<number | undefined>(undefined);
  const stopsAnchorRef = useRef<RoutePoint | undefined>(undefined);

  // 위치 객체는 갱신될 때마다 새로 만들어지므로, 폴링 루프가 매번 재시작하지 않도록
  // 약 100m 단위로 반올림한 키에만 반응하고 실제 좌표는 ref 로 읽는다.
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const coordinateKey = coordinates
    ? `${coordinates.latitude.toFixed(3)},${coordinates.longitude.toFixed(3)}`
    : '';

  const reset = useCallback(() => {
    routeIdsRef.current = [];
    stopsAnchorRef.current = undefined;
    setStops([]);
    setBuses([]);
    setError(undefined);
    setUpdatedAt(undefined);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !coordinateKey) {
      reset();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** 주변 정류장 → 경유 노선 목록을 확보한다. 위치가 크게 바뀌지 않으면 재사용. */
    const ensureRoutes = async (origin: RoutePoint): Promise<string[]> => {
      const anchor = stopsAnchorRef.current;
      if (anchor && routeIdsRef.current.length && distanceMeters(anchor, origin) < REFRESH_STOPS_DISTANCE_M) {
        return routeIdsRef.current;
      }

      const cityCode = cityCodeRef.current ?? (await getGwangjuCityCode());
      cityCodeRef.current = cityCode;

      const nearbyStops = await getNearbyBusStops({ ...origin, limit: 30 });
      if (cancelled) return [];

      const sorted = [...nearbyStops].sort(
        (left, right) => distanceMeters(origin, left) - distanceMeters(origin, right),
      );
      setStops(sorted);

      const routeIds: string[] = [];
      for (const stop of sorted.slice(0, STOPS_FOR_ROUTE_DISCOVERY)) {
        if (cancelled || routeIds.length >= MAX_TRACKED_ROUTES) break;
        const routes = await getRoutesThroughStop({ cityCode, nodeId: stop.nodeId });
        for (const route of routes) {
          if (routeIds.length >= MAX_TRACKED_ROUTES) break;
          if (!routeIds.includes(route.routeId)) routeIds.push(route.routeId);
        }
      }

      routeIdsRef.current = routeIds;
      stopsAnchorRef.current = origin;
      return routeIds;
    };

    const tick = async () => {
      const origin = coordinatesRef.current;
      if (!origin) return;

      try {
        const routeIds = await ensureRoutes(origin);
        if (cancelled) return;

        if (!routeIds.length) {
          setBuses([]);
          setError('주변에서 운행 중인 버스 노선을 찾지 못했습니다.');
          return;
        }

        const cityCode = cityCodeRef.current;
        if (cityCode == null) return;

        const results = await Promise.all(
          routeIds.map((routeId) => getBusesOnRoute({ cityCode, routeId }).catch(() => [] as LiveBus[])),
        );
        if (cancelled) return;

        setBuses(results.flat());
        setError(undefined);
        setUpdatedAt(Date.now());
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof BusApiKeyMissingError || cause instanceof Error
            ? cause.message
            : '실시간 버스 정보를 불러오지 못했습니다.',
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        }
      }
    };

    setLoading(true);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [coordinateKey, enabled, reset]);

  return { stops, buses, loading, error, updatedAt };
}
