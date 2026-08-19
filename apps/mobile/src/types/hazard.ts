export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export type HazardReport = {
  id: string;
  latitude: number;
  longitude: number;
  heading_deg: number | null;
  heading_accuracy: number | null;
  hazard_type: string | null;
  confidence: number | null;
  severity: number | null;
  is_active: boolean;
  created_at: string;
  photo_path?: string | null;
};

export type ReportResponse = {
  report_id: string | null;
  is_active: boolean;
  filename: string | null;
  latitude: number;
  longitude: number;
  heading_deg?: number | null;
  heading_accuracy?: number | null;
  hazard_type?: string | null;
  confidence?: number | null;
  severity?: number | null;
  overall_risk: RiskLevel;
  model_ready: boolean;
  walkway_detected: boolean;
  obstacles_detected: number;
  obstacles_on_walkway: number;
  detections: AIDetection[];
};

export type AIDetection = {
  label: string;
  confidence: number;
  box: [number, number, number, number];
  blocked_walkway_ratio: number;
  remaining_walkway_image_ratio: number;
  on_walkway: boolean;
  risk: RiskLevel;
};

export type AIAnalysisResponse = {
  filename: string | null;
  model_ready: boolean;
  walkway_detected: boolean;
  overall_risk: RiskLevel;
  obstacles_detected: number;
  obstacles_on_walkway: number;
  detections: AIDetection[];
};
