export type BusStop = {
  nodeId: string;
  name: string;
  latitude: number;
  longitude: number;
  cityCode?: number;
};

export type BusRouteSummary = {
  routeId: string;
  routeNo: string;
  routeType?: string;
  startNodeName?: string;
  endNodeName?: string;
};

export type BusRouteStop = BusStop & {
  order: number;
};

export type BusArrival = {
  routeId: string;
  routeNo: string;
  arrivalMinutes?: number;
  remainingStops?: number;
};

export type BusJourneySegment = {
  routeId: string;
  routeNo: string;
  cityCode: number;
  fromStop: BusRouteStop;
  toStop: BusRouteStop;
  stops: BusRouteStop[];
  stopCount: number;
  arrivalMinutes?: number;
};

export type BusJourneyPlan = {
  boardingStop: BusStop;
  alightingStop: BusStop;
  segments: BusJourneySegment[];
  transferCount: number;
  walkingDistanceM: number;
  busDistanceM: number;
  estimatedMinutes: number;
};
