import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint, RouteProfile } from '@/src/types/route';
import { distanceMeters } from './routeSteps';

export function projectOnRoute(point: RoutePoint, geometry: RoutePoint[]) {
  let best = { distance: Infinity, along: 0 };
  let total = 0;
  const scale = 111320 * Math.cos(point.latitude * Math.PI / 180);
  for (let i = 1; i < geometry.length; i += 1) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const dx = (b.longitude - a.longitude) * scale;
    const dy = (b.latitude - a.latitude) * 111320;
    const t = Math.max(0, Math.min(1, ((point.longitude - a.longitude) * scale * dx
      + (point.latitude - a.latitude) * 111320 * dy) / (dx * dx + dy * dy || 1)));
    const projected = { latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t };
    const length = distanceMeters(a, b);
    const distance = distanceMeters(point, projected);
    if (distance < best.distance) best = { distance, along: total + t * length };
    total += length;
  }
  return { ...best, total };
}

export function hazardAhead(hazard: RoutePoint, position: RoutePoint, geometry: RoutePoint[]) {
  const user = projectOnRoute(position, geometry);
  const risk = projectOnRoute(hazard, geometry);
  return user.distance <= 60 && risk.distance <= 18 && risk.along >= user.along - 3;
}

export function isBlockingHazard(hazard: HazardReport, profile: RouteProfile) {
  return hazard.is_active && (!hazard.status || hazard.status === 'verified')
    && ((hazard.severity ?? 0) >= 0.6
      || (profile === 'wheelchair' && ['stairs', 'stair', 'stairway'].includes(hazard.hazard_type ?? '')));
}

// Interpolate along the line: a vertex-only choice can land at the destination.
export function testPointAhead(geometry: RoutePoint[], position: RoutePoint): RoutePoint {
  const progress = projectOnRoute(position, geometry);
  const remaining = progress.total - progress.along;
  if (progress.distance > 60 || remaining < 100) {
    throw new Error('테스트할 앞쪽 경로가 부족합니다. 100m 이상 남은 경로에서 시도해 주세요.');
  }
  const target = progress.along + remaining * 0.5;
  let along = 0;
  for (let i = 1; i < geometry.length; i += 1) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const length = distanceMeters(a, b);
    if (along + length >= target) {
      const t = (target - along) / (length || 1);
      const point = { latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t };
      if (distanceMeters(point, position) < 35 || distanceMeters(point, geometry[geometry.length - 1]) < 35) break;
      return point;
    }
    along += length;
  }
  throw new Error('출발·도착점과 너무 가까워 테스트 제보를 넣을 수 없습니다. 다른 경로에서 시도해 주세요.');
}
