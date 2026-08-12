import { useCallback, useState } from 'react';

import { analyzePhoto } from '@/src/services/api';
import type { AIAnalysisResponse } from '@/src/types/hazard';

export type ReportSubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: AIAnalysisResponse }
  | { status: 'error'; message: string };

export function useReportSubmission() {
  const [state, setState] = useState<ReportSubmissionState>({ status: 'idle' });
  const submit = useCallback(async (photoUri: string) => {
    setState({ status: 'submitting' });
    try {
      const result = await analyzePhoto(photoUri);
      setState({ status: 'success', result });
      return result;
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : '분석에 실패했습니다.' });
      return undefined;
    }
  }, []);
  return { state, submit, reset: () => setState({ status: 'idle' }) };
}
