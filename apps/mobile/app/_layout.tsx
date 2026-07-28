import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="navigation/[routeId]" options={{ title: '안심길 안내' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
