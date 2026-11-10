import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getNearbyHazards, requestRoute } from '@/src/services/api';
import { useRouteStore } from '@/src/stores/route-store';
import { usePreferencesStore } from '@/src/stores/preferences-store';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint, RouteResponse } from '@/src/types/route';
import { hazardAhead, isBlockingHazard, projectOnRoute, testPointAhead } from './liveRoute';
import { distanceMeters } from './routeSteps';

export function useLiveRerouting(route: RouteResponse | undefined, position: RoutePoint | undefined,
  enabled: boolean, announce: (text: string) => void) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [testReports, setTestReports] = useState<HazardReport[]>([]);
  const latest = useRef({ route, position, enabled, announce });
  const inject = useRef<((uri: string) => Promise<void>) | undefined>(undefined);
  const sessionId = route?.route_id;
  const [stateSessionId, setStateSessionId] = useState(sessionId);
  if (stateSessionId !== sessionId) {
    setStateSessionId(sessionId);
    setMessage('');
    setTestReports([]);
    setHazards([]);
    setBusy(false);
  }

  useEffect(() => {
    latest.current = { route, position, enabled, announce };
  }, [route, position, enabled, announce]);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let working = false;
    let polling = false;
    let retryAt = 0;
    let controller: AbortController | undefined;
    let pollController: AbortController | undefined;
    const openedAt = Date.now();
    const blocked = new Map<string, HazardReport>();
    const pending = new Map<string, HazardReport>();
    const profile = useRouteStore.getState().profile ?? usePreferencesStore.getState().routeProfile;
    const destination = latest.current.route!.geometry.slice(-1)[0];
    if (!profile) return;

    async function reroute(reports: HazardReport[], origin: RoutePoint, test = false) {
      const previous = latest.current.route;
      if (!previous || working || disposed || previous.route_id !== sessionId) return;
      const threats = reports.filter((item) => !blocked.has(item.id)
        && hazardAhead(item, origin, previous.geometry));
      if (!threats.length) return;
      const exclusions = [...blocked.values(), ...threats];
      if (exclusions.length > 32) throw new Error('이 경로의 위험 지점이 너무 많습니다. 목적지를 다시 검색해 주세요.');
      working = true; setBusy(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 90000);
      setMessage(`${test ? '테스트 제보를' : '새 위험 제보를'} 감지했습니다. 위험 구간을 피해 다시 탐색 중입니다.`);
      latest.current.announce('앞쪽 위험 제보를 감지해 우회 경로를 찾고 있습니다.');
      try {
        const next = await requestRoute({ origin, destination, profile: profile!,
          blockedPoints: exclusions, signal: controller.signal });
        if (disposed || useRouteStore.getState().route !== previous) return;
        if (next.used_fallback_graph || next.status !== 'ready' || next.geometry.length < 3
          || exclusions.some((item) => projectOnRoute(item, next.geometry).distance <= 18)) {
          throw new Error('새 위험 구간을 피하는 경로를 찾지 못했습니다.');
        }
        if (!test && latest.current.position && distanceMeters(origin, latest.current.position) > 30) {
          throw new Error('계산 중 위치가 바뀌었습니다. 최신 위치로 다시 탐색합니다.');
        }
        useRouteStore.setState({ route: { ...next, route_id: sessionId! } });
        exclusions.forEach((item) => { blocked.set(item.id, item); pending.delete(item.id); });
        const difference = Math.round(next.distance_m - (projectOnRoute(origin, previous.geometry).total
          - projectOnRoute(origin, previous.geometry).along));
        setMessage(`위험 구간을 피해 경로를 변경했습니다. 새 경로 ${Math.round(next.distance_m)}m (${difference >= 0 ? '+' : ''}${difference}m)${test && !latest.current.enabled ? ' · 표시된 출발점 기준 테스트' : ''}`);
        latest.current.announce('위험 구간을 피해 새 경로로 안내합니다.');
        retryAt = Date.now() + 10000;
      } catch (error) {
        if (!disposed) {
          retryAt = Date.now() + 30000;
          const detail = controller.signal.aborted ? '경로 서버 응답 시간이 초과되었습니다.'
            : error instanceof Error ? error.message : '우회 계산에 실패했습니다.';
          setMessage(`${detail} 기존 경로를 유지합니다. 이동을 멈추고 주변을 확인해 주세요.`);
          latest.current.announce('우회 경로를 찾지 못했습니다. 이동을 멈추고 주변을 확인해 주세요.');
        }
      } finally {
        clearTimeout(timeout); working = false;
        if (!disposed) setBusy(false);
      }
    }

    inject.current = async (uri) => {
      if (disposed || working) return;
      const context = latest.current;
      if (!context.route) return;
      // Before guidance starts, test the displayed route from its displayed origin.
      const origin = context.enabled ? context.position : context.route.geometry[0];
      if (!origin || projectOnRoute(origin, context.route.geometry).distance > 60) {
        throw new Error('현재 GPS 위치가 경로에서 떨어져 있습니다. 지도에서 현재 위치를 출발지로 경로를 검색하거나, 안내 시작 전에 테스트해 주세요.');
      }
      const report: HazardReport = { ...testPointAhead(context.route.geometry, origin),
        id: `test-${Date.now()}`, status: 'verified', is_active: true,
        severity: 1, hazard_type: 'construction', created_at: new Date().toISOString(), photo_path: uri };
      pending.set(report.id, report);
      setTestReports((items) => [...items, report]);
      await reroute([report], origin, true);
    };

    async function tick() {
      const context = latest.current;
      if (disposed || polling || working || !context.enabled || !context.position
        || AppState.currentState !== 'active') return;
      polling = true;
      pollController = new AbortController();
      const timeout = setTimeout(() => pollController?.abort(), 12000);
      try {
        const nearby = await getNearbyHazards({ ...context.position, radiusM: 1000, signal: pollController.signal });
        if (disposed) return;
        setHazards(nearby);
        nearby.filter((item) => Date.parse(item.created_at) >= openedAt && isBlockingHazard(item, profile!))
          .forEach((item) => pending.set(item.id, item));
        // Remove resolved/expired real reports that are inside this lookup area.
        const ids = new Set(nearby.map((item) => item.id));
        for (const [id, item] of pending) {
          if (!id.startsWith('test-') && distanceMeters(item, context.position) < 900 && !ids.has(id)) pending.delete(id);
        }
        if (Date.now() >= retryAt) await reroute([...pending.values()], context.position);
      } catch {
        if (!disposed && !working) setMessage('새 제보를 확인하지 못했습니다. 서버 연결을 확인해 주세요.');
      } finally { clearTimeout(timeout); polling = false; }
    }
    const timer = setInterval(() => void tick(), 5000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void tick(); });
    void tick();
    return () => { disposed = true; inject.current = undefined; controller?.abort(); pollController?.abort(); clearInterval(timer); listener.remove(); };
  }, [sessionId]);

  const addTestReport = async (uri: string) => {
    if (!inject.current) throw new Error('경로 정보를 불러온 뒤 다시 시도해 주세요.');
    await inject.current(uri);
  };
  return { message, busy, hazards, testReports, addTestReport };
}
