import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { getNearbyHazards, type HazardReport, type RouteProfile } from '@/src/services/api';
import { useLocationStore } from '@/src/stores/location-store';
import { useRouteStore } from '@/src/stores/route-store';

const DEFAULT_REGION = {
  latitude: 35.1768,
  longitude: 126.9081,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const PROFILES: { value: RouteProfile; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'elderly', label: '고령 보행자' },
  { value: 'wheelchair', label: '전동 휠체어' },
];

function severityColor(hazard: HazardReport): string {
  const severity = hazard.severity ?? 0;
  if (severity >= 0.7) return '#D92D20';
  if (severity >= 0.4) return '#F79009';
  return '#EAAA08';
}

export default function MapScreen() {
  const router = useRouter();
  const { coordinates, error, loading, requestCurrentLocation } = useLocationStore();
  const { profile, setProfile, fetchRoute, loading: routeLoading, error: routeError } = useRouteStore();

  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number }>();

  useEffect(() => {
    void requestCurrentLocation();
  }, [requestCurrentLocation]);

  useEffect(() => {
    if (!coordinates) return;
    getNearbyHazards({ latitude: coordinates.latitude, longitude: coordinates.longitude })
      .then(setHazards)
      .catch(() => setHazards([]));
  }, [coordinates]);

  const region = coordinates
    ? { ...coordinates, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  const onLongPress = (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    setDestination(event.nativeEvent.coordinate);
  };

  const findSafeRoute = async () => {
    if (!coordinates || !destination) return;
    const route = await fetchRoute(coordinates, destination);
    if (route) router.push(`/navigation/${route.route_id}`);
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation onLongPress={onLongPress}>
        {coordinates && <Marker coordinate={coordinates} title="현재 위치" pinColor="#167C5A" />}
        {destination && <Marker coordinate={destination} title="목적지" pinColor="#14251F" />}
        {hazards.map((hazard) => (
          <Circle
            key={hazard.id}
            center={{ latitude: hazard.latitude, longitude: hazard.longitude }}
            radius={18}
            strokeColor={severityColor(hazard)}
            fillColor={`${severityColor(hazard)}55`}
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.title}>내 주변 안전 정보</Text>
        {loading && <ActivityIndicator color="#167C5A" />}
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.hint}>
          {destination ? '지도를 길게 눌러 목적지를 변경할 수 있습니다.' : '지도를 길게 눌러 목적지를 지정하세요.'}
        </Text>

        <View style={styles.profileRow}>
          {PROFILES.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.profileChip, profile === item.value && styles.profileChipActive]}
              onPress={() => setProfile(item.value)}>
              <Text style={[styles.profileChipText, profile === item.value && styles.profileChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {routeError && <Text style={styles.error}>{routeError}</Text>}

        <Pressable
          style={[styles.button, !destination && styles.disabledButton]}
          disabled={!destination || routeLoading}
          onPress={() => void findSafeRoute()}>
          {routeLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>안심 경로 찾기</Text>
          )}
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
  hint: { color: '#596A64', fontSize: 12.5 },
  error: { color: '#B42318' },
  profileRow: { flexDirection: 'row', gap: 8 },
  profileChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#EEF3F1',
  },
  profileChipActive: { backgroundColor: '#167C5A' },
  profileChipText: { color: '#425852', fontWeight: '700', fontSize: 12.5 },
  profileChipTextActive: { color: '#FFFFFF' },
  button: { backgroundColor: '#167C5A', borderRadius: 12, padding: 14, alignItems: 'center' },
  disabledButton: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
