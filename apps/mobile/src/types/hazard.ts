export type HazardStatus = 'pending' | 'verified' | 'rejected' | 'resolved';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export type HazardReport = {
  id: string;
  latitude: number;
  longitude: number;
  hazard_type: string | null;
  confidence: number | null;
  severity: number | null;
  status: HazardStatus;
  created_at: string;
};

export type ReportResponse = {
  report_id: string;
  status: HazardStatus;
  filename: string | null;
  latitude: number;
  longitude: number;
  hazard_type?: string | null;
  confidence?: number | null;
  severity?: number | null;
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
