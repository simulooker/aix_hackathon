import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#F7FAF8' },
          headerTitleStyle: { fontWeight: '700' },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: '지도' }} />
        <Stack.Screen name="report/camera" options={{ title: '위험 신고' }} />
        <Stack.Screen name="report/result" options={{ title: '신고 결과' }} />
        <Stack.Screen name="navigation/[routeId]" options={{ title: '안심길 안내' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
