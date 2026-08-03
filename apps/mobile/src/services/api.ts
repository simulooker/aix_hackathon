import { env } from '@/src/constants/env';
import type { HazardReport, ReportResponse } from '@/src/types/hazard';
import type { RoutePoint, RouteProfile, RouteResponse } from '@/src/types/route';

export type HealthResponse = {
  status: string;
  environment: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${env.apiUrl}/health`);
  if (!response.ok) throw new Error('서버 상태를 확인할 수 없습니다.');
  return response.json();
}

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

// 백엔드에 아직 구현되지 않은 엔드포인트입니다 (services/api/app/api/routes/reports.py 참고).
// 배포되기 전까지는 빈 배열로 처리되어 지도 화면이 조용히 비워집니다.
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

// 백엔드가 아직 프로필 가중치 A* 라우팅을 구현하기 전까지 geometry가 없는 임시 응답을
// 돌려줄 수 있습니다. 호출부에서 route.geometry.length를 확인하고 처리하세요.
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
