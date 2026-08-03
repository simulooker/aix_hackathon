import { useEffect } from 'react';

import { useLocationStore } from '@/src/stores/location-store';

// GPS 권한 요청과 현재 위치 조회를 화면 마운트 시 한 번 트리거하는 훅.
export function useCurrentLocation() {
  const { coordinates, error, loading, requestCurrentLocation } = useLocationStore();

  useEffect(() => {
    if (!coordinates) void requestCurrentLocation();
  }, [coordinates, requestCurrentLocation]);

  return { coordinates, error, loading, refresh: requestCurrentLocation };
}
