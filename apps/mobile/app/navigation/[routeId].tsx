import * as Speech from 'expo-speech';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';

export default function NavigationScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>경로 {routeId}</Text>
      <Text style={styles.body}>
        경로 계산 API가 연결되면 지도 경로와 단계별 안내가 이 화면에 표시됩니다.
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => Speech.speak('안심길 안내를 시작합니다.', { language: 'ko-KR' })}>
        <Text style={styles.buttonText}>음성 안내 시험</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#14251F', marginTop: 20 },
  body: { color: '#596A64', fontSize: 16, lineHeight: 24, marginTop: 12 },
  button: { marginTop: 24, padding: 16, alignItems: 'center', borderRadius: 14, backgroundColor: '#167C5A' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
