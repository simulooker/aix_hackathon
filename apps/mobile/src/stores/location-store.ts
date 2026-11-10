import * as Location from 'expo-location';
import { Platform } from 'react-native';
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
  lastFixAt?: number;
  requestCurrentLocation: () => Promise<Coordinates | undefined>;
  startLocationUpdates: () => Promise<void>;
  stopLocationUpdates: () => void;
};

let locationSubscription: Location.LocationSubscription | undefined;
let locationWatchConsumers = 0;
let locationStartPromise: Promise<void> | undefined;
let permissionPromise: Promise<void> | undefined;

async function ensurePermission(): Promise<void> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) throw new Error('위치 권한이 필요합니다. 앱 설정에서 위치 권한을 허용해 주세요.');
    })().finally(() => { permissionPromise = undefined; });
  }
  return permissionPromise;
}

async function locationOptions(): Promise<Location.LocationOptions> {
  const status = await Location.getProviderStatusAsync();
  if (!status.locationServicesEnabled) throw new Error('기기의 위치 서비스가 꺼져 있습니다. 위치 서비스를 켜 주세요.');
  return {
    accuracy: Platform.OS === 'android' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    // GPS-only emulator providers work without the Google location settings dialog.
    mayShowUserSettingsDialog: false,
  };
}

function locationError(error: unknown): string {
  if (error instanceof Error && (error.message.startsWith('위치 권한') || error.message.startsWith('기기의 위치'))) {
    return error.message;
  }
  return '현재 GPS 신호를 받지 못했습니다. 위치 서비스를 확인한 뒤 현위치를 다시 눌러 주세요.';
}

export const useLocationStore = create<LocationState>((set, get) => ({
  loading: false,
  initialized: false,
  requestCurrentLocation: async () => {
    const requestedAt = Date.now();
    set({ loading: true, error: undefined });
    try {
      await ensurePermission();
      const location = await Location.getCurrentPositionAsync(await locationOptions());
      const coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      set({ coordinates, loading: false, initialized: true, lastFixAt: Date.now() });
      return coordinates;
    } catch (error) {
      // A parallel GPS watcher may already have supplied a new fix.
      if ((get().lastFixAt ?? 0) >= requestedAt && get().coordinates) {
        set({ loading: false, error: undefined, initialized: true });
        return get().coordinates;
      }
      set({ error: locationError(error), loading: false, initialized: true });
      return undefined;
    }
  },
  startLocationUpdates: async () => {
    locationWatchConsumers += 1;
    if (locationSubscription) return;
    if (!locationStartPromise) {
      locationStartPromise = (async () => {
        try {
          await ensurePermission();
          const subscription = await Location.watchPositionAsync(
            {
              ...await locationOptions(),
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
                loading: false,
                initialized: true,
                lastFixAt: Date.now(),
              });
            },
          );
          if (locationWatchConsumers === 0) subscription.remove();
          else locationSubscription = subscription;
        } catch (error) {
          if (!get().coordinates) set({ error: locationError(error), initialized: true, loading: false });
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
