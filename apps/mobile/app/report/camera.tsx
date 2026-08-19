import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAuthStore } from '@/src/stores/auth-store';

export default function ReportCameraScreen() {
  const router = useRouter();
  const username = useAuthStore((state) => state.username);
  const authInitialized = useAuthStore((state) => state.initialized);
  const [locating, setLocating] = useState(false);

  const openAnalysis = (
    uri: string,
    location: { latitude: number; longitude: number },
    heading: { degrees?: number; accuracy?: number },
  ) => {
    router.push({
      pathname: '/report/result',
      params: {
        uri,
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        ...(heading.degrees == null ? {} : { heading: String(heading.degrees) }),
        ...(heading.accuracy == null
          ? {}
          : { headingAccuracy: String(heading.accuracy) }),
      },
    } as unknown as Href);
  };

  useEffect(() => {
    if (!authInitialized || username) return;
    Alert.alert('로그인이 필요합니다', '위험사진 제보는 로그인한 사용자만 이용할 수 있습니다.', [
      { text: '확인', onPress: () => router.replace('/login' as Href) },
    ]);
  }, [authInitialized, router, username]);

  const takePhoto = async () => {
    const [cameraPermission, locationPermission] = await Promise.all([
      ImagePicker.requestCameraPermissionsAsync(),
      Location.requestForegroundPermissionsAsync(),
    ]);

    if (!cameraPermission.granted) {
      Alert.alert('카메라 권한 필요', '위험사진을 촬영하려면 카메라 권한을 허용해 주세요.');
      return;
    }
    if (!locationPermission.granted) {
      Alert.alert('위치 권한 필요', '사진을 촬영한 위치를 제보하려면 위치 권한을 허용해 주세요.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    setLocating(true);
    try {
      const [location, heading] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        Location.getHeadingAsync().catch(() => null),
      ]);
      const headingDegrees = heading
        ? heading.trueHeading >= 0
          ? heading.trueHeading
          : heading.magHeading
        : undefined;
      openAnalysis(result.assets[0].uri, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }, {
        degrees: headingDegrees,
        accuracy: heading?.accuracy,
      });
    } catch {
      Alert.alert('위치를 확인할 수 없습니다', '현재 위치를 확인한 뒤 다시 촬영해 주세요.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>위험사진 제보</Text>
      <Text style={styles.description}>
        보행을 방해하는 장애물이나 위험 구간이 잘 보이도록 현장에서 사진을 촬영해 주세요.
      </Text>
      <Text style={styles.notice}>
        촬영 직후의 현재 위치와 촬영 방향이 함께 저장됩니다. 정확한 제보를 위해 위험 장소에서 직접 촬영해 주세요.
      </Text>
      <PrimaryButton
        label="카메라로 촬영"
        onPress={() => void takePhoto()}
        loading={locating}
        disabled={!authInitialized || !username}
        style={styles.firstButton}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { color: '#14251F', fontSize: 28, fontWeight: '800', marginTop: 18 },
  description: { color: '#596A64', fontSize: 15, lineHeight: 23, marginTop: 10 },
  notice: {
    marginTop: 28,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    color: '#40534C',
    backgroundColor: '#E9F5F0',
    fontSize: 13,
    lineHeight: 20,
  },
  firstButton: { marginTop: 8 },
});
