import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
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

  const openAnalysis = (uri: string, location: { latitude: number; longitude: number }) => {
    router.push({ pathname: '/report/result', params: {
      uri,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    } } as unknown as Href);
  };

  useEffect(() => {
    if (!authInitialized || username) return;
    Alert.alert('로그인이 필요합니다', '위험사진 제보는 로그인한 사용자만 이용할 수 있습니다.', [
      { text: '확인', onPress: () => router.replace('/login' as Href) },
    ]);
  }, [authInitialized, router, username]);

  const rationalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object') {
      const rational = value as { numerator?: unknown; denominator?: unknown };
      const numerator = Number(rational.numerator);
      const denominator = Number(rational.denominator);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    if (typeof value !== 'string') return undefined;
    const decimal = Number(value.trim());
    if (Number.isFinite(decimal) && !value.includes('/')) return decimal;
    const [numerator, denominator] = value.trim().split('/').map(Number);
    const result = denominator ? numerator / denominator : numerator;
    return Number.isFinite(result) ? result : undefined;
  };

  const coordinateFromExif = (value: unknown, ref: unknown): number | undefined => {
    const normalizedRef = typeof ref === 'string' ? ref.toUpperCase() : ref;
    if (typeof value === 'number') {
      return normalizedRef === 'S' || normalizedRef === 'W' ? -Math.abs(value) : value;
    }
    const parts = Array.isArray(value)
      ? value.map(rationalNumber)
      : typeof value === 'string'
        ? value.split(',').map(rationalNumber)
        : [];
    if (parts.length < 3 || parts.some((part) => part == null)) return undefined;
    const decimal = Number(parts[0]) + Number(parts[1]) / 60 + Number(parts[2]) / 3600;
    return normalizedRef === 'S' || normalizedRef === 'W' ? -decimal : decimal;
  };

  const validLocation = (latitude: number | undefined, longitude: number | undefined) => {
    if (latitude == null || longitude == null) return undefined;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
    if (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001) return undefined;
    return { latitude, longitude };
  };

  const locationFromExif = (exif: Record<string, unknown> | null | undefined) => {
    if (!exif) return undefined;
    const latitude = coordinateFromExif(exif.GPSLatitude ?? exif.Latitude, exif.GPSLatitudeRef);
    const longitude = coordinateFromExif(exif.GPSLongitude ?? exif.Longitude, exif.GPSLongitudeRef);
    return validLocation(latitude, longitude);
  };

  const locationFromMediaLibrary = async (assetId: string | null | undefined) => {
    if (!assetId) return undefined;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) return undefined;
      const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: true });
      return validLocation(info.location?.latitude, info.location?.longitude);
    } catch {
      return undefined;
    }
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
      setLocating(true);
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const reportCoordinates = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        openAnalysis(result.assets[0].uri, reportCoordinates);
      } catch {
        Alert.alert('위치를 확인할 수 없습니다', '현재 위치를 확인한 뒤 다시 촬영해 주세요.');
      } finally {
        setLocating(false);
      }
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: true });
    if (!result.canceled) {
      setLocating(true);
      const asset = result.assets[0];
      const exifLocation = locationFromExif(asset.exif as Record<string, unknown> | null | undefined);
      const photoLocation = exifLocation ?? await locationFromMediaLibrary(asset.assetId);
      setLocating(false);
      if (!photoLocation) {
        Alert.alert('제보할 수 없습니다', '위치데이터가 없는 사진은 제보가 불가능합니다.');
        return;
      }
      openAnalysis(asset.uri, photoLocation);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>위험사진 제보</Text>
      <Text style={styles.description}>보행을 방해하는 장애물이나 위험 구간이 잘 보이도록 사진을 촬영해 주세요.</Text>
      <Text style={styles.notice}>촬영한 사진은 현재 위치를 사용해 바로 분석합니다. 앨범 사진은 촬영 위치데이터가 있는 원본 사진만 제보할 수 있습니다.</Text>
      <PrimaryButton label="카메라로 촬영" onPress={() => void takePhoto()} disabled={locating} style={styles.firstButton} />
      <PrimaryButton label="앨범에서 선택" variant="dark" onPress={() => void choosePhoto()} loading={locating} style={styles.button} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { color: '#14251F', fontSize: 28, fontWeight: '800', marginTop: 18 },
  description: { color: '#596A64', fontSize: 15, lineHeight: 23, marginTop: 10 },
  notice: { marginTop: 28, marginBottom: 24, padding: 16, borderRadius: 14, color: '#40534C', backgroundColor: '#E9F5F0', fontSize: 13, lineHeight: 20 },
  firstButton: { marginTop: 8 },
  button: { marginTop: 12 },
});
