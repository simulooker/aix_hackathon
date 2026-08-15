import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';

import { KakaoMap } from '@/src/components/KakaoMap';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import type { Maneuver, NavigationStep } from '@/src/features/navigation/routeSteps';
import { useVoiceGuidance } from '@/src/features/navigation/useVoiceGuidance';
import { useRouteStore } from '@/src/stores/route-store';

const maneuverIcon: Record<Maneuver, keyof typeof MaterialCommunityIcons.glyphMap> = {
  start: 'arrow-up-bold',
  straight: 'arrow-up-bold',
  left: 'arrow-left-top-bold',
  right: 'arrow-right-top-bold',
};

function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `약 ${Math.max(0, Math.round(distanceM))}m`;
  const kilometers = distanceM / 1000;
  return `약 ${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)}km`;
}

function StepRow({ step, mode }: { step?: NavigationStep; mode: 'previous' | 'current' | 'next' }) {
  const title = mode === 'previous' ? '이전 안내' : mode === 'current' ? '현재 안내' : '다음 안내';
  return (
    <View style={[styles.stepRow, mode === 'current' && styles.currentStep]}>
      <View style={[styles.iconCircle, mode === 'current' && styles.currentIcon]}>
        <MaterialCommunityIcons name={step ? maneuverIcon[step.maneuver] : 'minus'} size={mode === 'current' ? 32 : 22} color={mode === 'current' ? '#FFF' : '#596A64'} />
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepCaption}>{title}</Text>
        <Text style={[styles.stepInstruction, mode === 'current' && styles.currentInstruction]}>{step?.instruction ?? '안내 없음'}</Text>
      </View>
    </View>
  );
}

export default function NavigationScreen() {
  const router = useRouter();
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const route = useRouteStore((state) => state.route);
  const guidance = useVoiceGuidance(route);

  if (!route || route.route_id !== routeId || !route.geometry.length) {
    return <SafeAreaView style={styles.emptyContainer}><Text style={styles.title}>경로 정보를 찾을 수 없습니다.</Text><Text style={styles.body}>지도에서 목적지를 다시 검색해 주세요.</Text><PrimaryButton label="지도로 돌아가기" onPress={() => router.replace('/map')} style={styles.backButton} /></SafeAreaView>;
  }

  const origin = route.geometry[0];
  const destination = route.geometry[route.geometry.length - 1];
  const current = guidance.steps[guidance.stepIndex];

  return (
    <SafeAreaView style={styles.container}>
      <KakaoMap style={styles.map} center={guidance.currentLocation ?? origin} currentLocation={guidance.currentLocation ?? origin} destination={destination} route={route.geometry} hazards={route.hazards_on_route ?? []} />
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View><Text style={styles.title}>안전 경로 안내</Text><Text style={styles.body}>남은 거리 {formatDistance(guidance.remainingDistanceM)}</Text></View>
          <View style={styles.voiceRow}><MaterialCommunityIcons name={guidance.voiceEnabled ? 'volume-high' : 'volume-off'} size={21} color="#263D35" /><Text style={styles.voiceText}>음성</Text><Switch value={guidance.voiceEnabled} onValueChange={guidance.setVoiceEnabled} trackColor={{ false: '#CBD5D1', true: '#8BC8B1' }} thumbColor={guidance.voiceEnabled ? '#167C5A' : '#FFF'} /></View>
        </View>

        {!guidance.started ? (
          <>
            {route.used_fallback_graph && <Text style={styles.warning}>현재 경로는 실제 도로망이 아닌 임시 직선 경로입니다.</Text>}
            <PrimaryButton label="안내 시작" variant="dark" onPress={() => void guidance.startGuidance()} />
          </>
        ) : guidance.arrived ? (
          <View style={styles.arrived}><MaterialCommunityIcons name="map-marker-check" size={34} color="#167C5A" /><Text style={styles.arrivedText}>목적지에 도착했습니다.</Text></View>
        ) : (
          <View style={styles.steps}>
            <StepRow step={guidance.steps[guidance.stepIndex - 1]} mode="previous" />
            <StepRow step={current} mode="current" />
            <StepRow step={guidance.steps[guidance.stepIndex + 1]} mode="next" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8' }, emptyContainer: { flex: 1, backgroundColor: '#F7FAF8', padding: 24, justifyContent: 'center' }, map: { flex: 1 },
  panel: { padding: 18, gap: 12, maxHeight: '55%' }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#14251F' }, body: { color: '#596A64', fontSize: 14, marginTop: 4 }, backButton: { marginTop: 20 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, voiceText: { color: '#263D35', fontWeight: '700' }, warning: { color: '#9A6700', backgroundColor: '#FFF4CE', padding: 10, borderRadius: 10, lineHeight: 19 },
  steps: { gap: 7 }, stepRow: { flexDirection: 'row', alignItems: 'center', padding: 9, borderRadius: 14, backgroundColor: '#EEF3F0' }, currentStep: { paddingVertical: 13, backgroundColor: '#E2F3EC', borderWidth: 1, borderColor: '#9BCDBA' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, currentIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#167C5A' },
  stepText: { flex: 1, marginLeft: 11 }, stepCaption: { color: '#71817B', fontSize: 11, fontWeight: '700' }, stepInstruction: { color: '#596A64', fontSize: 14, fontWeight: '700', marginTop: 2 }, currentInstruction: { color: '#14251F', fontSize: 18, fontWeight: '900' },
  arrived: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: '#E2F3EC', borderRadius: 14 }, arrivedText: { color: '#167C5A', fontSize: 18, fontWeight: '900' },
});
