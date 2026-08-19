import type {
  BusRouteSummary,
  BusStop,
} from '@/src/types/bus';
import type { RoutePoint } from '@/src/types/route';

/**
 * 국토교통부 TAGO 버스 오픈 API 클라이언트.
 *
 * data.go.kr 에서 아래 API 활용신청 후 발급받은 "일반 인증키(Decoding)" 를
 * apps/mobile/.env 의 EXPO_PUBLIC_BUS_API_KEY 에 넣어 주세요.
 *   - 국토교통부_(TAGO)_버스정류소정보
 */
const TAGO_BASE_URL = 'https://apis.data.go.kr/1613000';
const STOP_SERVICE = `${TAGO_BASE_URL}/BusSttnInfoInqireService`;
const MAX_NEARBY_STOP_DISTANCE_M = 900;
const MAX_DISPLAY_STOPS = 30;

export class BusApiKeyMissingError extends Error {
  constructor() {
    super('버스 API 키가 설정되지 않았습니다. .env 의 EXPO_PUBLIC_BUS_API_KEY 를 확인해 주세요.');
    this.name = 'BusApiKeyMissingError';
  }
}

function serviceKey(): string {
  const key = process.env.EXPO_PUBLIC_BUS_API_KEY?.trim();
  if (!key) throw new BusApiKeyMissingError();
  // 공공데이터포털의 Encoding 키를 넣어도 URLSearchParams가 다시 인코딩해
  // 인증이 실패하지 않도록 내부에서는 Decoding 형태로 통일한다.
  if (/%[0-9a-fA-F]{2}/.test(key)) {
    try {
      return decodeURIComponent(key);
    } catch {
      return key;
    }
  }
  return key;
}

/** 자주 나오는 인증 오류에 해결 방법을 덧붙인다. */
function authHint(reason: string): string {
  if (reason.includes('등록되지 않은') || reason.includes('NOT_REGISTERED')) {
    return `${reason} — data.go.kr에서 TAGO 정류소·노선·도착·위치정보 네 API가 모두 승인되었는지 확인해 주세요.`;
  }
  if (reason.includes('IP')) {
    return `${reason} — 마이페이지에서 등록 IP 설정을 확인해 주세요.`;
  }
  return reason;
}

type TagoEnvelope<T> = {
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string };
  };
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: T | T[] } | '';
      totalCount?: number;
    };
  };
};

/**
 * TAGO 응답은 결과가 0건이면 items 가 빈 문자열로, 1건이면 배열이 아닌 객체로 내려온다.
 * 항상 배열로 정규화한다.
 */
function itemsOf<T>(payload: TagoEnvelope<T>): T[] {
  const body = payload.response?.body;
  if (!body || !body.items || typeof body.items === 'string') return [];
  const item = body.items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function tagoFetch<T>(url: string, params: Record<string, string | number>): Promise<T[]> {
  const search = new URLSearchParams({
    serviceKey: serviceKey(),
    _type: 'json',
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });

  const response = await fetch(`${url}?${search}`);
  const text = await response.text();
  if (!response.ok) {
    const xmlReason = /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(text)?.[1]
      ?? /<errMsg>(.*?)<\/errMsg>/.exec(text)?.[1];
    let jsonReason: string | undefined;
    try {
      const errorPayload = JSON.parse(text) as TagoEnvelope<T>;
      const header = errorPayload.OpenAPI_ServiceResponse?.cmmMsgHeader;
      jsonReason = header?.returnAuthMsg ?? header?.errMsg;
    } catch {
      // HTML 또는 빈 오류 응답은 아래 상태 코드 안내를 사용한다.
    }
    const reason = xmlReason ?? jsonReason;
    if (reason) throw new Error(`버스 API 오류: ${authHint(reason)}`);
    if (response.status === 403) {
      throw new Error('버스 API 인증이 거부되었습니다. EAS의 EXPO_PUBLIC_BUS_API_KEY가 일반 인증키(Decoding)인지, TAGO 정류소·노선·도착·위치정보 네 API가 모두 승인 상태인지 확인해 주세요.');
    }
    throw new Error(`버스 정보를 불러오지 못했습니다. (${response.status})`);
  }

  let payload: TagoEnvelope<T>;
  try {
    payload = JSON.parse(text) as TagoEnvelope<T>;
  } catch {
    // 게이트웨이 단계 오류는 JSON 이 아니라 XML 로 내려오기도 한다.
    const reason = /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(text)?.[1];
    throw new Error(reason ? `버스 API 오류: ${authHint(reason)}` : '버스 API 응답을 해석하지 못했습니다.');
  }

  // 인증키 미등록 등 게이트웨이 오류는 정상 응답과 전혀 다른 형태로 내려온다.
  const gatewayError = payload.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gatewayError) {
    const reason = gatewayError.returnAuthMsg ?? gatewayError.errMsg ?? '알 수 없는 오류';
    throw new Error(`버스 API 오류: ${authHint(reason)}`);
  }

  const resultCode = payload.response?.header?.resultCode;
  // '00' 정상, '03' 데이터 없음
  if (resultCode && resultCode !== '00' && resultCode !== '03') {
    throw new Error(payload.response?.header?.resultMsg ?? '버스 정보를 불러오지 못했습니다.');
  }
  return itemsOf(payload);
}

