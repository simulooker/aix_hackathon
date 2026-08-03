import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>AI SAFE ROUTE</Text>
        <Text style={styles.title}>더 안전한 길을{'\n'}함께 만들어요</Text>
        <Text style={styles.description}>
          현재 위치를 확인하고, 보행 중 발견한 위험 요소를 사진으로 알려주세요.
        </Text>
      </View>

      <View style={styles.cards}>
        <Pressable style={[styles.card, styles.primaryCard]} onPress={() => router.push('/map')}>
          <Text style={styles.primaryTitle}>내 주변 지도 보기</Text>
          <Text style={styles.primaryBody}>현재 위치와 주변 위험 정보를 확인합니다.</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => router.push('/report/camera')}>
          <Text style={styles.cardTitle}>위험 요소 신고하기</Text>
          <Text style={styles.cardBody}>사진과 위치를 이용해 빠르게 제보합니다.</Text>
        </Pressable>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>개발 안내</Text>
        <Text style={styles.noticeBody}>
          신고 접수는 서버와 연결되어 있습니다. 주변 위험 지도와 실제 경로 계산은 백엔드
          작업이 끝나는 대로 자동으로 채워집니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  hero: { marginTop: 24, marginBottom: 28 },
  eyebrow: { color: '#167C5A', fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: '#14251F', fontSize: 36, fontWeight: '800', lineHeight: 45 },
  description: { color: '#53645E', fontSize: 16, lineHeight: 24, marginTop: 14 },
  cards: { gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#DCE7E2' },
  primaryCard: { backgroundColor: '#167C5A', borderColor: '#167C5A' },
  primaryTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  primaryBody: { color: '#D9F3E8', fontSize: 14, lineHeight: 21, marginTop: 8 },
  cardTitle: { color: '#14251F', fontSize: 19, fontWeight: '800' },
  cardBody: { color: '#60716B', fontSize: 14, lineHeight: 21, marginTop: 8 },
  notice: { marginTop: 'auto', backgroundColor: '#E9F5F0', borderRadius: 16, padding: 18 },
  noticeTitle: { color: '#155D45', fontWeight: '800', marginBottom: 6 },
  noticeBody: { color: '#426258', lineHeight: 20 },
});
