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
  requestCurrentLocation: () => Promise<Coordinates | undefined>;
};

export const useLocationStore = create<LocationState>((set) => ({
  loading: false,
  requestCurrentLocation: async () => {
    set({ loading: true, error: undefined });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        set({ error: '위치 권한이 필요합니다.', loading: false });
        return undefined;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      set({ coordinates, loading: false });
      return coordinates;
    } catch {
      set({ error: '현재 위치를 가져오지 못했습니다.', loading: false });
      return undefined;
    }
  },
}));
