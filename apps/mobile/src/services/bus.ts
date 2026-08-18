import type {
  BusArrival,
  BusJourneyPlan,
  BusJourneySegment,
  BusRouteStop,
  BusRouteSummary,
  BusStop,
  LiveBus,
} from '@/src/types/bus';
import type { RoutePoint } from '@/src/types/route';
import type { DisasterZone } from '@/src/types/environment';

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
const ROUTE_SERVICE = `${TAGO_BASE_URL}/BusRouteInfoInqireService`;
const ARRIVAL_SERVICE = `${TAGO_BASE_URL}/ArvlInfoInqireService`;

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

type RouteStopItem = StopItem & {
  nodeord?: number | string;
};

/** 노선이 실제로 지나는 정류장을 운행 순서대로 조회한다. */
export async function getStopsOnRoute(params: {
  cityCode: number;
  routeId: string;
}): Promise<BusRouteStop[]> {
  const items = await tagoFetch<RouteStopItem>(`${ROUTE_SERVICE}/getRouteAcctoThrghSttnList`, {
    cityCode: params.cityCode,
    routeId: params.routeId,
    numOfRows: 500,
    pageNo: 1,
  });

  return items
    .filter((item) => item.nodeid && item.gpslati != null && item.gpslong != null)
    .map((item, index) => ({
      nodeId: String(item.nodeid),
      name: item.nodenm ?? '정류장',
      latitude: Number(item.gpslati),
      longitude: Number(item.gpslong),
      cityCode: item.citycode ?? params.cityCode,
      order: Number(item.nodeord ?? index + 1),
    }))
    .sort((left, right) => left.order - right.order);
}

type ArrivalItem = {
  routeid?: string;
  routeno?: string | number;
  arrtime?: number | string;
  arrprevstationcnt?: number | string;
};

