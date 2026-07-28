import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useLocationStore } from '@/src/stores/location-store';

const DEFAULT_REGION = {
  latitude: 35.1768,
  longitude: 126.9081,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function MapScreen() {
  const { coordinates, error, loading, requestCurrentLocation } = useLocationStore();

  useEffect(() => {
    void requestCurrentLocation();
  }, [requestCurrentLocation]);

  const region = coordinates
    ? { ...coordinates, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation>
        {coordinates && <Marker coordinate={coordinates} title="현재 위치" />}
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.title}>내 주변 안전 정보</Text>
        {loading && <ActivityIndicator color="#167C5A" />}
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={() => void requestCurrentLocation()}>
          <Text style={styles.buttonText}>현재 위치 다시 찾기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#14251F' },
  error: { color: '#B42318' },
  button: { backgroundColor: '#167C5A', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
