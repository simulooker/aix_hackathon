export type HazardStatus = 'pending' | 'verified' | 'rejected' | 'resolved';

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
  hazard_type: string | null;
  confidence: number | null;
  severity: number | null;
};