type StopItem = {
  nodeid?: string;
  nodenm?: string;
  gpslati?: number;
  gpslong?: number;
  citycode?: number;
};

/** 좌표 주변(약 500m) 버스정류장 목록 */
export async function getNearbyBusStops(params: {
  latitude: number;
  longitude: number;
  limit?: number;
}): Promise<BusStop[]> {
  const items = await tagoFetch<StopItem>(`${STOP_SERVICE}/getCrdntPrxmtSttnList`, {
    gpsLati: params.latitude,
    gpsLong: params.longitude,
    numOfRows: params.limit ?? 30,
    pageNo: 1,
  });

  const unique = new Map<string, BusStop>();
  items
    .filter((item) => item.nodeid && item.gpslati != null && item.gpslong != null && item.citycode != null)
    .map((item) => ({
      nodeId: String(item.nodeid),
      name: item.nodenm ?? '정류장',
      latitude: Number(item.gpslati),
      longitude: Number(item.gpslong),
      cityCode: item.citycode,
    }))
    .filter((stop) => (
      Number.isFinite(stop.latitude)
      && Number.isFinite(stop.longitude)
      && stop.latitude >= 33
      && stop.latitude <= 39
      && stop.longitude >= 124
      && stop.longitude <= 132
      && distanceMeters(params, stop) <= MAX_NEARBY_STOP_DISTANCE_M
    ))
    .forEach((stop) => unique.set(`${stop.cityCode}:${stop.nodeId}`, stop));
  return [...unique.values()]
    .sort((left, right) => distanceMeters(params, left) - distanceMeters(params, right))
    .slice(0, params.limit ?? 30);
}

type RouteItem = {
  routeid?: string;
  routeno?: string | number;
  routetp?: string;
  startnodenm?: string;
  endnodenm?: string;
};

/** 특정 정류장을 경유하는 노선 목록 */
const routesThroughStopCache = new Map<string, Promise<BusRouteSummary[]>>();

export async function getRoutesThroughStop(params: {
  cityCode: number;
  nodeId: string;
}): Promise<BusRouteSummary[]> {
  const cacheKey = `${params.cityCode}:${params.nodeId}`;
  const cached = routesThroughStopCache.get(cacheKey);
  if (cached) return cached;
  const request = tagoFetch<RouteItem>(`${STOP_SERVICE}/getSttnThrghRouteList`, {
    cityCode: params.cityCode,
    nodeid: params.nodeId,
    numOfRows: 50,
    pageNo: 1,
  }).then((items) => items
    .filter((item) => item.routeid)
    .map((item) => ({
      routeId: String(item.routeid),
      routeNo: String(item.routeno ?? ''),
      routeType: item.routetp,
      startNodeName: item.startnodenm,
      endNodeName: item.endnodenm,
    })));
  routesThroughStopCache.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    routesThroughStopCache.delete(cacheKey);
    throw error;
  }
}

/** 좌표가 정상이고 현재 운행 노선이 확인되는 가까운 정류장만 지도에 표시한다. */
export async function getDisplayableNearbyBusStops(params: {
  latitude: number;
  longitude: number;
}): Promise<BusStop[]> {
  const candidates = await getNearbyBusStops({ ...params, limit: MAX_DISPLAY_STOPS });
  const checked: BusStop[] = [];
  // 공공데이터 서버에 30개 요청을 한꺼번에 보내면 일시 차단될 수 있어 5개씩 확인합니다.
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const active = await Promise.all(batch.map(async (stop) => {
      if (stop.cityCode == null) return undefined;
      try {
        const routes = await getRoutesThroughStop({ cityCode: stop.cityCode, nodeId: stop.nodeId });
        return routes.length ? stop : undefined;
      } catch {
        return undefined;
      }
    }));
    checked.push(...active.filter((stop): stop is BusStop => stop != null));
  }
  return checked;
}

function distanceMeters(left: RoutePoint, right: RoutePoint): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude))
    * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
