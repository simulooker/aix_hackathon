import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useVoiceGuidance } from '@/src/features/navigation/useVoiceGuidance';
import { useRouteStore } from '@/src/stores/route-store';

export default function NavigationScreen() {
  const router = useRouter();
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const route = useRouteStore((state) => state.route);
  const { steps, stepIndex, speakSummary, speakNextStep } = useVoiceGuidance(route);

  if (!route || route.route_id !== routeId || !route.geometry.length) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.title}>경로 정보를 찾을 수 없습니다.</Text>
        <Text style={styles.body}>지도에서 목적지를 다시 검색해 주세요.</Text>
        <PrimaryButton label="지도로 돌아가기" onPress={() => router.replace('/map')} style={styles.backButton} />
      </SafeAreaView>
    );
  }

  const origin = route.geometry[0];
  const destination = route.geometry[route.geometry.length - 1];

  return (
    <SafeAreaView style={styles.container}>
      <MapView style={styles.map} initialRegion={{ ...origin, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
        <Polyline coordinates={route.geometry} strokeColor="#167C5A" strokeWidth={6} />
        <Marker coordinate={origin} title="출발지" pinColor="#167C5A" />
        <Marker coordinate={destination} title="목적지" pinColor="#14251F" />
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.title}>안전 경로 안내</Text>
        <Text style={styles.body}>거리 약 {Math.round(route.distance_m)}m · 회피한 위험 구간 {route.hazards_avoided}개</Text>
        <PrimaryButton label="경로 요약 음성 안내" onPress={speakSummary} />
        <PrimaryButton label={`다음 안내 (${Math.min(stepIndex + 1, steps.length)}/${steps.length})`} variant="dark" onPress={speakNextStep} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8' },
  emptyContainer: { flex: 1, backgroundColor: '#F7FAF8', padding: 24, justifyContent: 'center' },
  map: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: '#14251F' },
  body: { color: '#596A64', fontSize: 14, lineHeight: 21, marginTop: 6 },
  panel: { padding: 20, gap: 10 },
  backButton: { marginTop: 20 },
});
