import { env } from '@/src/config/env';

export type HealthResponse = {
  status: string;
  environment: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${env.apiUrl}/health`);
  if (!response.ok) throw new Error('서버 상태를 확인할 수 없습니다.');
  return response.json();
}

export type ReportResponse = {
  report_id: string;
  status: 'pending' | 'verified' | 'rejected' | 'resolved';
  filename: string | null;
  latitude: number;
  longitude: number;
  hazard_type: string | null;
  confidence: number | null;
  severity: number | null;
};

export async function submitReport(params: {
  photoUri: string;
  latitude: number;
  longitude: number;
}): Promise<ReportResponse> {
  const form = new FormData();
  const filename = params.photoUri.split('/').pop() ?? 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'jpg';

  form.append('image', {
    uri: params.photoUri,
    name: filename,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  } as unknown as Blob);
  form.append('latitude', String(params.latitude));
  form.append('longitude', String(params.longitude));

  const response = await fetch(`${env.apiUrl}/api/v1/reports`, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!response.ok) throw new Error('신고를 전송하지 못했습니다.');
  return response.json();
}

export type HazardReport = {
  id: string;
  latitude: number;
  longitude: number;
  hazard_type: string | null;
  confidence: number | null;
  severity: number | null;
  status: 'pending' | 'verified' | 'rejected' | 'resolved';
  created_at: string;
};

export async function getNearbyHazards(params: {
  latitude: number;
  longitude: number;
  radiusM?: number;
}): Promise<HazardReport[]> {
  const search = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    radius_m: String(params.radiusM ?? 800),
  });
  const response = await fetch(`${env.apiUrl}/api/v1/reports/nearby?${search.toString()}`);
  if (!response.ok) throw new Error('주변 위험 정보를 불러오지 못했습니다.');
  return response.json();
}

export type RouteProfile = 'general' | 'elderly' | 'wheelchair';

export type RoutePoint = { latitude: number; longitude: number };

export type RouteResponse = {
  route_id: string;
  status: string;
  message: string;
  geometry: RoutePoint[];
  distance_m: number;
  hazards_avoided: number;
  used_fallback_graph: boolean;
};

export async function requestRoute(params: {
  origin: RoutePoint;
  destination: RoutePoint;
  profile: RouteProfile;
}): Promise<RouteResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      profile: params.profile,
    }),
  });
  if (!response.ok) throw new Error('안심 경로를 계산하지 못했습니다.');
  return response.json();
}
