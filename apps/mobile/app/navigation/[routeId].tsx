import { useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { RoutePoint } from '@/src/services/api';
import { useRouteStore } from '@/src/stores/route-store';

const TURN_THRESHOLD_DEG = 35;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function bearing(a: RoutePoint, b: RoutePoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

type Step = { instruction: string };

function buildSteps(points: RoutePoint[]): Step[] {
  if (points.length < 2) return [];

  const steps: Step[] = [{ instruction: '안내를 시작합니다. 직진하세요.' }];
  let prevBearing = bearing(points[0], points[1]);

  for (let i = 1; i < points.length - 1; i += 1) {
    const currentBearing = bearing(points[i], points[i + 1]);
    let delta = currentBearing - prevBearing;
    delta = ((delta + 540) % 360) - 180;

    if (Math.abs(delta) > TURN_THRESHOLD_DEG) {
      steps.push({ instruction: delta > 0 ? '우회전하세요.' : '좌회전하세요.' });
      prevBearing = currentBearing;
    }
  }

  steps.push({ instruction: '목적지에 도착했습니다.' });
  return steps;
}

export default function NavigationScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const route = useRouteStore((state) => state.route);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => (route ? buildSteps(route.geometry) : []), [route]);

  if (!route || route.route_id !== routeId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>경로 정보를 찾을 수 없습니다.</Text>
        <Text style={styles.body}>지도 화면에서 목적지를 다시 선택해주세요.</Text>
      </SafeAreaView>
    );
  }

  const origin = route.geometry[0];
  const destination = route.geometry[route.geometry.length - 1];
  const region = { ...origin, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  const speakSummary = () => {
    Speech.speak(
      `목적지까지 약 ${Math.round(route.distance_m)}미터. 위험 구간 ${route.hazards_avoided}곳을 피해 안내합니다.`,
      { language: 'ko-KR' },
    );
  };

  const speakNextStep = () => {
    const step = steps[stepIndex];
    if (!step) return;
    Speech.speak(step.instruction, { language: 'ko-KR' });
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  return (
    <SafeAreaView style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        <Polyline coordinates={route.geometry} strokeColor="#167C5A" strokeWidth={5} />
        <Marker coordinate={origin} title="출발" pinColor="#167C5A" />
        <Marker coordinate={destination} title="도착" pinColor="#14251F" />
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.title}>안심 우회 경로</Text>
        <Text style={styles.body}>
          거리 약 {Math.round(route.distance_m)}m · 위험 구간 {route.hazards_avoided}곳 회피
          {route.used_fallback_graph ? ' · 임시 경로망 사용' : ''}
        </Text>
        <Pressable style={styles.button} onPress={speakSummary}>
          <Text style={styles.buttonText}>경로 요약 음성 안내</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={speakNextStep}>
          <Text style={styles.buttonText}>
            다음 안내 ({Math.min(stepIndex + 1, steps.length)}/{steps.length})
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8' },
  map: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: '#14251F', paddingHorizontal: 20, paddingTop: 16 },
  body: { color: '#596A64', fontSize: 14, lineHeight: 21, paddingHorizontal: 20, marginTop: 8 },
  panel: { padding: 20, gap: 10 },
  button: { padding: 16, alignItems: 'center', borderRadius: 14, backgroundColor: '#167C5A' },
  secondaryButton: { backgroundColor: '#14251F' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
