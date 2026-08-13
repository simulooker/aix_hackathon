import type { RoutePoint } from '@/src/types/route';

const TURN_THRESHOLD_DEG = 30;

export type Maneuver = 'start' | 'straight' | 'left' | 'right';
export type NavigationStep = {
  instruction: string;
  maneuver: Maneuver;
  distanceM: number;
  pointIndex: number;
};

const toRad = (degree: number) => (degree * Math.PI) / 180;
const toDeg = (radian: number) => (radian * 180) / Math.PI;

export function distanceMeters(a: RoutePoint, b: RoutePoint): number {
  const earthRadius = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearing(a: RoutePoint, b: RoutePoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function roundedDistance(distance: number): number {
  if (distance < 100) return Math.max(5, Math.round(distance / 5) * 5);
  return Math.round(distance / 10) * 10;
}

export function buildSteps(points: RoutePoint[]): NavigationStep[] {
  if (points.length < 2) return [];

  const steps: NavigationStep[] = [];
  let previousStepIndex = 0;
  let previousBearing = bearing(points[0], points[1]);

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentBearing = bearing(points[index], points[index + 1]);
    const delta = ((currentBearing - previousBearing + 540) % 360) - 180;
    if (Math.abs(delta) >= TURN_THRESHOLD_DEG) {
      let distance = 0;
      for (let point = previousStepIndex; point < index; point += 1) distance += distanceMeters(points[point], points[point + 1]);
      const maneuver: Maneuver = delta > 0 ? 'right' : 'left';
      const meters = roundedDistance(distance);
      steps.push({
        maneuver,
        distanceM: meters,
        pointIndex: index,
        instruction: `${meters}미터 뒤 ${maneuver === 'right' ? '우회전' : '좌회전'}하세요.`,
      });
      previousStepIndex = index;
      previousBearing = currentBearing;
    }
  }

  let finalDistance = 0;
  for (let point = previousStepIndex; point < points.length - 1; point += 1) finalDistance += distanceMeters(points[point], points[point + 1]);
  const meters = roundedDistance(finalDistance);
  steps.push({
    maneuver: steps.length ? 'straight' : 'start',
    distanceM: meters,
    pointIndex: points.length - 1,
    instruction: `${meters}미터 직진하세요.`,
  });
  return steps;
}
