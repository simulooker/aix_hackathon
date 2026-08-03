import { Circle } from 'react-native-maps';

import { severityColor } from '@/src/features/map/severity';
import type { HazardReport } from '@/src/types/hazard';

export function HazardMarker({ hazard }: { hazard: HazardReport }) {
  const color = severityColor(hazard);
  return (
    <Circle
      center={{ latitude: hazard.latitude, longitude: hazard.longitude }}
      radius={18}
      strokeColor={color}
      fillColor={`${color}55`}
    />
  );
}
