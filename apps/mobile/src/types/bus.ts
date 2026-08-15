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

export type LiveBus = {
  vehicleNo: string;
  routeId: string;
  routeNo: string;
  latitude: number;
  longitude: number;
  /** 버스가 향하고 있는(직전 통과) 정류소 이름 */
  nodeName?: string;
  nodeOrder?: number;
};
