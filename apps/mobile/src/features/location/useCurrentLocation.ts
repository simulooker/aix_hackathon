import { useEffect } from 'react';

import { useLocationStore } from '@/src/stores/location-store';

// GPS 권한 요청과 현재 위치 조회를 화면 마운트 시 한 번 트리거하는 훅.
export function useCurrentLocation() {
  const {
    coordinates,
    error,
    loading,
    initialized,
    requestCurrentLocation,
    startLocationUpdates,
    stopLocationUpdates,
  } = useLocationStore();

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!useLocationStore.getState().coordinates) await requestCurrentLocation();
      if (active) await startLocationUpdates();
    };
    void initialize();
    return () => {
      active = false;
      stopLocationUpdates();
    };
  }, [requestCurrentLocation, startLocationUpdates, stopLocationUpdates]);

  return { coordinates, error, loading, initialized, refresh: requestCurrentLocation };
}
