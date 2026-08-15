import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useAuthStore } from '@/src/stores/auth-store';
import { usePreferencesStore } from '@/src/stores/preferences-store';

export default function RootLayout() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializePreferences = usePreferencesStore((state) => state.initialize);
  useEffect(() => { void initializeAuth(); }, [initializeAuth]);
  useEffect(() => { void initializePreferences(); }, [initializePreferences]);
  return (
    <>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#F7FAF8' }, headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '로그인' }} />
        <Stack.Screen name="register" options={{ title: '회원가입' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
        <Stack.Screen name="my-page" options={{ title: '마이페이지' }} />
        <Stack.Screen name="report/camera" options={{ title: '위험사진 제보' }} />
        <Stack.Screen name="report/result" options={{ title: 'AI 분석 결과' }} />
        <Stack.Screen name="navigation/[routeId]" options={{ title: '안전 경로 안내' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
