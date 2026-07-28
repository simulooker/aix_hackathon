import * as Location from 'expo-location';
import { create } from 'zustand';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationState = {
  coordinates?: Coordinates;
  error?: string;
  loading: boolean;
  requestCurrentLocation: () => Promise<void>;
};

export const useLocationStore = create<LocationState>((set) => ({
  loading: false,
  requestCurrentLocation: async () => {
    set({ loading: true, error: undefined });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        set({ error: '위치 권한이 필요합니다.', loading: false });
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set({
        coordinates: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        loading: false,
      });
    } catch {
      set({ error: '현재 위치를 가져오지 못했습니다.', loading: false });
    }
  },
}));
