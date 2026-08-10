import { env } from '@/src/constants/env';
import type { AIAnalysisResponse, HazardReport, ReportResponse } from '@/src/types/hazard';
import type { RoutePoint, RouteProfile, RouteResponse } from '@/src/types/route';

// 💡 백엔드 라우터 prefix인 /api/v1을 기본 URL 끝에 포함하도록 설정
const API_BASE_URL = (env.apiUrl && !env.apiUrl.includes('localhost'))
  ? (env.apiUrl.endsWith('/api/v1') ? env.apiUrl : `${env.apiUrl}/api/v1`)
  : 'http://192.168.219.105:8000/api/v1';

let accessToken: string | undefined;

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? `요청에 실패했습니다. (${response.status})`;
  } catch {
    return `요청에 실패했습니다. (${response.status})`;
  }
}

export function setAccessToken(token?: string) {
  accessToken = token;
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const result = (await response.json()) as { access_token: string };
  setAccessToken(result.access_token);
  return result.access_token;
}

export async function sendEmailOtp(email: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function verifyEmailOtp(email: string, code: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function register(params: { username: string; password: string; email: string }) {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function analyzePhoto(photoUri: string): Promise<AIAnalysisResponse> {
  const filename = photoUri.split('/').pop() ?? 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const form = new FormData();
  form.append('image', {
    uri: photoUri,
    name: filename,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/detections`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function submitReport(params: {
  photoUri: string;
  latitude: number;
  longitude: number;
}): Promise<ReportResponse> {
  const form = new FormData();
  const filename = params.photoUri.split('/').pop() ?? 'photo.jpg';
  form.append('image', { uri: params.photoUri, name: filename, type: 'image/jpeg' } as unknown as Blob);
  form.append('latitude', String(params.latitude));
  form.append('longitude', String(params.longitude));
  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    body: form,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

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
  const response = await fetch(`${API_BASE_URL}/reports/nearby?${search}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function requestRoute(params: {
  origin: RoutePoint;
  destination: RoutePoint;
  profile: RouteProfile;
}): Promise<RouteResponse> {
  const response = await fetch(`${API_BASE_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      prefer_safe_route: params.profile !== 'general',
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}