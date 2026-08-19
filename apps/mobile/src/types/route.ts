import type { HazardReport } from './hazard';
import type { DisasterZone } from './environment';

export type RouteProfile = 'general' | 'elderly' | 'wheelchair';

export type RoutePoint = { latitude: number; longitude: number; elevation?: number };

export type SlopeSegment = {
  start_index: number;
  end_index: number;
  grade_percent: number;
  distance_m?: number;
  level: 'moderate' | 'steep' | 'very_steep' | 'blocked';
};

export type TransitLeg = {
  mode: 'walk' | 'bus';
  fromName: string;
  toName: string;
  geometry: RoutePoint[];
  distanceM: number;
  routeNo?: string;
  stopCount?: number;
  arrivalMinutes?: number;
  transfer?: boolean;
};

export type RouteResponse = {
  route_id: string;
  status: string;
  message: string;
  geometry: RoutePoint[];
  distance_m: number;
  hazards_avoided: number;
  hazards_on_route: HazardReport[];
  used_fallback_graph: boolean;
  travel_mode?: 'walk' | 'bus';
  transit_legs?: TransitLeg[];
  ascent_m?: number;
  descent_m?: number;
  max_grade_percent?: number;
  slope_segments?: SlopeSegment[];
  disaster_zones_avoided?: number;
  disaster_zones?: DisasterZone[];
};
