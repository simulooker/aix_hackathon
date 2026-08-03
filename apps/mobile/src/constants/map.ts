import type { RouteProfile } from '@/src/types/route';

export const DEFAULT_REGION = {
  latitude: 35.1768,
  longitude: 126.9081,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export const ROUTE_PROFILES: { value: RouteProfile; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'elderly', label: '고령 보행자' },
  { value: 'wheelchair', label: '전동 휠체어' },
];
