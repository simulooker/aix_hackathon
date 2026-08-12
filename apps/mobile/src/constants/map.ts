import type { RouteProfile } from '@/src/types/route';

export const DEFAULT_REGION = {
  latitude: 35.1768,
  longitude: 126.9081,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export const ROUTE_PROFILES: { value: RouteProfile; label: string; description: string }[] = [
  { value: 'general', label: '일반', description: '일반 보행 기준' },
  { value: 'elderly', label: '고령 보행자', description: '위험 구간 최소화' },
  { value: 'wheelchair', label: '휠체어', description: '계단·단차 회피' },
];
