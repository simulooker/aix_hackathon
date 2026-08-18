import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BusApiKeyMissingError,
  getNearbyBusStops,
} from '@/src/services/bus';
import type { BusStop, LiveBus } from '@/src/types/bus';
import type { RoutePoint } from '@/src/types/route';

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
 * 현재 위치 주변 버스정류장을 가져온다.
 * 실시간 차량 위치 API는 별도 활용승인이 필요하므로 정류장 표시 기능에서는 호출하지 않는다.
 */
export function useLiveBuses(coordinates: RoutePoint | undefined, enabled: boolean): UseLiveBusesResult {
  const [stops, setStops] = useState<BusStop[]>([]);
  const [buses, setBuses] = useState<LiveBus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<number>();

  // 위치 객체가 자주 바뀌어도 약 100m 이상 이동했을 때만 다시 조회한다.
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const coordinateKey = coordinates
    ? `${coordinates.latitude.toFixed(3)},${coordinates.longitude.toFixed(3)}`
    : '';

  const reset = useCallback(() => {
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
    const loadStops = async () => {
      const origin = coordinatesRef.current;
      if (!origin) return;

      try {
        const nearbyStops = await getNearbyBusStops({ ...origin, limit: 50 });
        if (cancelled) return;
        const sorted = [...nearbyStops].sort(
          (left, right) => distanceMeters(origin, left) - distanceMeters(origin, right),
        );
        setStops(sorted);
        setBuses([]);
        setError(undefined);
        setUpdatedAt(Date.now());
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof BusApiKeyMissingError || cause instanceof Error
            ? cause.message
            : '주변 버스정류장을 불러오지 못했습니다.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    void loadStops();

    return () => {
      cancelled = true;
    };
  }, [coordinateKey, enabled, reset]);

  return { stops, buses, loading, error, updatedAt };
}
