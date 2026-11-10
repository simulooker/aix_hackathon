import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { KakaoMap } from '@/src/components/KakaoMap';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import type { Maneuver, NavigationStep } from '@/src/features/navigation/routeSteps';
import { useVoiceGuidance } from '@/src/features/navigation/useVoiceGuidance';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';
import { useRouteStore } from '@/src/stores/route-store';
import { useLiveRerouting } from '@/src/features/navigation/useLiveRerouting';
import { getReportImageUrl } from '@/src/services/api';
import type { HazardReport } from '@/src/types/hazard';

const TEST_REPORT_IMAGE = require('@/assets/images/reroute-test-fixture.png');

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
  const { coordinates } = useCurrentLocation();
  const live = useLiveRerouting(route, guidance.currentLocation ?? coordinates,
    guidance.started && !guidance.arrived, guidance.announce);
  const [selectedHazard, setSelectedHazard] = useState<HazardReport>();
  const [selectingPhoto, setSelectingPhoto] = useState(false);
  const [followingLocation, setFollowingLocation] = useState(true);
  const [followLocationRequest, setFollowLocationRequest] = useState(0);
  const currentLocation = guidance.currentLocation ?? coordinates;

  const testReport = async (pickPhoto = false) => {
    if (!__DEV__ || selectingPhoto || live.busy) return;
    setSelectingPhoto(true);
    try {
      let uri: string | undefined;
      if (pickPhoto) {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled) return;
        uri = result.assets[0].uri;
      } else {
        uri = Image.resolveAssetSource(TEST_REPORT_IMAGE)?.uri;
      }
      if (!uri) throw new Error('테스트 이미지를 불러오지 못했습니다.');
      await live.addTestReport(uri);
    } catch (error) {
      Alert.alert('사진 제보 테스트', error instanceof Error ? error.message : '테스트 제보를 넣지 못했습니다.');
    } finally { setSelectingPhoto(false); }
  };

  if (!route || route.route_id !== routeId || !route.geometry.length) {
    return <SafeAreaView style={styles.emptyContainer}><Text style={styles.title}>경로 정보를 찾을 수 없습니다.</Text><Text style={styles.body}>지도에서 목적지를 다시 검색해 주세요.</Text><PrimaryButton label="지도로 돌아가기" onPress={() => router.replace('/map')} style={styles.backButton} /></SafeAreaView>;
  }

  const origin = route.geometry[0];
  const destination = route.geometry[route.geometry.length - 1];
  const current = guidance.steps[guidance.stepIndex];
  const maxGrade = route.max_grade_percent ?? 0;
  const maxGradeDegrees = Math.atan(maxGrade / 100) * 180 / Math.PI;
  
  // 💡 [수정] 평지 기준 3.0% 미만 완화 및 등급 세분화
  const slopeLevel = maxGrade >= 12.5 ? 'blocked' : maxGrade >= 8.3 ? 'verySteep' : maxGrade >= 5.0 ? 'steep' : 'moderate';
  const slopeLabel = slopeLevel === 'blocked' ? '통행 곤란 추정' : slopeLevel === 'verySteep' ? '매우 힘듦' : slopeLevel === 'steep' ? '힘듦' : '주의';
  const slopeIconColor = slopeLevel === 'blocked' ? '#292524' : slopeLevel === 'verySteep' ? '#B42318' : slopeLevel === 'steep' ? '#B54708' : '#9A6700';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapArea}>
        <KakaoMap
        style={styles.map}
        center={origin}
        currentLocation={currentLocation}
        followLocation={followingLocation}
        showSlopeLegend={!guidance.started}
        followLocationRequest={followLocationRequest}
        onFollowLocationChange={setFollowingLocation}
        origin={origin} // 💡 [핵심] 출발지(origin) props 추가로 배포본에서도 출발지 핀 정상 렌더링
        destination={destination}
        route={route.geometry}
        hazards={[...new Map([...(route.hazards_on_route ?? []), ...live.hazards, ...live.testReports].map((item) => [item.id, item])).values()]}
        onHazardPress={setSelectedHazard}
        disasters={route.disaster_zones ?? []}
      />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 위치로 돌아와 지도 따라가기"
          accessibilityState={{ disabled: !currentLocation, selected: followingLocation }}
          disabled={!currentLocation}
          onPress={() => {
            setFollowingLocation(true);
            setFollowLocationRequest((value) => value + 1);
          }}
          style={[styles.locationButton, followingLocation && styles.locationButtonActive,
            !currentLocation && styles.locationButtonDisabled]}>
          <MaterialCommunityIcons name={followingLocation ? 'crosshairs-gps' : 'crosshairs'} size={24} color={followingLocation ? '#FFF' : '#167C5A'} />
          <Text style={[styles.locationButtonText, followingLocation && styles.locationButtonTextActive]}>
            {followingLocation ? '위치 따라가는 중' : '내 위치로'}
          </Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: '55%' }} contentContainerStyle={styles.panel}>
        <View style={styles.headerRow}>
          <View><Text style={styles.title}>안전 보행 안내</Text><Text style={styles.body}>전체 거리 {formatDistance(route.distance_m)}</Text></View>
          <View style={styles.voiceRow}><MaterialCommunityIcons name={guidance.voiceEnabled ? 'volume-high' : 'volume-off'} size={21} color="#263D35" /><Text style={styles.voiceText}>음성</Text><Switch value={guidance.voiceEnabled} onValueChange={guidance.setVoiceEnabled} trackColor={{ false: '#CBD5D1', true: '#8BC8B1' }} thumbColor={guidance.voiceEnabled ? '#167C5A' : '#FFF'} /></View>
        </View>
        {!!live.message && <Text accessibilityLiveRegion="polite" style={styles.warning}>{live.message}</Text>}
        {__DEV__ && !guidance.arrived && <View style={styles.testPanel}>
          <PrimaryButton label="경로 위 사진 제보 테스트" loading={live.busy || selectingPhoto} onPress={() => void testReport()} />
          <Pressable disabled={live.busy || selectingPhoto} onPress={() => void testReport(true)}><Text style={styles.testLink}>내 사진을 선택해서 테스트하기</Text></Pressable>
          <Text style={styles.testCaption}>기본 테스트 이미지와 위험도 100%의 모의 공사 제보를 경로 중간에 넣습니다. AI 분석·실제 제보 저장 없이 우회를 시험합니다.{!guidance.started ? ' 안내 시작 전에는 표시된 출발점 기준입니다.' : ''}</Text>
          {!!live.testReports.length && <View style={styles.photoRow}>
            <Image source={{ uri: live.testReports[live.testReports.length - 1].photo_path! }} style={styles.reportPhoto} />
            <Text style={styles.testCaption}>모의 사진 제보 {live.testReports.length}건{live.busy ? ' · 우회 계산 중' : ''}</Text>
          </View>}
        </View>}
        {selectedHazard && <View style={styles.testPanel}>
          <Text style={styles.body}>{selectedHazard.id.startsWith('test-') ? '모의 공사 제보' : '위험 제보 사진'}</Text>
          <Image source={{ uri: selectedHazard.id.startsWith('test-') ? selectedHazard.photo_path! : getReportImageUrl(selectedHazard.id) }} style={{ height: 140, borderRadius: 10 }} />
          <Pressable onPress={() => setSelectedHazard(undefined)}><Text style={styles.testLink}>사진 닫기</Text></Pressable>
        </View>}

        {/* 💡 [수정] 3.0% 이상일 때만 경사 구간 알림창 노출 */}
        {maxGrade >= 3.0 && (
          <View style={[
            styles.slopeNotice,
            slopeLevel === 'steep' && styles.slopeNoticeSteep,
            slopeLevel === 'verySteep' && styles.slopeNoticeDanger,
            slopeLevel === 'blocked' && styles.slopeNoticeBlocked,
          ]}>
            <MaterialCommunityIcons name="slope-uphill" size={23} color={slopeIconColor} />
            <View style={styles.slopeTextWrap}>
              <Text style={[styles.slopeTitle, slopeLevel === 'steep' && styles.slopeTitleSteep, slopeLevel === 'verySteep' && styles.slopeTitleDanger, slopeLevel === 'blocked' && styles.slopeTitleBlocked]}>
                경사 구간 {slopeLabel} · 최대 약 {maxGradeDegrees.toFixed(1)}° ({maxGrade.toFixed(1)}%)
              </Text>
              <Text style={styles.slopeBody}>지도 선은 약 20~50m씩 나눈 고도 기반 추정값입니다. 짧은 턱이나 급경사는 현장에서 다시 확인해 주세요.</Text>
            </View>
          </View>
        )}
        {!!route.disaster_zones_avoided && (
          <Text style={styles.disasterNotice}>재난·도로 통제 구간 {route.disaster_zones_avoided}곳을 제외하고 계산했습니다.</Text>
        )}

        {!guidance.started ? (
          <>
            {route.used_fallback_graph && <Text style={styles.warning}>현재 경로는 실제 도로망이 아닌 임시 직선 경로입니다.</Text>}
            <PrimaryButton label="안내 시작" variant="dark" disabled={live.busy} onPress={() => void guidance.startGuidance()} />
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
        {guidance.started && !guidance.arrived && <Text style={styles.testCaption}>앱을 보고 있는 동안 새 위험 제보를 5초마다 확인합니다.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mapArea: { flex: 1 },
  locationButton: { position: 'absolute', right: 14, bottom: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE7E2', elevation: 4 },
  locationButtonActive: { backgroundColor: '#167C5A', borderColor: '#167C5A' },
  locationButtonDisabled: { opacity: 0.5 },
  locationButtonText: { color: '#167C5A', fontSize: 13, fontWeight: '800' },
  locationButtonTextActive: { color: '#FFF' },
  container: { flex: 1, backgroundColor: '#F7FAF8' }, emptyContainer: { flex: 1, backgroundColor: '#F7FAF8', padding: 24, justifyContent: 'center' }, map: { flex: 1 },
  panel: { padding: 18, gap: 12 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  testPanel: { padding: 10, gap: 8, backgroundColor: '#EEF5F1', borderRadius: 12 },
  testLink: { color: '#167C5A', fontSize: 13, fontWeight: '700', textAlign: 'center', padding: 5 },
  testCaption: { color: '#596A64', fontSize: 11, lineHeight: 16, flexShrink: 1 },
  photoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, reportPhoto: { width: 90, height: 60, borderRadius: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#14251F' }, body: { color: '#596A64', fontSize: 14, marginTop: 4 }, backButton: { marginTop: 20 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, voiceText: { color: '#263D35', fontWeight: '700' }, warning: { color: '#9A6700', backgroundColor: '#FFF4CE', padding: 10, borderRadius: 10, lineHeight: 19 },
  steps: { gap: 7 }, stepRow: { flexDirection: 'row', alignItems: 'center', padding: 9, borderRadius: 14, backgroundColor: '#EEF3F0' }, currentStep: { paddingVertical: 13, backgroundColor: '#E2F3EC', borderWidth: 1, borderColor: '#9BCDBA' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, currentIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#167C5A' },
  stepText: { flex: 1, marginLeft: 11 }, stepCaption: { color: '#71817B', fontSize: 11, fontWeight: '700' }, stepInstruction: { color: '#596A64', fontSize: 14, fontWeight: '700', marginTop: 2 }, currentInstruction: { color: '#14251F', fontSize: 18, fontWeight: '900' },
  arrived: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: '#E2F3EC', borderRadius: 14 }, arrivedText: { color: '#167C5A', fontSize: 18, fontWeight: '900' },
  slopeNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 12, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F0D58C' },
  slopeNoticeSteep: { backgroundColor: '#FFF4E5', borderColor: '#FDBA74' },
  slopeNoticeDanger: { backgroundColor: '#FFF1F0', borderColor: '#FDA29B' },
  slopeNoticeBlocked: { backgroundColor: '#F5F5F4', borderColor: '#78716C' },
  slopeTextWrap: { flex: 1 }, slopeTitle: { color: '#6B4F00', fontSize: 13, fontWeight: '900' }, slopeTitleSteep: { color: '#9A4600' }, slopeTitleDanger: { color: '#B42318' }, slopeTitleBlocked: { color: '#292524' }, slopeBody: { marginTop: 2, color: '#6F6651', fontSize: 10, lineHeight: 14 },
  disasterNotice: { padding: 9, borderRadius: 10, color: '#B42318', backgroundColor: '#FFF1F0', fontSize: 12, fontWeight: '800' },
});
