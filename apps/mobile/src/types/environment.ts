export type WeatherAlert = {
  level: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
};

export type WeatherContext = {
  temperature_c?: number;
  apparent_temperature_c?: number;
  precipitation_mm: number;
  weather_code?: number;
  alerts: WeatherAlert[];
  source: string;
};

export type DisasterZone = {
  id: string;
  kind: 'flood' | 'landslide' | 'road_control' | 'other';
  title: string;
  description: string;
  road_name?: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  severity: number;
};

export type EnvironmentContext = {
  weather?: WeatherContext;
  disasters: DisasterZone[];
  disaster_feed_configured: boolean;
};
