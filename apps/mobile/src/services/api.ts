import { env } from '@/src/config/env';

export type HealthResponse = {
  status: string;
  environment: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${env.apiUrl}/health`);
  if (!response.ok) throw new Error('서버 상태를 확인할 수 없습니다.');
  return response.json();
}
