import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ReportScreen() {
  const [imageUri, setImageUri] = useState<string>();

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

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

      <Pressable style={styles.primaryButton} onPress={() => void takePhoto()}>
        <Text style={styles.primaryButtonText}>카메라로 촬영하기</Text>
      </Pressable>
      <Pressable
        style={[styles.submitButton, !imageUri && styles.disabledButton]}
        disabled={!imageUri}>
        <Text style={styles.submitButtonText}>신고 전송 준비</Text>
      </Pressable>
      <Text style={styles.hint}>서버 연결 후 사진·현재 위치·AI 판별 결과가 함께 저장됩니다.</Text>
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
  primaryButton: { backgroundColor: '#167C5A', borderRadius: 14, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  submitButton: { backgroundColor: '#14251F', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.35 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '800' },
  hint: { color: '#71817B', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
});
