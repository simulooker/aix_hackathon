import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KakaoMap, type KakaoPlace } from '@/src/components/KakaoMap';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { DEFAULT_REGION } from '@/src/constants/map';
import { useLiveBuses } from '@/src/features/bus/useLiveBuses';
import { useCurrentLocation } from '@/src/features/location/useCurrentLocation';
import { getNearbyHazards } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/auth-store';
import { usePreferencesStore } from '@/src/stores/preferences-store';
import { useRouteStore } from '@/src/stores/route-store';
import type { BusStop, LiveBus } from '@/src/types/bus';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint } from '@/src/types/route';

const EMPTY_STOPS: BusStop[] = [];
const EMPTY_BUSES: LiveBus[] = [];

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const username = useAuthStore((state) => state.username);
  const clearUser = useAuthStore((state) => state.clearUser);
  const showHazards = usePreferencesStore((state) => state.showHazards);
  const showLiveBuses = usePreferencesStore((state) => state.showLiveBuses);
  const setShowLiveBuses = usePreferencesStore((state) => state.setShowLiveBuses);
  const preferencesInitialized = usePreferencesStore((state) => state.initialized);
  const routeProfile = usePreferencesStore((state) => state.routeProfile);
  const { coordinates, error, loading, initialized: locationInitialized, refresh } = useCurrentLocation();
  const {
    route,
    fetchRoute,
    clearRoute,
    loading: routeLoading,
    error: routeError,
  } = useRouteStore();

  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [origin, setOrigin] = useState<RoutePoint>();
  const [originName, setOriginName] = useState('현재 위치');
  const [destination, setDestination] = useState<RoutePoint>();
  const [mapCenter, setMapCenter] = useState<RoutePoint>();
  const [destinationName, setDestinationName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchRequest, setSearchRequest] = useState<{ query: string; requestId: number }>();
  const [searchResults, setSearchResults] = useState<KakaoPlace[]>([]);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const profilePromptShown = useRef(false);

  const {
    stops: busStops,
    buses,
    loading: busesLoading,
    error: busError,
  } = useLiveBuses(coordinates, showLiveBuses);

  // 매 렌더마다 새 배열을 넘기면 지도 WebView 가 불필요하게 다시 그려진다.
  const visibleBusStops = useMemo(() => (showLiveBuses ? busStops : EMPTY_STOPS), [busStops, showLiveBuses]);
  const visibleBuses = useMemo(() => (showLiveBuses ? buses : EMPTY_BUSES), [buses, showLiveBuses]);

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

  useEffect(() => {
    if (!coordinates || destination || mapCenter) return;
    setMapCenter(coordinates);
    setRecenterRequest((value) => value + 1);
  }, [coordinates, destination, mapCenter]);

  useEffect(() => {
    if (!username) {
      profilePromptShown.current = false;
      return;
    }
    if (!preferencesInitialized || routeProfile || profilePromptShown.current) return;
    profilePromptShown.current = true;
    Alert.alert(
      '사용자 유형을 정해 주세요',
      '프로필 → 마이페이지 → 사용자 유형 설정에서 이용자 유형을 선택해 주세요.',
      [
        { text: '나중에', style: 'cancel' },
        { text: '마이페이지로 이동', onPress: () => router.push('/my-page' as Href) },
      ],
    );
  }, [preferencesInitialized, routeProfile, router, username]);

  const chooseDestination = (point: RoutePoint, label?: string) => {
    Keyboard.dismiss();
    setDestination(point);
    setMapCenter(point);
    if (clearRoute) clearRoute(); // 새 목적지 선택 시 이전 경로선 즉시 삭제

    if (label && label !== '지도에서 선택한 위치') {
      setDestinationName(label);
    } else {
      setDestinationName('');
    }
    setSearchText('');
    setSearchError(undefined);
    setSearchResults([]);
    setSearchRequest(undefined);
    setSearching(false);
  };

  const chooseOrigin = (point: RoutePoint, label: string) => {
    Keyboard.dismiss();
    setOrigin(point);
    setOriginName(label);
    setMapCenter(point);
    setSearchText('');
    clearRoute?.();
    setSearchError(undefined);
    setSearchResults([]);
    setSearchRequest(undefined);
    setSearching(false);
  };

  const searchDestination = async () => {
    const query = searchText.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(undefined);
    Keyboard.dismiss();
    setSearchResults([]);
    setSearchRequest({ query, requestId: Date.now() });
  };

  const findRoute = async () => {
    const routeOrigin = origin ?? coordinates;
    if (!routeOrigin || !destination) return;
    if (!routeProfile) {
      Alert.alert('사용자 유형을 정해 주세요', '마이페이지에서 이용자 유형을 먼저 설정해 주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '마이페이지로 이동', onPress: () => router.push('/my-page' as Href) },
      ]);
      return;
    }
    const result = await fetchRoute(routeOrigin, destination);
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

  const moveToCurrentLocation = async () => {
    const latest = await refresh();
    if (latest) {
      setMapCenter(latest);
      setRecenterRequest((value) => value + 1);
    }
  };

  const openReport = () => {
    if (!username) {
      Alert.alert('로그인이 필요합니다', '위험사진 제보는 로그인한 사용자만 이용할 수 있습니다.', [
        { text: '취소', style: 'cancel' },
        { text: '로그인', onPress: () => router.push('/login' as Href) },
      ]);
      return;
    }
    router.push('/report/camera' as Href);
  };

  if (!locationInitialized) {
    return (
      <SafeAreaView style={styles.locationLoadingContainer}>
        <ActivityIndicator size="large" color="#167C5A" />
        <Text style={styles.locationLoadingTitle}>현재 위치를 확인하고 있습니다</Text>
        <Text style={styles.locationLoadingText}>잠시만 기다려 주세요.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <KakaoMap
        style={styles.map}
        center={mapCenter ?? destination ?? coordinates ?? DEFAULT_REGION}
        currentLocation={coordinates}
        origin={origin}
        destination={destination}
        hazards={showHazards ? hazards : []}
        route={route?.geometry}
        busStops={visibleBusStops}
        buses={visibleBuses}
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
        recenterRequest={recenterRequest}
      />

      <SafeAreaView style={styles.topArea} pointerEvents="box-none">
        <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#52645E" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => void searchDestination()}
              placeholder="장소 또는 주소 검색"
              placeholderTextColor="#71817B"
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
          <ScrollView
            style={styles.searchResults}
            contentContainerStyle={styles.searchResultsContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled>
            {searchResults.map((place) => (
              <View
                key={place.id}
                style={styles.searchResultItem}>
                <Ionicons name="location-outline" size={20} color="#167C5A" />
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultName}>{place.name}</Text>
                  <Text style={styles.searchResultAddress} numberOfLines={1}>
                    {place.roadAddress || place.address}
                  </Text>
                  {place.distanceM != null && (
                    <Text style={styles.searchResultDistance}>
                      {place.distanceM < 1000 ? `${Math.round(place.distanceM)}m` : `${(place.distanceM / 1000).toFixed(1)}km`} 거리
                    </Text>
                  )}
                </View>
                <View style={styles.searchResultActions}>
                  <Pressable
                    style={[styles.placeActionButton, styles.originButton]}
                    onPress={() => chooseOrigin({ latitude: place.latitude, longitude: place.longitude }, place.name)}>
                    <Text style={styles.originButtonText}>출발</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.placeActionButton, styles.destinationButton]}
                    onPress={() => chooseDestination({ latitude: place.latitude, longitude: place.longitude }, place.name)}>
                    <Text style={styles.destinationButtonText}>도착</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
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

      <View
        style={[styles.busToggleWrap, { bottom: insets.bottom + 12 + panelHeight + 12 }]}
        pointerEvents="box-none">
        {showLiveBuses && busError && <Text style={styles.busError}>{busError}</Text>}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: showLiveBuses }}
          accessibilityLabel={showLiveBuses ? '실시간 버스 위치 끄기' : '실시간 버스 위치 켜기'}
          style={[styles.busToggle, showLiveBuses && styles.busToggleOn]}
          onPress={() => setShowLiveBuses(!showLiveBuses)}>
          {showLiveBuses && busesLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="bus" size={22} color={showLiveBuses ? '#FFFFFF' : '#40534C'} />
          )}
          <Text style={[styles.busToggleText, showLiveBuses && styles.busToggleTextOn]}>
            실시간 버스
          </Text>
        </Pressable>
      </View>

      <View
        style={[styles.panel, { bottom: insets.bottom + 12 }]}
        onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.title}>안전 경로</Text>
            <Text style={styles.hint}>목적지를 선택하면 보행 경로를 안내해 드려요.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="현재 위치로 이동" style={styles.locationButton} onPress={() => void moveToCurrentLocation()}>
            <Ionicons name="locate" size={22} color="#167C5A" />
          </Pressable>
        </View>

        {loading && <Text style={styles.info}>현재 위치를 확인하고 있습니다.</Text>}
        <View style={styles.selectedPlaces}>
          <Text style={styles.selectedPlaceText} numberOfLines={1}>출발 · {originName}</Text>
          <Text style={styles.selectedPlaceText} numberOfLines={1}>도착 · {destination ? destinationName || '지도에서 선택한 위치' : '선택하지 않음'}</Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {routeError && <Text style={styles.error}>{routeError}</Text>}
        <PrimaryButton
          label={destination ? '안전 경로 찾기' : '목적지를 먼저 입력해 주세요'}
          onPress={() => void findRoute()}
          disabled={!destination || !(origin ?? coordinates)}
          loading={routeLoading}
        />
        <Pressable style={styles.reportButton} onPress={openReport}>
          <Ionicons name="camera-outline" size={20} color="#167C5A" />
          <Text style={styles.reportText}>위험사진 제보</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E7EFEB' },
  locationLoadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F7FAF8' },
  locationLoadingTitle: { marginTop: 8, color: '#14251F', fontSize: 18, fontWeight: '800' },
  locationLoadingText: { color: '#65756F', fontSize: 13 },
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
    maxHeight: 350,
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
  searchResultsContent: { paddingBottom: 4 },
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
  searchResultDistance: { color: '#167C5A', fontSize: 11, fontWeight: '700', marginTop: 2 },
  searchResultActions: { gap: 5 },
  placeActionButton: { minWidth: 46, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  originButton: { backgroundColor: '#E8F1FF' },
  originButtonText: { color: '#245EA8', fontSize: 12, fontWeight: '800' },
  destinationButton: { backgroundColor: '#167C5A' },
  destinationButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  busToggleWrap: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 6 },
  busToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 7,
  },
  busToggleOn: { backgroundColor: '#1F6FEB' },
  busToggleText: { color: '#40534C', fontSize: 13, fontWeight: '800' },
  busToggleTextOn: { color: '#FFFFFF' },
  busError: {
    maxWidth: 260,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    color: '#B42318',
    backgroundColor: '#FFF3F1',
    fontSize: 12,
    textAlign: 'right',
    overflow: 'hidden',
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
  info: { color: '#52645E', fontSize: 12 },
  selectedPlaces: { gap: 4, padding: 10, borderRadius: 12, backgroundColor: '#F2F7F4' },
  selectedPlaceText: { color: '#40534C', fontSize: 12, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 12 },
  reportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
  reportText: { color: '#167C5A', fontWeight: '800' },
});
