import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as Location from 'expo-location';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KakaoMap } from '@/src/components/KakaoMap';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { DEFAULT_REGION, ROUTE_PROFILES } from '@/src/constants/map';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';
import { getNearbyHazards } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/auth-store';
import { useRouteStore } from '@/src/stores/route-store';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint } from '@/src/types/route';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const username = useAuthStore((state) => state.username);
  const { coordinates, error, loading, refresh } = useCurrentLocation();
  const { profile, setProfile, fetchRoute, loading: routeLoading, error: routeError } = useRouteStore();
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [destination, setDestination] = useState<RoutePoint>();
  const [destinationName, setDestinationName] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();

  useEffect(() => {
    if (!coordinates) return;
    getNearbyHazards({ ...coordinates }).then(setHazards).catch(() => setHazards([]));
  }, [coordinates]);

  const chooseDestination = (point: RoutePoint, label?: string) => {
    setDestination(point);
    if (label) setDestinationName(label);
    setSearchError(undefined);
  };

  const searchDestination = async () => {
    const query = destinationName.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(undefined);
    Keyboard.dismiss();
    try {
      const results = await Location.geocodeAsync(query);
      if (!results.length) {
        setSearchError('검색 결과가 없습니다. 주소를 더 자세히 입력해 주세요.');
        return;
      }
      chooseDestination(
        { latitude: results[0].latitude, longitude: results[0].longitude },
        query,
      );
    } catch {
      setSearchError('목적지를 검색하지 못했습니다. 네트워크 연결을 확인해 주세요.');
    } finally {
      setSearching(false);
    }
  };

  const findRoute = async () => {
    if (!coordinates || !destination) return;
    const route = await fetchRoute(coordinates, destination);
    if (route?.geometry.length) {
      router.push(`/navigation/${route.route_id}` as Href);
    }
  };

  return (
    <View style={styles.container}>
      <KakaoMap
        style={styles.map}
        center={destination ?? coordinates ?? DEFAULT_REGION}
        currentLocation={coordinates}
        destination={destination}
        hazards={hazards}
        onMapPress={(point) => chooseDestination(point, '지도에서 선택한 위치')}
      />

      <SafeAreaView style={styles.topArea} pointerEvents="box-none">
        <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#52645E" />
            <TextInput
              value={destinationName}
              onChangeText={setDestinationName}
              onSubmitEditing={() => void searchDestination()}
              placeholder="목적지 또는 주소 입력"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {searching ? (
              <ActivityIndicator size="small" color="#167C5A" />
            ) : (
              <Pressable onPress={() => void searchDestination()} hitSlop={10}>
                <Ionicons name="arrow-forward-circle" size={27} color="#167C5A" />
              </Pressable>
            )}
          </View>
          <Pressable
            style={styles.accountButton}
            onPress={() => !username && router.push('/login' as Href)}>
            <Ionicons name={username ? 'person' : 'log-in-outline'} size={19} color="#FFFFFF" />
            <Text style={styles.accountText} numberOfLines={1}>{username ?? '로그인'}</Text>
          </Pressable>
        </View>
        {searchError && <Text style={styles.searchError}>{searchError}</Text>}
      </SafeAreaView>

      <View style={[styles.panel, { bottom: insets.bottom + 12 }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.title}>이용자 유형</Text>
            <Text style={styles.hint}>유형에 맞는 안전 경로를 찾아드려요.</Text>
          </View>
          <Pressable style={styles.locationButton} onPress={() => void refresh()}>
            <Ionicons name="locate" size={22} color="#167C5A" />
          </Pressable>
        </View>

        <View style={styles.profileRow}>
          {ROUTE_PROFILES.map((item) => {
            const selected = profile === item.value;
            return (
              <Pressable
                key={item.value}
                style={[styles.profileCard, selected && styles.profileCardActive]}
                onPress={() => setProfile(item.value)}>
                {item.value === 'general' ? (
                  <Ionicons name="person-outline" size={21} color={selected ? '#FFFFFF' : '#167C5A'} />
                ) : (
                  <FontAwesome5
                    name={item.value === 'elderly' ? 'blind' : 'wheelchair'}
                    size={20}
                    color={selected ? '#FFFFFF' : '#167C5A'}
                  />
                )}
                <Text style={[styles.profileLabel, selected && styles.profileLabelActive]}>{item.label}</Text>
                <Text style={[styles.profileDescription, selected && styles.profileDescriptionActive]}>{item.description}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading && <Text style={styles.info}>현재 위치를 확인하고 있습니다.</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
        {routeError && <Text style={styles.error}>{routeError}</Text>}
        <PrimaryButton
          label={destination ? '안전 경로 찾기' : '목적지를 먼저 입력해 주세요'}
          onPress={() => void findRoute()}
          disabled={!destination || !coordinates}
          loading={routeLoading}
        />
        <Pressable style={styles.reportButton} onPress={() => router.push('/report/camera' as Href)}>
          <Ionicons name="camera-outline" size={20} color="#167C5A" />
          <Text style={styles.reportText}>위험사진 제보</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E7EFEB' },
  map: { flex: 1 },
  topArea: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  searchBox: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  searchInput: { flex: 1, color: '#14251F', fontSize: 15 },
  accountButton: {
    maxWidth: 105,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    backgroundColor: '#155D45',
    borderRadius: 16,
    elevation: 5,
  },
  accountText: { color: '#FFFFFF', fontWeight: '800', maxWidth: 65 },
  searchError: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    color: '#B42318',
    backgroundColor: '#FFF3F1',
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#14251F' },
  hint: { color: '#65756F', fontSize: 12, marginTop: 3 },
  locationButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E9F5F0', alignItems: 'center', justifyContent: 'center' },
  profileRow: { flexDirection: 'row', gap: 8 },
  profileCard: { flex: 1, minHeight: 88, padding: 9, borderRadius: 14, borderWidth: 1, borderColor: '#D7E4DE', backgroundColor: '#F8FBF9' },
  profileCardActive: { backgroundColor: '#167C5A', borderColor: '#167C5A' },
  profileLabel: { color: '#263D35', fontWeight: '800', fontSize: 12.5, marginTop: 4 },
  profileLabelActive: { color: '#FFFFFF' },
  profileDescription: { color: '#70817B', fontSize: 9.5, marginTop: 2 },
  profileDescriptionActive: { color: '#D9F3E8' },
  info: { color: '#52645E', fontSize: 12 },
  error: { color: '#B42318', fontSize: 12 },
  reportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
  reportText: { color: '#167C5A', fontWeight: '800' },
});
