import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';

export default function ReportCameraScreen() {
  const router = useRouter();
  const { coordinates, loading: locationLoading } = useCurrentLocation();
  const [imageUri, setImageUri] = useState<string>();

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const goToResult = () => {
    if (!imageUri || !coordinates) return;
    router.push({
      pathname: '/report/result',
      params: { uri: imageUri, lat: String(coordinates.latitude), lng: String(coordinates.longitude) },
    });
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

      {locationLoading && !coordinates && (
        <Text style={styles.warning}>현재 위치를 확인하는 중입니다. 위치 권한을 허용해주세요.</Text>
      )}

      <PrimaryButton label="카메라로 촬영하기" onPress={() => void takePhoto()} />
      <PrimaryButton
        label="다음"
        variant="dark"
        onPress={goToResult}
        disabled={!imageUri || !coordinates}
        style={styles.nextButton}
      />
      <Text style={styles.hint}>다음 화면에서 사진과 위치를 함께 서버로 전송합니다.</Text>
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
  nextButton: { marginTop: 12 },
  hint: { color: '#71817B', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
});
