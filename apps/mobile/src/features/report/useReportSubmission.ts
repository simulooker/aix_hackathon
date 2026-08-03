import { useState } from 'react';

import { submitReport } from '@/src/services/api';
import type { ReportResponse } from '@/src/types/hazard';

export type ReportSubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: ReportResponse }
  | { status: 'error'; message: string };

export function useReportSubmission() {
  const [state, setState] = useState<ReportSubmissionState>({ status: 'idle' });

  const submit = async (params: { photoUri: string; latitude: number; longitude: number }) => {
    setState({ status: 'submitting' });
    try {
      const result = await submitReport(params);
      setState({ status: 'success', result });
      return result;
    } catch {
      setState({ status: 'error', message: '신고 전송에 실패했습니다. 다시 시도해주세요.' });
      return undefined;
    }
  };

  const reset = () => setState({ status: 'idle' });

  return { state, submit, reset };
}
