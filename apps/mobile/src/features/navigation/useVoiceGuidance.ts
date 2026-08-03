import { useMemo, useState } from 'react';

import { speak } from '@/src/features/speech/speak';
import type { RouteResponse } from '@/src/types/route';

import { buildSteps } from './routeSteps';

export function useVoiceGuidance(route: RouteResponse | undefined) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = useMemo(() => (route ? buildSteps(route.geometry) : []), [route]);

  const speakSummary = () => {
    if (!route) return;
    speak(
      `목적지까지 약 ${Math.round(route.distance_m)}미터. 위험 구간 ${route.hazards_avoided}곳을 피해 안내합니다.`,
    );
  };

  const speakNextStep = () => {
    const step = steps[stepIndex];
    if (!step) return;
    speak(step.instruction);
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  return { steps, stepIndex, speakSummary, speakNextStep };
}
