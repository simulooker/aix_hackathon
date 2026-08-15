import type { BusRouteSummary, BusStop, LiveBus } from '@/src/types/bus';

/**
 * 국토교통부 TAGO 버스 오픈 API 클라이언트.
 *
 * data.go.kr 에서 아래 3개 API 활용신청 후 발급받은 "일반 인증키(Decoding)" 를
 * apps/mobile/.env 의 EXPO_PUBLIC_BUS_API_KEY 에 넣어 주세요.
 *   - 국토교통부_(TAGO)_버스정류소정보
 *   - 국토교통부_(TAGO)_버스위치정보
 */
const TAGO_BASE_URL = 'https://apis.data.go.kr/1613000';
const STOP_SERVICE = `${TAGO_BASE_URL}/BusSttnInfoInqireService`;
const LOCATION_SERVICE = `${TAGO_BASE_URL}/BusLcInfoInqireService`;

/** getCtyCodeList 조회에 실패했을 때 사용하는 광주광역시 기본 도시코드 */
const GWANGJU_FALLBACK_CITY_CODE = 24;

export class BusApiKeyMissingError extends Error {
  constructor() {
    super('버스 API 키가 설정되지 않았습니다. .env 의 EXPO_PUBLIC_BUS_API_KEY 를 확인해 주세요.');
    this.name = 'BusApiKeyMissingError';
  }
}

function serviceKey(): string {
  const key = process.env.EXPO_PUBLIC_BUS_API_KEY?.trim();
  if (!key) throw new BusApiKeyMissingError();
  return key;
}

/** 자주 나오는 인증 오류에 해결 방법을 덧붙인다. */
function authHint(reason: string): string {
  if (reason.includes('등록되지 않은') || reason.includes('NOT_REGISTERED')) {
    return `${reason} — data.go.kr 에서 TAGO 버스정류소정보·버스위치정보 활용신청이 되어 있는지 확인해 주세요.`;
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
  if (!response.ok) {
    throw new Error(`버스 정보를 불러오지 못했습니다. (${response.status})`);
  }

  const text = await response.text();
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

let cachedCityCode: number | undefined;

/** 광주광역시의 TAGO 도시코드를 조회한다. 실패 시 기본값으로 폴백. */
export async function getGwangjuCityCode(): Promise<number> {
  if (cachedCityCode != null) return cachedCityCode;
  try {
    const items = await tagoFetch<{ citycode?: number; cityname?: string }>(
      `${LOCATION_SERVICE}/getCtyCodeList`,
      { numOfRows: 200, pageNo: 1 },
    );
    // '광주' 부분일치는 경기도 광주시(31250)도 잡히므로 정확히 광주광역시만 고른다.
    const gwangju =
      items.find((item) => item.cityname?.trim() === '광주광역시') ??
      items.find((item) => item.citycode === GWANGJU_FALLBACK_CITY_CODE);
    cachedCityCode = gwangju?.citycode ?? GWANGJU_FALLBACK_CITY_CODE;
  } catch {
    cachedCityCode = GWANGJU_FALLBACK_CITY_CODE;
  }
  return cachedCityCode;
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

  return items
    .filter((item) => item.nodeid && item.gpslati != null && item.gpslong != null)
    .map((item) => ({
      nodeId: String(item.nodeid),
      name: item.nodenm ?? '정류장',
      latitude: Number(item.gpslati),
      longitude: Number(item.gpslong),
      cityCode: item.citycode,
    }));
}

type RouteItem = {
  routeid?: string;
  routeno?: string | number;
  routetp?: string;
  startnodenm?: string;
  endnodenm?: string;
};

/** 특정 정류장을 경유하는 노선 목록 */
export async function getRoutesThroughStop(params: {
  cityCode: number;
  nodeId: string;
}): Promise<BusRouteSummary[]> {
  const items = await tagoFetch<RouteItem>(`${STOP_SERVICE}/getSttnThrghRouteList`, {
    cityCode: params.cityCode,
    nodeid: params.nodeId,
    numOfRows: 50,
    pageNo: 1,
  });

  return items
    .filter((item) => item.routeid)
    .map((item) => ({
      routeId: String(item.routeid),
      routeNo: String(item.routeno ?? ''),
      routeType: item.routetp,
      startNodeName: item.startnodenm,
      endNodeName: item.endnodenm,
    }));
}

type BusLocationItem = {
  vehicleno?: string;
  routenm?: string | number;
  gpslati?: number;
  gpslong?: number;
  nodenm?: string;
  nodeord?: number;
};

/** 노선별 실시간 버스 위치 */
export async function getBusesOnRoute(params: {
  cityCode: number;
  routeId: string;
}): Promise<LiveBus[]> {
  const items = await tagoFetch<BusLocationItem>(`${LOCATION_SERVICE}/getRouteAcctoBusLcList`, {
    cityCode: params.cityCode,
    routeId: params.routeId,
    numOfRows: 100,
    pageNo: 1,
  });

  return items
    .filter((item) => item.gpslati != null && item.gpslong != null)
    .map((item) => ({
      vehicleNo: String(item.vehicleno ?? ''),
      routeId: params.routeId,
      routeNo: String(item.routenm ?? ''),
      latitude: Number(item.gpslati),
      longitude: Number(item.gpslong),
      nodeName: item.nodenm,
      nodeOrder: item.nodeord,
    }));
}
