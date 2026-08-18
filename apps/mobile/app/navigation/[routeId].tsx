import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

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
  const isBusRoute = route.travel_mode === 'bus' && !!route.transit_legs?.length;
  const maxGrade = route.max_grade_percent ?? 0;
  const maxGradeDegrees = Math.atan(maxGrade / 100) * 180 / Math.PI;

  return (
    <SafeAreaView style={styles.container}>
      <KakaoMap
        style={styles.map}
        center={guidance.currentLocation ?? origin}
        currentLocation={guidance.currentLocation ?? origin}
        destination={destination}
        route={route.geometry}
        transitLegs={route.transit_legs}
        hazards={route.hazards_on_route ?? []}
        disasters={route.disaster_zones ?? []}
      />
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View><Text style={styles.title}>{isBusRoute ? '버스 경로 안내' : '안전 보행 안내'}</Text><Text style={styles.body}>전체 거리 {formatDistance(route.distance_m)}</Text></View>
          {!isBusRoute && <View style={styles.voiceRow}><MaterialCommunityIcons name={guidance.voiceEnabled ? 'volume-high' : 'volume-off'} size={21} color="#263D35" /><Text style={styles.voiceText}>음성</Text><Switch value={guidance.voiceEnabled} onValueChange={guidance.setVoiceEnabled} trackColor={{ false: '#CBD5D1', true: '#8BC8B1' }} thumbColor={guidance.voiceEnabled ? '#167C5A' : '#FFF'} /></View>}
        </View>

        {maxGrade >= 5 && (
          <View style={[styles.slopeNotice, maxGrade >= 8 && styles.slopeNoticeDanger]}>
            <MaterialCommunityIcons name="slope-uphill" size={23} color={maxGrade >= 8 ? '#B42318' : '#9A6700'} />
            <View style={styles.slopeTextWrap}>
              <Text style={styles.slopeTitle}>경사 구간 주의 · 최대 약 {maxGradeDegrees.toFixed(1)}°</Text>
              <Text style={styles.slopeBody}>지도 선은 약 50m씩 나눈 고도 기반 추정값입니다. 짧은 턱이나 급경사는 현장에서 다시 확인해 주세요.</Text>
            </View>
          </View>
        )}
        {!!route.disaster_zones_avoided && (
          <Text style={styles.disasterNotice}>재난·도로 통제 구간 {route.disaster_zones_avoided}곳을 제외하고 계산했습니다.</Text>
        )}

        {isBusRoute ? (
          <ScrollView style={styles.itinerary} contentContainerStyle={styles.itineraryContent}>
            {route.transit_legs?.map((leg, index) => (
              <View key={`${leg.mode}-${index}-${leg.fromName}`} style={[styles.legCard, leg.mode === 'bus' && styles.busLegCard]}>
                <View style={[styles.legIcon, leg.mode === 'bus' && styles.busLegIcon]}>
                  <MaterialCommunityIcons name={leg.mode === 'bus' ? 'bus' : 'walk'} size={23} color={leg.mode === 'bus' ? '#FFFFFF' : '#167C5A'} />
                </View>
                <View style={styles.legText}>
                  {leg.transfer && <Text style={styles.transferText}>여기서 환승</Text>}
                  <Text style={styles.legTitle}>
                    {leg.mode === 'bus' ? `${leg.routeNo || ''}번 버스` : `${leg.toName}까지 걷기`}
                  </Text>
                  <Text style={styles.legDetail}>
                    {leg.fromName} → {leg.toName}
                    {leg.mode === 'bus' ? ` · ${leg.stopCount ?? 0}개 정류장` : ` · ${formatDistance(leg.distanceM)}`}
                  </Text>
                  {leg.mode === 'bus' && leg.arrivalMinutes != null && (
                    <Text style={styles.arrivalText}>현재 기준 약 {leg.arrivalMinutes}분 후 정류장 도착 예정</Text>
                  )}
                </View>
              </View>
            ))}
            <Text style={styles.transitSource}>버스 정보: 국토교통부 TAGO · 실제 운행 상황과 다를 수 있습니다.</Text>
          </ScrollView>
        ) : !guidance.started ? (
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
  slopeNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 12, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F0D58C' },
  slopeNoticeDanger: { backgroundColor: '#FFF1F0', borderColor: '#FDA29B' },
  slopeTextWrap: { flex: 1 }, slopeTitle: { color: '#6B4F00', fontSize: 13, fontWeight: '900' }, slopeBody: { marginTop: 2, color: '#6F6651', fontSize: 10, lineHeight: 14 },
  disasterNotice: { padding: 9, borderRadius: 10, color: '#B42318', backgroundColor: '#FFF1F0', fontSize: 12, fontWeight: '800' },
  itinerary: { maxHeight: 300 }, itineraryContent: { gap: 8, paddingBottom: 5 },
  legCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, backgroundColor: '#F0F7F4', borderWidth: 1, borderColor: '#D6E7E0' },
  busLegCard: { backgroundColor: '#EEF5FF', borderColor: '#C5DAF5' },
  legIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0F1EA' },
  busLegIcon: { backgroundColor: '#1F6FEB' }, legText: { flex: 1 }, legTitle: { color: '#14251F', fontSize: 15, fontWeight: '900' }, legDetail: { marginTop: 3, color: '#596A64', fontSize: 12, lineHeight: 17 },
  transferText: { marginBottom: 2, color: '#1F6FEB', fontSize: 11, fontWeight: '900' }, arrivalText: { marginTop: 4, color: '#1F6FEB', fontSize: 12, fontWeight: '800' },
  transitSource: { marginTop: 2, color: '#71817B', fontSize: 9, textAlign: 'center' },
});
