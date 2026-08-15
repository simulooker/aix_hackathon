import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAuthStore } from '@/src/stores/auth-store';

export default function ReportCameraScreen() {
  const router = useRouter();
  const username = useAuthStore((state) => state.username);
  const authInitialized = useAuthStore((state) => state.initialized);
  const [imageUri, setImageUri] = useState<string>();
  const [reportLocation, setReportLocation] = useState<{ latitude: number; longitude: number }>();
  const [locationSource, setLocationSource] = useState<'camera' | 'photo'>();

  useEffect(() => {
    if (!authInitialized || username) return;
    Alert.alert('로그인이 필요합니다', '위험사진 제보는 로그인한 사용자만 이용할 수 있습니다.', [
      { text: '확인', onPress: () => router.replace('/login' as Href) },
    ]);
  }, [authInitialized, router, username]);

  const rationalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return undefined;
    const [numerator, denominator] = value.trim().split('/').map(Number);
    const result = denominator ? numerator / denominator : numerator;
    return Number.isFinite(result) ? result : undefined;
  };

  const coordinateFromExif = (value: unknown, ref: unknown): number | undefined => {
    if (typeof value === 'number') {
      return ref === 'S' || ref === 'W' ? -Math.abs(value) : value;
    }
    const parts = Array.isArray(value)
      ? value.map(rationalNumber)
      : typeof value === 'string'
        ? value.split(',').map(rationalNumber)
        : [];
    if (parts.length < 3 || parts.some((part) => part == null)) return undefined;
    const decimal = Number(parts[0]) + Number(parts[1]) / 60 + Number(parts[2]) / 3600;
    return ref === 'S' || ref === 'W' ? -decimal : decimal;
  };

  const locationFromExif = (exif: Record<string, unknown> | null | undefined) => {
    if (!exif) return undefined;
    const latitude = coordinateFromExif(exif.GPSLatitude ?? exif.Latitude, exif.GPSLatitudeRef);
    const longitude = coordinateFromExif(exif.GPSLongitude ?? exif.Longitude, exif.GPSLongitudeRef);
    if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
    return { latitude, longitude };
  };

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
    if (!result.canceled) {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setImageUri(result.assets[0].uri);
      setReportLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      setLocationSource('camera');
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      const photoLocation = locationFromExif(asset.exif as Record<string, unknown> | null | undefined);
      setImageUri(asset.uri);
      setReportLocation(photoLocation);
      setLocationSource(photoLocation ? 'photo' : undefined);
      if (!photoLocation) {
        Alert.alert(
          '사진 위치를 확인할 수 없습니다',
          '이 사진에는 촬영 위치 정보가 없습니다. 카카오톡으로 받은 사진, 캡처 또는 편집한 사진은 위치 정보가 제거될 수 있습니다. 위치가 기록된 원본 사진을 선택하거나 카메라로 새로 촬영해 주세요.',
        );
      }
    }
  };

  const [locating, setLocating] = useState(false);

  const analyze = async () => {
    if (!imageUri) return;
    if (!username) {
      Alert.alert('로그인이 필요합니다', '로그인 후 위험사진을 제보해 주세요.');
      return;
    }
    if (!reportLocation) {
      Alert.alert('제보 위치 필요', '촬영 위치가 포함된 원본 사진을 선택하거나 카메라로 새로 촬영해 주세요.');
      return;
    }
    setLocating(true);
    try {
      router.push({ pathname: '/report/result', params: {
        uri: imageUri,
        latitude: String(reportLocation.latitude),
        longitude: String(reportLocation.longitude),
      } } as unknown as Href);
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>위험사진 제보</Text>
      <Text style={styles.description}>보행을 방해하는 장애물이나 위험 구간이 잘 보이도록 사진을 촬영해 주세요.</Text>
      <View style={styles.preview}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <Text style={styles.placeholder}>선택한 사진이 없습니다.</Text>}
      </View>
      {imageUri && (
        <View style={[styles.locationStatus, !reportLocation && styles.locationWarning]}>
          <Text style={[styles.locationText, !reportLocation && styles.locationWarningText]}>
            {locationSource === 'camera' && '촬영 당시 휴대폰 위치를 제보 위치로 사용합니다.'}
            {locationSource === 'photo' && '사진에 저장된 촬영 위치를 제보 위치로 사용합니다.'}
            {!locationSource && '사진에 촬영 위치 정보가 없어 제보할 수 없습니다.'}
          </Text>
        </View>
      )}
      <PrimaryButton label="카메라로 촬영" onPress={() => void takePhoto()} />
      <PrimaryButton label="앨범에서 선택" variant="dark" onPress={() => void choosePhoto()} style={styles.button} />
      <PrimaryButton label="사진 분석 및 제보" onPress={() => void analyze()} loading={locating} disabled={!imageUri || !reportLocation} style={styles.button} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { color: '#14251F', fontSize: 28, fontWeight: '800', marginTop: 18 },
  description: { color: '#596A64', fontSize: 15, lineHeight: 23, marginTop: 10 },
  preview: { height: 280, backgroundColor: '#E7EFEB', borderRadius: 20, marginVertical: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { color: '#71817B' },
  locationStatus: { marginTop: -12, marginBottom: 12, padding: 11, borderRadius: 12, backgroundColor: '#E9F5F0' },
  locationWarning: { backgroundColor: '#FFF4E5' },
  locationText: { color: '#167C5A', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  locationWarningText: { color: '#9A6700' },
  button: { marginTop: 12 },
});
