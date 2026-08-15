import type { HazardReport } from './hazard';

export type RouteProfile = 'general' | 'elderly' | 'wheelchair';

export type RoutePoint = { latitude: number; longitude: number };

export type RouteResponse = {
  route_id: string;
  status: string;
  message: string;
  geometry: RoutePoint[];
  distance_m: number;
  hazards_avoided: number;
  hazards_on_route: HazardReport[];
  used_fallback_graph: boolean;
};
