import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/src/constants/env';

// 모바일 앱은 anon 키만 사용합니다. service_role 키와 AI 모델은 FastAPI 서버 전용입니다.
// URL/키가 아직 설정되지 않은 로컬 개발 환경에서도 앱이 죽지 않도록 null을 허용합니다.
export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseAnonKey ? createClient(env.supabaseUrl, env.supabaseAnonKey) : null;
