import * as Location from 'expo-location';
import { create } from 'zustand';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationState = {
  coordinates?: Coordinates;
  error?: string;
  loading: boolean;
  initialized: boolean;
  requestCurrentLocation: () => Promise<Coordinates | undefined>;
  startLocationUpdates: () => Promise<void>;
  stopLocationUpdates: () => void;
};

let locationSubscription: Location.LocationSubscription | undefined;
let locationWatchConsumers = 0;
let locationStartPromise: Promise<void> | undefined;

export const useLocationStore = create<LocationState>((set) => ({
  loading: false,
  initialized: false,
  requestCurrentLocation: async () => {
    set({ loading: true, error: undefined });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        set({ error: '위치 권한이 필요합니다.', loading: false });
        set({ loading: false, initialized: true });
        return undefined;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      set({ coordinates, loading: false, initialized: true });
      return coordinates;
    } catch {
      set({ error: '현재 위치를 가져오지 못했습니다.', loading: false });
      set({ loading: false, initialized: true });
      return undefined;
    }
  },
  startLocationUpdates: async () => {
    locationWatchConsumers += 1;
    if (locationSubscription) return;
    if (!locationStartPromise) {
      locationStartPromise = (async () => {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) {
            set({ error: '위치 권한이 필요합니다.', initialized: true });
            return;
          }
          const subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 3,
            },
            (location) => {
              set({
                coordinates: {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                },
                error: undefined,
                initialized: true,
              });
            },
          );
          if (locationWatchConsumers === 0) subscription.remove();
          else locationSubscription = subscription;
        } catch {
          set({ error: '실시간 위치를 확인하지 못했습니다.', initialized: true });
        } finally {
          locationStartPromise = undefined;
        }
      })();
    }
    await locationStartPromise;
  },
  stopLocationUpdates: () => {
    locationWatchConsumers = Math.max(0, locationWatchConsumers - 1);
    if (locationWatchConsumers > 0) return;
    locationSubscription?.remove();
    locationSubscription = undefined;
  },
}));
