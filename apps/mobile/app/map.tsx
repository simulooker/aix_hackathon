import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KakaoMap, type KakaoPlace } from '@/src/components/KakaoMap';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { DEFAULT_REGION, ROUTE_PROFILES } from '@/src/constants/map';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';
import { getNearbyHazards } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/auth-store';
import { usePreferencesStore } from '@/src/stores/preferences-store';
import { useRouteStore } from '@/src/stores/route-store';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint } from '@/src/types/route';

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const username = useAuthStore((state) => state.username);
  const clearUser = useAuthStore((state) => state.clearUser);
  const showHazards = usePreferencesStore((state) => state.showHazards);
  const { coordinates, error, loading, refresh } = useCurrentLocation();
  const {
    route,
    profile,
    setProfile,
    fetchRoute,
    clearRoute,
    loading: routeLoading,
    error: routeError,
  } = useRouteStore();

  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [destination, setDestination] = useState<RoutePoint>();
  const [destinationName, setDestinationName] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchRequest, setSearchRequest] = useState<{ query: string; requestId: number }>();
  const [searchResults, setSearchResults] = useState<KakaoPlace[]>([]);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);

  // 안내 화면에서 뒤로 돌아와 메인 지도로 복귀할 때 이전 경로선 초기화
  useFocusEffect(
    useCallback(() => {
      if (clearRoute) clearRoute();
    }, [clearRoute])
  );

  useEffect(() => {
    if (!coordinates) return;
    getNearbyHazards({ ...coordinates }).then(setHazards).catch(() => setHazards([]));
  }, [coordinates]);

  const chooseDestination = (point: RoutePoint, label?: string) => {
    Keyboard.dismiss();
    setDestination(point);
    if (clearRoute) clearRoute(); // 새 목적지 선택 시 이전 경로선 즉시 삭제

    if (label && label !== '지도에서 선택한 위치') {
      setDestinationName(label);
    } else {
      setDestinationName('');
    }
    setSearchError(undefined);
    setSearchResults([]);
    setSearchRequest(undefined);
    setSearching(false);
  };

  const searchDestination = async () => {
    const query = destinationName.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(undefined);
    Keyboard.dismiss();
    setSearchResults([]);
    setSearchRequest({ query, requestId: Date.now() });
  };

  const findRoute = async () => {
    if (!coordinates || !destination) return;
    const result = await fetchRoute(coordinates, destination);
    if (result?.geometry.length) {
      router.push(`/navigation/${result.route_id}` as Href);
    }
  };

  const openAccount = () => {
    if (!username) {
      router.push('/login' as Href);
      return;
    }
    setAccountMenuVisible(true);
  };

  const logout = () => {
    Alert.alert('로그아웃', '위드유에서 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => { clearUser(); setAccountMenuVisible(false); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <KakaoMap
        style={styles.map}
        center={destination ?? coordinates ?? DEFAULT_REGION}
        currentLocation={coordinates}
        destination={destination}
        hazards={showHazards ? hazards : []}
        route={route?.geometry}
        onMapPress={(point) => chooseDestination(point, '지도에서 선택한 위치')}
        searchRequest={searchRequest}
        onSearchResults={(results) => {
          setSearching(false);
          if (searchRequest) {
            setSearchResults(results);
            if (!results.length) {
              setSearchError('검색 결과가 없습니다. 지역명이나 주소를 함께 입력해 주세요.');
            }
          }
        }}
      />

      <SafeAreaView style={styles.topArea} pointerEvents="box-none">
        <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#52645E" />
            <TextInput
              value={destinationName}
              onChangeText={setDestinationName}
              onSubmitEditing={() => void searchDestination()}
              placeholder={destination && !destinationName ? '지도에서 선택한 위치' : '목적지 또는 주소 입력'}
              placeholderTextColor={destination && !destinationName ? '#167C5A' : '#71817B'}
              onFocus={() => {
                if (destinationName === '지도에서 선택한 위치') {
                  setDestinationName('');
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
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
            accessibilityRole="button"
            accessibilityLabel={username ? '계정 메뉴 열기' : '로그인'}
            style={[styles.accountButton, username && styles.accountButtonLoggedIn]}
            onPress={openAccount}>
            <Ionicons name={username ? 'person' : 'log-in-outline'} size={username ? 24 : 19} color="#FFFFFF" />
            {!username && <Text style={styles.accountText}>로그인</Text>}
          </Pressable>
        </View>
        {searchError && <Text style={styles.searchError}>{searchError}</Text>}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.slice(0, 6).map((place) => (
              <Pressable
                key={place.id}
                style={styles.searchResultItem}
                onPress={() => chooseDestination({ latitude: place.latitude, longitude: place.longitude }, place.name)}>
                <Ionicons name="location-outline" size={20} color="#167C5A" />
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultName}>{place.name}</Text>
                  <Text style={styles.searchResultAddress} numberOfLines={1}>
                    {place.roadAddress || place.address}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>

      <Modal visible={accountMenuVisible} transparent animationType="fade" onRequestClose={() => setAccountMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setAccountMenuVisible(false)}>
          <Pressable style={[styles.accountMenu, { top: insets.top + 72 }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}><Ionicons name="person" size={23} color="#FFFFFF" /></View>
              <View><Text style={styles.menuGreeting}>안녕하세요</Text><Text style={styles.menuUsername}>{username}</Text></View>
            </View>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => { setAccountMenuVisible(false); router.push('/my-page' as Href); }}>
              <Ionicons name="person-circle-outline" size={23} color="#263D35" />
              <Text style={styles.menuItemText}>마이페이지</Text>
              <Ionicons name="chevron-forward" size={18} color="#8A9893" />
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setAccountMenuVisible(false); router.push('/settings' as Href); }}>
              <Ionicons name="settings-outline" size={22} color="#263D35" />
              <Text style={styles.menuItemText}>설정</Text>
              <Ionicons name="chevron-forward" size={18} color="#8A9893" />
            </Pressable>
            <Pressable style={styles.menuItem} onPress={logout}>
              <Ionicons name="log-out-outline" size={22} color="#B42318" />
              <Text style={[styles.menuItemText, styles.logoutText]}>로그아웃</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
                <Text style={[styles.profileDescription, selected && styles.profileDescriptionActive]}>
                  {item.description}
                </Text>
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
  accountButtonLoggedIn: { width: 52, paddingHorizontal: 0 },
  accountText: { color: '#FFFFFF', fontWeight: '800', maxWidth: 65 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(12, 28, 22, 0.28)' },
  accountMenu: { position: 'absolute', right: 14, width: 232, padding: 10, borderRadius: 18, backgroundColor: '#FFFFFF', elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9 },
  menuAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#167C5A' },
  menuGreeting: { color: '#71817B', fontSize: 11 },
  menuUsername: { maxWidth: 145, marginTop: 2, color: '#14251F', fontSize: 15, fontWeight: '900' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 5, backgroundColor: '#DCE7E2' },
  menuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, borderRadius: 12 },
  menuItemText: { flex: 1, color: '#263D35', fontSize: 14, fontWeight: '700' },
  logoutText: { color: '#B42318' },
  searchError: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    color: '#B42318',
    backgroundColor: '#FFF3F1',
  },
  searchResults: {
    marginHorizontal: 14,
    marginTop: 6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    elevation: 7,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  searchResultItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE7E2',
  },
  searchResultText: { flex: 1 },
  searchResultName: { color: '#14251F', fontWeight: '800', fontSize: 14 },
  searchResultAddress: { color: '#71817B', fontSize: 12, marginTop: 3 },
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
