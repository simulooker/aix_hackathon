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
