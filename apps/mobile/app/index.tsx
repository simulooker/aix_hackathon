import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topRow}>
        <Image source={require('../assets/images/ai-safe-route-logo.png')} style={styles.logo} />
        <Pressable onPress={() => router.push('/login' as Href)}><Text style={styles.login}>로그인</Text></Pressable>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>AI SAFE ROUTE</Text>
        <Text style={styles.title}>더 안전한 길을{`\n`}함께 만들어요</Text>
        <Text style={styles.description}>현재 위치 주변의 위험요소를 확인하고, 보행로 사진을 AI로 분석해 보세요.</Text>
      </View>
      <View style={styles.cards}>
        <Pressable style={[styles.card, styles.primaryCard]} onPress={() => router.push('/map' as Href)}>
          <Text style={styles.primaryTitle}>주변 지도 보기</Text>
          <Text style={styles.primaryBody}>현재 위치와 주변 위험정보를 확인합니다.</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => router.push('/report/camera' as Href)}>
          <Text style={styles.cardTitle}>보행환경 AI 분석</Text>
          <Text style={styles.cardBody}>사진을 촬영해 보행로와 장애물 위험도를 확인합니다.</Text>
        </Pressable>
      </View>
      <View style={styles.notice}><Text style={styles.noticeTitle}>개발 버전 안내</Text><Text style={styles.noticeBody}>AI 모델과 서버 주소를 설정하면 실제 분석 결과가 표시됩니다.</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  topRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 54, height: 54, resizeMode: 'contain' },
  login: { color: '#167C5A', fontWeight: '800', padding: 10 },
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
