const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export const env = {
  apiUrl: apiUrl ?? 'http://localhost:8000',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};
