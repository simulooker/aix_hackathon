import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#F7FAF8' }, headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '로그인' }} />
        <Stack.Screen name="register" options={{ title: '회원가입' }} />
        <Stack.Screen name="map" options={{ title: '지도' }} />
        <Stack.Screen name="report/camera" options={{ title: '보행환경 분석' }} />
        <Stack.Screen name="report/result" options={{ title: 'AI 분석 결과' }} />
        <Stack.Screen name="navigation/[routeId]" options={{ title: '안전길 안내' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
