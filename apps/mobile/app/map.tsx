import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { HazardMarker } from '@/src/components/HazardMarker';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { DEFAULT_REGION, ROUTE_PROFILES } from '@/src/constants/map';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';
import { getNearbyHazards } from '@/src/services/api';
import { useRouteStore } from '@/src/stores/route-store';
import type { HazardReport } from '@/src/types/hazard';

export default function MapScreen() {
  const router = useRouter();
  const { coordinates, error, loading, refresh } = useCurrentLocation();
  const { profile, setProfile, fetchRoute, loading: routeLoading, error: routeError } = useRouteStore();

  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number }>();

  useEffect(() => {
    if (!coordinates) return;
    // 주변 신고 조회 API는 백엔드에 아직 없어 실패 시 조용히 빈 목록으로 처리됩니다.
    getNearbyHazards({ latitude: coordinates.latitude, longitude: coordinates.longitude })
      .then(setHazards)
      .catch(() => setHazards([]));
  }, [coordinates]);

  const region = coordinates ? { ...coordinates, latitudeDelta: 0.01, longitudeDelta: 0.01 } : DEFAULT_REGION;

  const onLongPress = (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    setDestination(event.nativeEvent.coordinate);
  };

  const findSafeRoute = async () => {
    if (!coordinates || !destination) return;
    const route = await fetchRoute(coordinates, destination);
    if (route && route.geometry.length > 0) {
      router.push(`/navigation/${route.route_id}`);
    }
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation onLongPress={onLongPress}>
        {coordinates && <Marker coordinate={coordinates} title="현재 위치" pinColor="#167C5A" />}
        {destination && <Marker coordinate={destination} title="목적지" pinColor="#14251F" />}
        {hazards.map((hazard) => (
          <HazardMarker key={hazard.id} hazard={hazard} />
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
          {ROUTE_PROFILES.map((item) => (
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

        <PrimaryButton
          label="안심 경로 찾기"
          onPress={() => void findSafeRoute()}
          disabled={!destination}
          loading={routeLoading}
        />
        <Pressable style={styles.secondaryLink} onPress={() => router.push('/report/camera')}>
          <Text style={styles.secondaryLinkText}>위험 요소 신고하기</Text>
        </Pressable>
        <Pressable style={styles.secondaryLink} onPress={() => void refresh()}>
          <Text style={styles.secondaryLinkText}>현재 위치 다시 찾기</Text>
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
  secondaryLink: { alignItems: 'center', paddingVertical: 4 },
  secondaryLinkText: { color: '#167C5A', fontWeight: '700', fontSize: 13 },
});
