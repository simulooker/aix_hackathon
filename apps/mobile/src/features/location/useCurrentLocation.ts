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
    // Start the GPS watcher immediately even if the one-shot request is slow.
    void startLocationUpdates();
    if (!useLocationStore.getState().coordinates) void requestCurrentLocation();
    return () => {
      stopLocationUpdates();
    };
  }, [requestCurrentLocation, startLocationUpdates, stopLocationUpdates]);

  return { coordinates, error, loading, initialized, refresh: requestCurrentLocation };
}
