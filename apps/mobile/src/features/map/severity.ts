import type { HazardReport } from '@/src/types/hazard';

// S_i(0~1) 기반 위험도 색상 매핑. route_service.py의 severity 스케일과 맞춥니다.
export function severityColor(hazard: HazardReport): string {
  const severity = hazard.severity ?? 0;
  if (severity >= 0.7) return '#D92D20';
  if (severity >= 0.4) return '#F79009';
  return '#EAAA08';
}
