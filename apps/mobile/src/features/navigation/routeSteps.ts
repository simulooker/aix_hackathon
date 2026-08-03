import type { RoutePoint } from '@/src/types/route';

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

export type NavigationStep = { instruction: string };

// 경로 좌표들의 방향 변화(bearing delta)로부터 간단한 좌/우회전 안내를 만듭니다.
export function buildSteps(points: RoutePoint[]): NavigationStep[] {
  if (points.length < 2) return [];

  const steps: NavigationStep[] = [{ instruction: '안내를 시작합니다. 직진하세요.' }];
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
