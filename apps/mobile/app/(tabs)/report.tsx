import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { submitReport } from '@/src/services/api';
import { useLocationStore } from '@/src/stores/location-store';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; hazardType: string | null; reportStatus: string }
  | { status: 'error'; message: string };

export default function ReportScreen() {
  const [imageUri, setImageUri] = useState<string>();
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const { coordinates, requestCurrentLocation } = useLocationStore();

  useEffect(() => {
    if (!coordinates) void requestCurrentLocation();
  }, [coordinates, requestCurrentLocation]);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setSubmitState({ status: 'idle' });
    }
  };

  const submit = async () => {
    if (!imageUri || !coordinates) return;
    setSubmitState({ status: 'submitting' });
    try {
      const response = await submitReport({
        photoUri: imageUri,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      setSubmitState({
        status: 'success',
        hazardType: response.hazard_type,
        reportStatus: response.status,
      });
      setImageUri(undefined);
    } catch {
      setSubmitState({ status: 'error', message: '신고 전송에 실패했습니다. 다시 시도해주세요.' });
    }
  };

  const canSubmit = Boolean(imageUri) && Boolean(coordinates) && submitState.status !== 'submitting';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>위험 요소 신고</Text>
      <Text style={styles.description}>
        파손된 보도, 장애물, 어두운 구간 등 보행에 위험한 장소를 촬영해주세요.
      </Text>

      <View style={styles.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={styles.placeholder}>선택된 사진이 없습니다.</Text>
        )}
      </View>

      {!coordinates && (
        <Text style={styles.warning}>현재 위치를 확인하는 중입니다. 위치 권한을 허용해주세요.</Text>
      )}

      <Pressable style={styles.primaryButton} onPress={() => void takePhoto()}>
        <Text style={styles.primaryButtonText}>카메라로 촬영하기</Text>
      </Pressable>
      <Pressable
        style={[styles.submitButton, !canSubmit && styles.disabledButton]}
        disabled={!canSubmit}
        onPress={() => void submit()}>
        {submitState.status === 'submitting' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>신고 전송</Text>
        )}
      </Pressable>

      {submitState.status === 'success' && (
        <Text style={styles.successText}>
          신고가 접수되었습니다{submitState.hazardType ? ` (${submitState.hazardType})` : ''}. 상태:{' '}
          {submitState.reportStatus === 'verified' ? '즉시 반영됨' : '확인 대기 중'}
        </Text>
      )}
      {submitState.status === 'error' && <Text style={styles.error}>{submitState.message}</Text>}

      <Text style={styles.hint}>사진·현재 위치를 AI가 분석해 위험도를 판정하고 지도와 경로에 반영합니다.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { color: '#14251F', fontSize: 28, fontWeight: '800', marginTop: 18 },
  description: { color: '#596A64', fontSize: 15, lineHeight: 23, marginTop: 10 },
  preview: {
    height: 280,
    backgroundColor: '#E7EFEB',
    borderRadius: 20,
    marginVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { color: '#71817B' },
  warning: { color: '#8A6D00', fontSize: 13, marginBottom: 12 },
  primaryButton: { backgroundColor: '#167C5A', borderRadius: 14, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  submitButton: { backgroundColor: '#14251F', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.35 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '800' },
  successText: { color: '#167C5A', fontSize: 14, lineHeight: 20, marginTop: 14, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, lineHeight: 20, marginTop: 14, fontWeight: '700' },
  hint: { color: '#71817B', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
});
