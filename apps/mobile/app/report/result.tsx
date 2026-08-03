import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useReportSubmission } from '@/src/features/report/useReportSubmission';

export default function ReportResultScreen() {
  const router = useRouter();
  const { uri, lat, lng } = useLocalSearchParams<{ uri: string; lat: string; lng: string }>();
  const { state, submit } = useReportSubmission();

  const handleSubmit = () => {
    void submit({ photoUri: uri, latitude: Number(lat), longitude: Number(lng) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Image source={{ uri }} style={styles.image} />

      {state.status === 'idle' && <PrimaryButton label="신고 전송" onPress={handleSubmit} style={styles.actionButton} />}

      {state.status === 'submitting' && (
        <PrimaryButton label="전송 중" onPress={() => {}} loading style={styles.actionButton} />
      )}

      {state.status === 'success' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>신고가 접수되었습니다</Text>
          {state.result.hazard_type && <Text style={styles.resultBody}>위험 유형: {state.result.hazard_type}</Text>}
          <Text style={styles.resultBody}>
            상태: {state.result.status === 'verified' ? '즉시 반영됨' : '확인 대기 중'}
          </Text>
          <PrimaryButton label="홈으로" onPress={() => router.replace('/')} style={styles.actionButton} />
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.resultBox}>
          <Text style={styles.error}>{state.message}</Text>
          <PrimaryButton label="다시 시도" onPress={handleSubmit} style={styles.actionButton} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  image: { width: '100%', height: 320, borderRadius: 20, marginTop: 18, backgroundColor: '#E7EFEB' },
  actionButton: { marginTop: 20 },
  resultBox: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#DCE7E2',
  },
  resultTitle: { color: '#14251F', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  resultBody: { color: '#596A64', fontSize: 14, lineHeight: 21 },
  error: { color: '#B42318', fontSize: 14, lineHeight: 21 },
});
