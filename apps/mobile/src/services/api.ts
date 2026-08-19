import { env } from '@/src/constants/env';
import type { AIAnalysisResponse, HazardReport, ReportResponse } from '@/src/types/hazard';
import type { DisasterZone, EnvironmentContext } from '@/src/types/environment';
import type { RoutePoint, RouteProfile, RouteResponse } from '@/src/types/route';

const normalizedApiUrl = env.apiUrl.replace(/\/$/, '');
const API_BASE_URL = normalizedApiUrl.endsWith('/api/v1')
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api/v1`;

let accessToken: string | undefined;
const ACCESS_TOKEN_KEY = 'withyou.accessToken';

async function getSecureStore() {
  try {
    return await import('expo-secure-store');
  } catch {
    return undefined;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    const detail = payload.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;

    const validationErrors = Array.isArray(detail) ? detail : detail ? [detail] : [];
    const messages = validationErrors
      .map((item) => {
        if (!item || typeof item !== 'object') return undefined;
        const error = item as { msg?: unknown; loc?: unknown[] };
        const rawMessage = typeof error.msg === 'string'
          ? error.msg.replace(/^Value error,\s*/i, '').trim()
          : '';
        if (rawMessage && rawMessage !== 'Field required') return rawMessage;
        const field = error.loc?.[error.loc.length - 1];
        if (field === 'username') return '아이디를 입력해 주세요.';
        if (field === 'password' || field === 'current_password' || field === 'new_password') {
          return '비밀번호를 올바르게 입력해 주세요.';
        }
        if (field === 'email') return '올바른 이메일 주소를 입력해 주세요.';
        return rawMessage || undefined;
      })
      .filter((message): message is string => !!message);
    if (messages.length) return [...new Set(messages)].join('\n');
    return `요청을 처리하지 못했습니다. (${response.status})`;
  } catch {
    return `요청을 처리하지 못했습니다. (${response.status})`;
  }
}

export function setAccessToken(token?: string) {
  accessToken = token;
}

export async function restoreAccessToken(): Promise<void> {
  const secureStore = await getSecureStore();
  setAccessToken((await secureStore?.getItemAsync(ACCESS_TOKEN_KEY)) ?? undefined);
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
  const secureStore = await getSecureStore();
  await secureStore?.setItemAsync(ACCESS_TOKEN_KEY, result.access_token);
  return result.access_token;
}

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
};

function authenticatedHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!accessToken) throw new Error('로그인이 필요합니다.');
  return { ...extra, Authorization: `Bearer ${accessToken}` };
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    headers: authenticatedHeaders(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/me/password`, {
    method: 'PUT',
    headers: authenticatedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function deleteAccount(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'DELETE',
    headers: authenticatedHeaders(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
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
  headingDeg?: number;
  headingAccuracy?: number;
}): Promise<ReportResponse> {
  const form = new FormData();
  const filename = params.photoUri.split('/').pop() ?? 'photo.jpg';
  form.append('image', { uri: params.photoUri, name: filename, type: 'image/jpeg' } as unknown as Blob);
  form.append('latitude', String(params.latitude));
  form.append('longitude', String(params.longitude));
  if (params.headingDeg != null) form.append('heading_deg', String(params.headingDeg));
  if (params.headingAccuracy != null) {
    form.append('heading_accuracy', String(params.headingAccuracy));
  }
  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    body: form,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function getNearbyHazards(params: { latitude: number; longitude: number; radiusM?: number }): Promise<HazardReport[]> {
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

export function getReportImageUrl(reportId: string): string {
  return `${API_BASE_URL}/reports/${encodeURIComponent(reportId)}/image`;
}

export async function requestRoute(params: { origin: RoutePoint; destination: RoutePoint; profile: RouteProfile }): Promise<RouteResponse> {
  const response = await fetch(`${API_BASE_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      prefer_safe_route: true,
      profile: params.profile,
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function requestRoadRoute(points: RoutePoint[]): Promise<{ geometry: RoutePoint[]; distance_m: number }> {
  const response = await fetch(`${API_BASE_URL}/routes/road`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function getEnvironmentContext(params: {
  latitude: number;
  longitude: number;
  profile: RouteProfile;
  radiusM?: number;
}): Promise<EnvironmentContext> {
  const search = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    profile: params.profile,
    radius_m: String(params.radiusM ?? 1500),
  });
  const response = await fetch(`${API_BASE_URL}/environment/context?${search}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function getRouteDisasters(origin: RoutePoint, destination: RoutePoint): Promise<DisasterZone[]> {
  const search = new URLSearchParams({
    origin_lat: String(origin.latitude),
    origin_lon: String(origin.longitude),
    destination_lat: String(destination.latitude),
    destination_lon: String(destination.longitude),
  });
  const response = await fetch(`${API_BASE_URL}/environment/route-disasters?${search}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}