/** 승차 정류장에 도착할 버스의 예상 시간을 조회한다. */
export async function getArrivalsAtStop(params: {
  cityCode: number;
  nodeId: string;
}): Promise<BusArrival[]> {
  const items = await tagoFetch<ArrivalItem>(`${ARRIVAL_SERVICE}/getSttnAcctoArvlPrearngeInfoList`, {
    cityCode: params.cityCode,
    nodeId: params.nodeId,
    numOfRows: 100,
    pageNo: 1,
  });
  return items
    .filter((item) => item.routeid)
    .map((item) => ({
      routeId: String(item.routeid),
      routeNo: String(item.routeno ?? ''),
      arrivalMinutes: item.arrtime == null ? undefined : Math.max(1, Math.ceil(Number(item.arrtime) / 60)),
      remainingStops: item.arrprevstationcnt == null ? undefined : Number(item.arrprevstationcnt),
    }));
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

function pathDistance(stops: BusRouteStop[]): number {
  return stops.slice(1).reduce(
    (sum, stop, index) => sum + distanceMeters(stops[index], stop),
    0,
  );
}

function distanceToSegmentMeters(point: RoutePoint, start: RoutePoint, end: RoutePoint): number {
  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos(point.latitude * Math.PI / 180);
  const startX = (start.longitude - point.longitude) * longitudeScale;
  const startY = (start.latitude - point.latitude) * latitudeScale;
  const endX = (end.longitude - point.longitude) * longitudeScale;
  const endY = (end.latitude - point.latitude) * latitudeScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
  return Math.hypot(startX + ratio * deltaX, startY + ratio * deltaY);
}

function crossesDisaster(stops: BusRouteStop[], disasters: DisasterZone[]): boolean {
  if (!disasters.length) return false;
  return stops.slice(1).some((stop, index) => disasters.some((zone) => (
    distanceToSegmentMeters(zone, stops[index], stop) <= zone.radius_m + 30
  )));
}

function routeSlice(stops: BusRouteStop[], fromNodeId: string, toNodeId: string): BusRouteStop[] | undefined {
  const startIndex = stops.findIndex((stop) => stop.nodeId === fromNodeId);
  const endIndex = stops.findIndex((stop, index) => index > startIndex && stop.nodeId === toNodeId);
  if (startIndex < 0 || endIndex <= startIndex) return undefined;
  return stops.slice(startIndex, endIndex + 1);
}

function makeSegment(
  route: BusRouteSummary,
  cityCode: number,
  stops: BusRouteStop[],
  fromNodeId: string,
  toNodeId: string,
): BusJourneySegment | undefined {
  const selected = routeSlice(stops, fromNodeId, toNodeId);
  if (!selected || selected.length < 2) return undefined;
  return {
    routeId: route.routeId,
    routeNo: route.routeNo,
    cityCode,
    fromStop: selected[0],
    toStop: selected[selected.length - 1],
    stops: selected,
    stopCount: selected.length - 1,
  };
}

type StopWithRoutes = {
  stop: BusStop;
  cityCode: number;
  routes: BusRouteSummary[];
};

async function stopsWithRoutes(stops: BusStop[]): Promise<StopWithRoutes[]> {
  const nearest = stops.slice(0, 4);
  return Promise.all(nearest.map(async (stop) => {
    const cityCode = Number(stop.cityCode ?? await getGwangjuCityCode());
    return { stop, cityCode, routes: await getRoutesThroughStop({ cityCode, nodeId: stop.nodeId }) };
  }));
}

function scorePlan(plan: BusJourneyPlan): number {
  const busStops = plan.segments.reduce((sum, segment) => sum + segment.stopCount, 0);
  return plan.walkingDistanceM + busStops * 120 + plan.transferCount * 1000;
}

async function addArrival(plan: BusJourneyPlan): Promise<BusJourneyPlan> {
  const first = plan.segments[0];
  try {
    const arrivals = await getArrivalsAtStop({ cityCode: first.cityCode, nodeId: first.fromStop.nodeId });
    const arrival = arrivals.find((item) => item.routeId === first.routeId);
    if (arrival) first.arrivalMinutes = arrival.arrivalMinutes;
  } catch {
    // 도착 정보가 없는 지역도 경로 자체는 표시한다.
  }
  plan.estimatedMinutes += first.arrivalMinutes ?? 0;
  return plan;
}

function completePlan(
  origin: RoutePoint,
  destination: RoutePoint,
  boardingStop: BusStop,
  alightingStop: BusStop,
  segments: BusJourneySegment[],
): BusJourneyPlan {
  const walkingDistanceM = Math.round(
    distanceMeters(origin, boardingStop) + distanceMeters(alightingStop, destination),
  );
  const busDistanceM = Math.round(segments.reduce((sum, segment) => sum + pathDistance(segment.stops), 0));
  const stopCount = segments.reduce((sum, segment) => sum + segment.stopCount, 0);
  return {
    boardingStop,
    alightingStop,
    segments,
    transferCount: Math.max(0, segments.length - 1),
    walkingDistanceM,
    busDistanceM,
    estimatedMinutes: Math.max(1, Math.round(walkingDistanceM / 75 + stopCount * 2)),
  };
}

/**
 * 가까운 정류장을 기준으로 직행을 먼저 찾고, 없으면 1회 환승 경로를 찾는다.
 * TAGO는 완성형 대중교통 길찾기 API가 아니므로 호출량과 오류 가능성을 줄이기 위해
 * 승·하차 후보를 각 4곳, 환승 노선을 각 6개로 제한한다.
 */
export async function planBusJourney(
  origin: RoutePoint,
  destination: RoutePoint,
  disasters: DisasterZone[] = [],
): Promise<BusJourneyPlan> {
  const [rawOriginStops, rawDestinationStops] = await Promise.all([
    getNearbyBusStops({ ...origin, limit: 8 }),
    getNearbyBusStops({ ...destination, limit: 8 }),
  ]);
  const originStops = rawOriginStops.sort((left, right) => distanceMeters(origin, left) - distanceMeters(origin, right));
  const destinationStops = rawDestinationStops.sort((left, right) => distanceMeters(destination, left) - distanceMeters(destination, right));
  if (!originStops.length || !destinationStops.length) {
    throw new Error('출발지 또는 목적지 주변에서 버스정류장을 찾지 못했습니다.');
  }

  const [starts, ends] = await Promise.all([
    stopsWithRoutes(originStops),
    stopsWithRoutes(destinationStops),
  ]);
  const routeCache = new Map<string, Promise<BusRouteStop[]>>();
  const routeStops = (cityCode: number, routeId: string) => {
    const key = `${cityCode}:${routeId}`;
    if (!routeCache.has(key)) routeCache.set(key, getStopsOnRoute({ cityCode, routeId }));
    return routeCache.get(key)!;
  };

  const directPlans: BusJourneyPlan[] = [];
  for (const start of starts) {
    for (const end of ends) {
      if (start.cityCode !== end.cityCode) continue;
      const endRouteIds = new Set(end.routes.map((route) => route.routeId));
      for (const route of start.routes.filter((item) => endRouteIds.has(item.routeId)).slice(0, 8)) {
        const segment = makeSegment(
          route,
          start.cityCode,
          await routeStops(start.cityCode, route.routeId),
          start.stop.nodeId,
          end.stop.nodeId,
        );
        if (segment && !crossesDisaster(segment.stops, disasters)) {
          directPlans.push(completePlan(origin, destination, start.stop, end.stop, [segment]));
        }
      }
    }
  }
  if (directPlans.length) {
    return addArrival(directPlans.sort((left, right) => scorePlan(left) - scorePlan(right))[0]);
  }

  const transferPlans: BusJourneyPlan[] = [];
  for (const start of starts.slice(0, 3)) {
    for (const end of ends.slice(0, 3)) {
      if (start.cityCode !== end.cityCode) continue;
      const startRoutes = start.routes.slice(0, 6);
      const endRoutes = end.routes.slice(0, 6);
      const [startSequences, endSequences] = await Promise.all([
        Promise.all(startRoutes.map(async (route) => ({ route, stops: await routeStops(start.cityCode, route.routeId) }))),
        Promise.all(endRoutes.map(async (route) => ({ route, stops: await routeStops(end.cityCode, route.routeId) }))),
      ]);
      for (const first of startSequences) {
        const boardIndex = first.stops.findIndex((stop) => stop.nodeId === start.stop.nodeId);
        if (boardIndex < 0) continue;
        for (const second of endSequences) {
          const alightIndex = second.stops.findIndex((stop) => stop.nodeId === end.stop.nodeId);
          if (alightIndex < 1) continue;
          const secondBeforeDestination = new Map(
            second.stops.slice(0, alightIndex).map((stop) => [stop.nodeId, stop]),
          );
          const transfer = first.stops
            .slice(boardIndex + 1)
            .find((stop) => secondBeforeDestination.has(stop.nodeId));
          if (!transfer) continue;
          const firstSegment = makeSegment(first.route, start.cityCode, first.stops, start.stop.nodeId, transfer.nodeId);
          const secondSegment = makeSegment(second.route, end.cityCode, second.stops, transfer.nodeId, end.stop.nodeId);
          if (firstSegment && secondSegment
            && !crossesDisaster(firstSegment.stops, disasters)
            && !crossesDisaster(secondSegment.stops, disasters)) {
            transferPlans.push(completePlan(origin, destination, start.stop, end.stop, [firstSegment, secondSegment]));
          }
        }
      }
    }
  }
  if (!transferPlans.length) {
    throw new Error(disasters.length
      ? '재난·통제 구간을 피하는 버스 경로를 찾지 못했습니다. 다른 목적지나 도보 경로를 확인해 주세요.'
      : '직행 또는 1회 환승 버스 경로를 찾지 못했습니다. 도보 경로를 이용해 주세요.');
  }
  return addArrival(transferPlans.sort((left, right) => scorePlan(left) - scorePlan(right))[0]);
}
